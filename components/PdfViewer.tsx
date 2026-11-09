"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

// Inline, mobile-friendly PDF viewer for an article's attached PDF (pdf_url).
// pdfjs-dist is imported dynamically INSIDE the effect so it never runs on the
// server and never ships to pages without a PDF. The worker is self-hosted at
// /pdf.worker.min.mjs (copied from node_modules at install time) — robust under
// Turbopack, matching the existing public/particle-worker.js pattern.
//
// Pages render lazily on scroll (IntersectionObserver) and are RECYCLED when far
// off-screen (canvas backing store freed) so a long PDF stays bounded in memory
// on mobile. Each canvas keeps a CSS aspect-ratio so freeing it never shifts
// layout. DPR is capped at 2 to bound per-page pixel count. A ResizeObserver
// re-renders the visible pages at the new width on rotation/resize.
//
// The toolbar (Download / Open) renders regardless of load state so a failed
// render never strands the reader. Because the PDF is cross-origin (the agent's
// VPS), the HTML `download` attribute is ignored by browsers — so Download
// fetches the bytes (CORS is already required for pdf.js) and saves a blob with
// the intended filename, falling back to opening in a new tab.
export default function PdfViewer({ url, name }: { url: string; name?: string | null }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const label = name || "document.pdf";

  useEffect(() => {
    let cancelled = false;
    const container = pagesRef.current;
    if (!container) return;

    let loadingTask: PDFDocumentLoadingTask | null = null;
    let doc: PDFDocumentProxy | null = null;
    let observer: IntersectionObserver | null = null;
    let resizeObs: ResizeObserver | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const canvases: HTMLCanvasElement[] = [];
    const rendered: boolean[] = [];
    const tasks = new Map<number, RenderTask>();
    const visible = new Set<number>();
    // Pages reserved synchronously before their getPage() await, so a concurrent
    // renderPage(n) during that await window bails at the guard instead of starting
    // a duplicate render() on the same canvas (which throws + orphans the first task).
    const inFlight = new Set<number>();
    // Cap DPR so a dpr=3 phone doesn't allocate ~2.25x the pixels per page.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    setStatus("loading");
    container.innerHTML = "";

    // Free a page's backing store (cancel any in-flight render). The CSS
    // aspect-ratio set on the canvas keeps its laid-out height, so this never
    // collapses the page and shifts scroll position.
    function release(n: number) {
      const task = tasks.get(n);
      if (task) {
        try {
          task.cancel();
        } catch {
          /* already settled */
        }
        tasks.delete(n);
      }
      const c = canvases[n - 1];
      if (c) {
        c.width = 0;
        c.height = 0;
      }
      rendered[n - 1] = false;
    }

    async function renderPage(n: number) {
      if (cancelled || !doc || rendered[n - 1] || tasks.has(n) || inFlight.has(n)) return;
      const canvas = canvases[n - 1];
      if (!canvas) return;
      inFlight.add(n); // reserve BEFORE the first await so a concurrent call bails at the guard
      try {
        const page = await doc.getPage(n).catch(() => null);
        if (!page || cancelled || !visible.has(n)) return; // failed, or scrolled away while loading
        const unscaled = page.getViewport({ scale: 1 });
        const width = container?.clientWidth || 800;
        const viewport = page.getViewport({ scale: (width / unscaled.width) * dpr });
        canvas.style.aspectRatio = `${unscaled.width} / ${unscaled.height}`;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const task = page.render({ canvas, viewport });
        tasks.set(n, task);
        try {
          await task.promise;
          rendered[n - 1] = true;
        } catch {
          /* cancelled or failed — leave un-rendered */
        } finally {
          tasks.delete(n);
          if (!cancelled && !visible.has(n)) release(n); // finished after it scrolled away
        }
      } finally {
        inFlight.delete(n); // cleared only here (NOT in release) — clearing on release
        // would let a re-enter slip a 2nd render past the guard while this one awaits
      }
    }

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return; // unmounted during the dynamic import
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        // rendererSrc (pdfjs >= 6.5's optional renderer worker) is left unset, so
        // pages draw on the main thread. Enabling it means self-hosting and
        // syncing build/pdf.renderer.min.mjs too, like the worker above.

        // PDF JavaScript only runs through pdf.js's scripting sandbox (the
        // viewer's `enableScripting`, GHSA-hq66-cqwq-w95j). This component uses
        // the core API only (getDocument + page.render) and never loads that
        // sandbox, so an agent-hosted PDF's scripts are never executed. Keep it so.
        loadingTask = pdfjs.getDocument({ url });
        doc = await loadingTask.promise;
        if (cancelled) return;

        // Default aspect-ratio from page 1 so placeholders take realistic page
        // height up front (sharper lazy-render granularity, no layout shift).
        let ratio = "612 / 792";
        try {
          const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
          ratio = `${vp.width} / ${vp.height}`;
        } catch {
          /* keep default */
        }
        if (cancelled) return;

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const n = Number((entry.target as HTMLCanvasElement).dataset.page);
              if (entry.isIntersecting) {
                visible.add(n);
                void renderPage(n);
              } else {
                visible.delete(n);
                release(n);
              }
            }
          },
          { rootMargin: "300px 0px" },
        );

        for (let n = 1; n <= doc.numPages; n++) {
          const canvas = document.createElement("canvas");
          canvas.className = "lb-pdf-page";
          canvas.dataset.page = String(n);
          canvas.style.aspectRatio = ratio;
          canvas.setAttribute("aria-label", `PDF page ${n}`);
          container.appendChild(canvas);
          canvases.push(canvas);
          rendered.push(false);
          observer.observe(canvas);
        }

        // Re-render the visible pages at the new width on rotation / resize.
        let lastWidth = container.clientWidth;
        resizeObs = new ResizeObserver(() => {
          const w = container.clientWidth;
          if (Math.abs(w - lastWidth) < 4) return;
          lastWidth = w;
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (cancelled || !doc) return;
            for (let n = 1; n <= doc.numPages; n++) release(n);
            const renderVisible = () => {
              for (const n of visible) void renderPage(n);
            };
            renderVisible();
            // release() cancels in-flight renders, but each one's `inFlight` flag
            // clears only after the cancelled render unwinds (a microtask later), so
            // the renderPage() calls above bail for those pages and leave them blank.
            // Retry on the next macrotask, once inFlight has drained.
            setTimeout(renderVisible, 0);
          }, 150);
        });
        resizeObs.observe(container);

        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      observer?.disconnect();
      resizeObs?.disconnect();
      tasks.forEach((t) => {
        try {
          t.cancel();
        } catch {
          /* already settled */
        }
      });
      tasks.clear();
      loadingTask?.destroy();
      if (container) container.innerHTML = "";
    };
  }, [url]);

  // Cross-origin `download` is ignored by browsers, so fetch the bytes (CORS is
  // already required for pdf.js) and save a blob with the intended filename.
  // Falls back to opening the URL if the fetch is blocked.
  async function downloadPdf(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = label;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 2000);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="lb-pdf-embed lb-reveal">
      <div className="lb-pdf-toolbar">
        <span className="lb-pdf-title">
          <i className="fa-solid fa-file-pdf" aria-hidden="true" /> {label}
        </span>
        <span className="lb-pdf-actions">
          <a href={url} onClick={downloadPdf}>
            <i className="fa-solid fa-download" aria-hidden="true" /> Download
          </a>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Open
          </a>
        </span>
      </div>
      {status === "loading" && <div className="lb-pdf-status">Loading PDF…</div>}
      {status === "error" && (
        <div className="lb-pdf-status">Couldn’t display this PDF. Use Download or Open above.</div>
      )}
      <div ref={pagesRef} className="lb-pdf-pages" />
    </div>
  );
}
