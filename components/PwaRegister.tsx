"use client";
import { useEffect } from "react";

// Registers public/sw.js exactly as the Next 16 PWA guide prescribes
// (updateViaCache: 'none' so a deployed SW update is always fetched fresh).
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        /* registration is best-effort — the site works fully without it */
      });
  }, []);
  return null;
}
