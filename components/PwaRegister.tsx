"use client";
import { useEffect } from "react";

// Registers public/sw.js exactly as the Next 16 PWA guide prescribes
// (updateViaCache: 'none' so a deployed SW update is always fetched fresh).
//
// ?v= carries the build id (next.config.ts inlines NEXT_PUBLIC_SW_VERSION at
// build time). It is the worker's cache namespace: a deploy changes the script
// URL, the browser installs the new worker, and its activate handler drops the
// previous deploy's caches. Registering the bare "/sw.js" would leave the
// worker on its "dev" fallback namespace and caches would never rotate.
const VERSION = process.env.NEXT_PUBLIC_SW_VERSION || "dev";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(VERSION)}`, { scope: "/", updateViaCache: "none" })
      .catch(() => {
        /* registration is best-effort — the site works fully without it */
      });
  }, []);
  return null;
}
