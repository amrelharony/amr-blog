"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

// Inline, mobile-friendly PDF viewer for an article's attached PDF (pdf_url).
// pdfjs-dist is imported dynamically INSIDE the effect so it never runs on the
// server and never ships to pages without a PDF. The worker is self-hosted at
// /pdf.worker.min.mjs (copied from node_modules at install time) — the robust
// choice under Turbopack, matching the existing public/particle-worker.js
// pattern. Pages render lazily on scroll (IntersectionObserver) so a long PDF
// stays light on mobile. The toolbar (download / open) renders regardless of
// load state so a failed render never strands the reader.
export default function PdfViewer({ url, name }: { url: string; name?: string | null }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const container = pagesRef.current;
    if (!container) return;

    const renderTasks: RenderTask[] = [];
    let observer: IntersectionObserver | null = null;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let doc: PDFDocumentProxy | null = null;

    setStatus("loading");
    container.innerHTML = "";

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        loadingTask = pdfjs.getDocument({ url });
        doc = await loadingTask.promise;
        if (cancelled) return;

        observer = new IntersectionObserver(
          (entries, obs) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const canvas = entry.target as HTMLCanvasElement;
              obs.unobserve(canvas);
              const n = Number(canvas.dataset.page);
              void renderPage(n, canvas);
            }
          },
          { rootMargin: "200px 0px" },
        );

        // One placeholder canvas per page; render only when scrolled near.
        for (let n = 1; n <= doc.numPages; n++) {
          const canvas = document.createElement("canvas");
          canvas.className = "lb-pdf-page";
          canvas.dataset.page = String(n);
          canvas.setAttribute("aria-label", `PDF page ${n}`);
          container.appendChild(canvas);
          observer.observe(canvas);
        }
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    async function renderPage(n: number, canvas: HTMLCanvasElement) {
      if (cancelled || !doc) return;
      try {
        const page = await doc.getPage(n);
        if (cancelled) return;
        const unscaled = page.getViewport({ scale: 1 });
        const width = container?.clientWidth || 800;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: (width / unscaled.width) * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const task = page.render({ canvas, viewport });
        renderTasks.push(task);
        await task.promise;
      } catch {
        // A cancelled render (navigation/unmount) throws — safe to ignore.
      }
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      renderTasks.forEach((t) => {
        try {
          t.cancel();
        } catch {
          /* already settled */
        }
      });
      loadingTask?.destroy();
      if (container) container.innerHTML = "";
    };
  }, [url]);

  const label = name || "document.pdf";

  return (
    <div className="lb-pdf-embed lb-reveal">
      <div className="lb-pdf-toolbar">
        <span className="lb-pdf-title">
          <i className="fa-solid fa-file-pdf" aria-hidden="true" /> {label}
        </span>
        <span className="lb-pdf-actions">
          <a href={url} download={label}>
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
