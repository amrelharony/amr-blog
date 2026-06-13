"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onToast, type ToastDetail } from "@/lib/toast";
import { haptic } from "@/lib/haptics";

interface Item extends ToastDetail {
  id: number;
}

let seq = 0;

// Single global toaster, mounted in the admin layout. Listens for adm-toast
// events and renders auto-dismissing toasts via a body portal.
export default function AdminToaster() {
  const [items, setItems] = useState<Item[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const off = onToast((d) => {
      const id = ++seq;
      setItems((x) => [...x, { ...d, id }]);
      if (d.kind === "err") haptic.warning();
      else haptic.success();
      const t = setTimeout(() => {
        setItems((x) => x.filter((it) => it.id !== id));
        timers.current = timers.current.filter((x) => x !== t);
      }, 4000);
      timers.current.push(t);
    });
    const pending = timers;
    return () => {
      off();
      pending.current.forEach(clearTimeout);
      pending.current = [];
    };
  }, []);

  if (!mounted || items.length === 0) return null;

  return createPortal(
    <div className="adm-toast-wrap" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={"adm-toast " + t.kind}>
          {t.msg}
        </div>
      ))}
    </div>,
    document.body,
  );
}
