"use client";
import { useRef, useState, useSyncExternalStore } from "react";

// Copy-link + native Web Share buttons for the article share panel. Rendered
// alongside the plain share anchors; the native-share button appears only on
// browsers that implement navigator.share (mostly mobile). Styling reuses the
// existing .lb-share-icon / .copied classes from blog.css.

// Hydration-safe capability probe: false on the server, real value on the client.
const noopSubscribe = () => () => {};
function useCanShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
}

export default function ShareActions({
  url,
  title,
  text,
}: {
  url: string;
  title: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  const canShare = useCanShare();
  const timer = useRef<number | undefined>(undefined);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context);
      // fall back to the legacy hidden-textarea approach.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      ta.remove();
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        className={"lb-share-icon copylink" + (copied ? " copied" : "")}
        onClick={copy}
        title={copied ? "Copied!" : "Copy link"}
        aria-label="Copy link"
      >
        <i className={copied ? "fa-solid fa-check" : "fa-solid fa-link"} aria-hidden="true" />
      </button>
      {canShare && (
        <button
          type="button"
          className="lb-share-icon nativeshare"
          onClick={() => navigator.share({ title, text, url }).catch(() => {})}
          title="Share…"
          aria-label="Share via your device"
        >
          <i className="fa-solid fa-share-nodes" aria-hidden="true" />
        </button>
      )}
      <span className="lb-visually-hidden" role="status">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </>
  );
}
