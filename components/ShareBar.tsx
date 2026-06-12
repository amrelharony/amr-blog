"use client";
import { useEffect, useState } from "react";

// Native Web Share + copy-link buttons for the article share panel.
// navigator.share is feature-detected in an effect (not during render) so the
// server and first client render agree — avoids a hydration mismatch.
export default function ShareBar({
  url,
  title,
  text,
}: {
  url: string;
  title: string;
  text: string;
}) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const share = () => {
    navigator.share({ title, text, url }).catch(() => {});
  };

  const copy = () => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <>
      {canShare && (
        <button
          className="lb-share-icon native"
          type="button"
          onClick={share}
          title="Share"
          aria-label="Share"
        >
          <i className="fa-solid fa-share-nodes" aria-hidden="true" />
        </button>
      )}
      <button
        className={`lb-share-icon copylink${copied ? " copied" : ""}`}
        type="button"
        onClick={copy}
        title={copied ? "Link copied" : "Copy link"}
        aria-label={copied ? "Link copied" : "Copy link"}
      >
        <i className={`fa-solid ${copied ? "fa-check" : "fa-link"}`} aria-hidden="true" />
      </button>
    </>
  );
}
