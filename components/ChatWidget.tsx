"use client";
import { useEffect } from "react";

// Embeds the OpenClaw chat widget — the same polished chat UI as amrelharony.com.
// The mascot opens it by clicking the (CSS-hidden) #amr-chat-bubble; styling lives in
// globals.css (#amr-chat-* overrides). Ports the main site's thinking-dots indicator
// (the widget's default typing is hidden via CSS) + close-on-outside-click.
type ChatWin = Window & { AmrChatConfig?: { whatsappNumber: string | null; apiUrl?: string }; gsap?: { to: (...a: unknown[]) => void } };

export default function ChatWidget() {
  useEffect(() => {
    const w = window as ChatWin;
    // Route the widget's API call through our same-origin proxy (the direct
    // chat.amrelharony.com call is CORS-blocked from the blog's origin).
    w.AmrChatConfig = w.AmrChatConfig || { whatsappNumber: null, apiUrl: "/api/openclaw" };
    w.AmrChatConfig.apiUrl = "/api/openclaw";
    if (!document.getElementById("amr-chat-widget-script")) {
      const s = document.createElement("script");
      s.id = "amr-chat-widget-script";
      s.src = "https://chat.amrelharony.com/widget/chat-widget.js";
      s.defer = true;
      document.body.appendChild(s);
    }

    let thinkingEl: HTMLElement | null = null;
    let waiting = false;
    let observer: MutationObserver | null = null;
    const cleanups: Array<() => void> = [];

    const hideThinking = () => {
      if (thinkingEl?.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);
      thinkingEl = null;
    };
    const showThinking = (c: HTMLElement) => {
      hideThinking();
      thinkingEl = document.createElement("div");
      thinkingEl.className = "amr-thinking-indicator";
      thinkingEl.innerHTML = "<span></span><span></span><span></span>";
      c.appendChild(thinkingEl);
      c.scrollTop = c.scrollHeight;
    };

    let tries = 0;
    const init = () => {
      const msgC = document.getElementById("amr-chat-messages");
      if (!msgC) {
        if (tries++ < 40) setTimeout(init, 500);
        return;
      }
      const send = document.getElementById("amr-chat-send");
      const input = document.getElementById("amr-chat-input") as HTMLInputElement | null;
      const arm = () => {
        if (input?.value?.trim()) {
          waiting = true;
          setTimeout(() => {
            if (waiting) showThinking(msgC);
          }, 200);
        }
      };
      if (send) {
        send.addEventListener("click", arm, true);
        cleanups.push(() => send.removeEventListener("click", arm, true));
      }
      if (input) {
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Enter" && !e.shiftKey) arm();
        };
        input.addEventListener("keydown", onKey, true);
        cleanups.push(() => input.removeEventListener("keydown", onKey, true));
      }
      observer = new MutationObserver((muts) => {
        muts.forEach((m) =>
          m.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && (node as Element).classList.contains("amr-msg-bot")) {
              const bot = node as HTMLElement;
              const iv = setInterval(() => {
                if (bot.textContent?.trim()) {
                  waiting = false;
                  hideThinking();
                  clearInterval(iv);
                }
              }, 50);
              setTimeout(() => {
                clearInterval(iv);
                hideThinking();
                waiting = false;
              }, 10000);
            }
          }),
        );
      });
      observer.observe(msgC, { childList: true });
    };
    init();

    const onDocClick = (e: MouseEvent) => {
      const panel = document.getElementById("amr-chat-panel");
      if (!panel) return;
      const s = getComputedStyle(panel);
      if (s.display === "none" || s.visibility === "hidden" || panel.offsetWidth === 0) return;
      const t = e.target as Node;
      if (panel.contains(t)) return;
      if (document.getElementById("amr-chat-bubble")?.contains(t)) return;
      if (document.querySelector(".mascot-float")?.contains(t)) return;
      (document.getElementById("amr-chat-close") as HTMLElement | null)?.click();
    };
    document.addEventListener("click", onDocClick);
    cleanups.push(() => document.removeEventListener("click", onDocClick));

    return () => {
      observer?.disconnect();
      cleanups.forEach((f) => f());
      hideThinking();
    };
  }, []);
  return null;
}
