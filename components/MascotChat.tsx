"use client";
import { useEffect, useRef, useState } from "react";
import { ensureAnonSession } from "@/lib/supabase/anon";
import { getBrowserClient } from "@/lib/supabase/browser";

// Bespoke, blog-native AI chat. Streams from /api/chat (server-side KB grounding +
// rate-limit + anon auth), is article-aware, cites blog posts, and suggests follow-ups.
// Opened by the mascot via window._toggleMascotChat. Styled with .bchat-* in globals.css.

const TOPICS = ["career", "the book", "fintech", "agile", "mentoring", "certifications"];
const ARTICLE_CHIPS = ["Summarize this", "Key takeaways", "Why does this matter?"];
const CAT_FOLLOW_UPS: Record<string, string[]> = {
  identity: ["career journey", "certifications", "the book", "mentoring"],
  career: ["certifications", "education", "skills", "conferences"],
  cert: ["agile", "career", "education", "data"],
  book: ["conferences", "mentoring", "testimonials", "writing process"],
  conf: ["the book", "fintech", "career", "speaking"],
  skill: ["certifications", "career", "data", "agile"],
  mentor: ["testimonials", "contact", "impact", "career"],
  contact: ["mentoring", "linkedin", "career", "speaking"],
  testimonial: ["mentoring", "career", "the book", "leadership"],
  edu: ["certifications", "career", "digital transformation", "skills"],
  impact: ["career", "mentoring", "certifications", "conferences"],
  org: ["career", "fintech", "community", "banking"],
};
function followUps(cats: string[]): string[] {
  const out = new Set<string>();
  cats.forEach((c) => (CAT_FOLLOW_UPS[c] || []).forEach((f) => out.add(f)));
  return [...out].slice(0, 4);
}

interface Source { slug: string; title: string }
interface Msg { role: "user" | "assistant"; text: string; html?: string; sources?: Source[]; error?: boolean }
interface Limits { daily: number; dailyMax: number }

// Markdown rendered only after a reply completes; marked + sanitizer loaded on demand.
let _marked: ((s: string) => string) | null = null;
let _sanitize: ((s: string) => string) | null = null;
async function renderMarkdown(text: string): Promise<string> {
  try {
    if (!_marked) {
      const m = await import("marked");
      _marked = (s: string) => m.marked.parse(s, { async: false }) as string;
    }
    if (!_sanitize) {
      const d = await import("isomorphic-dompurify");
      _sanitize = (s: string) => d.default.sanitize(s);
    }
    return _sanitize(_marked(text));
  } catch {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
  }
}

function articlePageContext(): string {
  if (!location.pathname.startsWith("/p/")) return "";
  const h1 = document.querySelector("h1.lb-article-h1")?.textContent?.trim() || document.title;
  const ex =
    (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content ||
    document.querySelector(".lb-article-excerpt")?.textContent?.trim() ||
    "";
  return [h1, ex].filter(Boolean).join(" — ").slice(0, 600);
}

async function findSources(q: string): Promise<Source[]> {
  try {
    const sb = getBrowserClient();
    let { data } = await sb
      .from("longform_articles")
      .select("slug,title")
      .eq("published", true)
      .textSearch("search_vector", q, { type: "websearch" })
      .limit(3);
    if (!data || !data.length) {
      const kw = q.split(/\s+/).filter((w) => w.length > 4).sort((a, b) => b.length - a.length)[0];
      if (kw) {
        const r = await sb.from("longform_articles").select("slug,title").eq("published", true).ilike("title", `%${kw}%`).limit(3);
        data = r.data;
      }
    }
    return (data || []) as Source[];
  } catch {
    return [];
  }
}

const HISTORY_KEY = "amr_chat_history";

export default function MascotChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const histRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);

  // Open hooks for the mascot.
  useEffect(() => {
    const w = window as Window & { _toggleMascotChat?: () => void; _openMascotChat?: () => void };
    w._toggleMascotChat = () => setOpen((o) => !o);
    w._openMascotChat = () => setOpen(true);
    const onEvt = () => setOpen((o) => !o);
    window.addEventListener("mascot:toggle-chat", onEvt);
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(saved)) histRef.current = saved.slice(-20);
    } catch {}
    return () => window.removeEventListener("mascot:toggle-chat", onEvt);
  }, []);

  // On open: suggestions + focus; Esc + outside-click to close.
  useEffect(() => {
    if (!open) return;
    setSuggestions(location.pathname.startsWith("/p/") ? ARTICLE_CHIPS : TOPICS);
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (panelRef.current?.contains(tgt)) return;
      if (document.querySelector(".mascot-float")?.contains(tgt)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // delay outside-click so the opening click doesn't immediately close it
    const dt = setTimeout(() => document.addEventListener("click", onDoc), 50);
    return () => {
      clearTimeout(t);
      clearTimeout(dt);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDoc);
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, streaming]);

  const updateLast = (patch: Partial<Msg>) =>
    setMsgs((m) => {
      if (!m.length) return m;
      const copy = [...m];
      copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch };
      return copy;
    });

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || streamingRef.current) return;
    setInput("");
    setSuggestions([]);
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setStreaming(true);
    streamingRef.current = true;
    try {
      const w = window as Window & { _ensureChatAuth?: () => Promise<unknown> };
      if (w._ensureChatAuth) await w._ensureChatAuth();
      else await ensureAnonSession();

      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q.slice(0, 500), history: histRef.current.slice(-10), pageContext: articlePageContext() }),
      });

      const dMax = parseInt(res.headers.get("x-ratelimit-daily-max") || "25", 10);
      const dUsed = parseInt(res.headers.get("x-ratelimit-daily") || "0", 10);
      setLimits({ daily: dUsed, dailyMax: dMax });

      if (res.status === 429) {
        updateLast({ text: "You've reached your message limit — it resets automatically. Try again later!", error: true });
        return;
      }
      if (!res.ok || !res.body) {
        updateLast({ text: "I couldn't reach the AI just now. Please try again in a moment.", error: true });
        return;
      }
      const cats = (res.headers.get("x-kb-cats") || "").split(",").map((s) => s.trim()).filter(Boolean);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data: ")) continue;
          const d = t.slice(6);
          if (d === "[DONE]") continue;
          try {
            const c = JSON.parse(d).choices?.[0]?.delta?.content;
            if (c) {
              full += c;
              updateLast({ text: full });
            }
          } catch {}
        }
      }

      if (!full.trim()) {
        updateLast({ text: "I don't have an answer for that yet — try one of the topics below!", error: true });
      } else {
        const [html, sources] = await Promise.all([renderMarkdown(full), findSources(q)]);
        updateLast({ text: full, html, sources });
        histRef.current.push({ role: "user", content: q }, { role: "assistant", content: full });
        histRef.current = histRef.current.slice(-20);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(histRef.current));
        } catch {}
      }
      setSuggestions(followUps(cats));
    } catch {
      updateLast({ text: "Something went wrong. Please try again.", error: true });
    } finally {
      setStreaming(false);
      streamingRef.current = false;
    }
  }

  const newChat = () => {
    setMsgs([]);
    histRef.current = [];
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
    setSuggestions(location.pathname.startsWith("/p/") ? ARTICLE_CHIPS : TOPICS);
  };

  if (!open) return null;
  const showWelcome = msgs.length === 0;
  return (
    <div className="bchat-panel" ref={panelRef} role="dialog" aria-label="Chat with ElharonyClaw">
      <div className="bchat-bar" />
      <header className="bchat-header">
        <div className="bchat-avatar" aria-hidden="true">✦</div>
        <div className="bchat-id">
          <h3>ElharonyClaw</h3>
          <p>Ask about fintech, the book, agile &amp; more</p>
        </div>
        <button className="bchat-icon" onClick={newChat} title="New chat" aria-label="New chat">＋</button>
        <button className="bchat-icon" onClick={() => setOpen(false)} title="Close" aria-label="Close chat">×</button>
      </header>

      <div className="bchat-msgs" ref={scrollRef}>
        {showWelcome && (
          <div className="bchat-msg bchat-msg-bot">
            Hi! I&apos;m <strong>ElharonyClaw</strong>, Amr&apos;s AI assistant. I can answer from his work in fintech,
            digital banking, agile delivery, his book &ldquo;The Bilingual Executive&rdquo;
            {typeof location !== "undefined" && location.pathname.startsWith("/p/") ? " — or this article you're reading" : ""}. What would you like to know?
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"bchat-msg " + (m.role === "user" ? "bchat-msg-user" : "bchat-msg-bot") + (m.error ? " bchat-err" : "")}>
            {m.role === "assistant" && i === msgs.length - 1 && streaming && !m.text ? (
              <span className="bchat-typing"><span /><span /><span /></span>
            ) : m.html ? (
              <>
                <div className="bchat-md" dangerouslySetInnerHTML={{ __html: m.html }} />
                {m.sources && m.sources.length > 0 && (
                  <div className="bchat-sources">
                    <span className="bchat-sources-label">Related reading</span>
                    {m.sources.map((s) => (
                      <a key={s.slug} href={`/p/${s.slug}`} className="bchat-source">{s.title}</a>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <span>{m.text}{m.role === "assistant" && streaming && i === msgs.length - 1 ? <span className="bchat-cursor" /> : null}</span>
            )}
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <div className="bchat-chips">
          {suggestions.map((s) => (
            <button key={s} className="bchat-chip" onClick={() => send(s)} disabled={streaming}>{s}</button>
          ))}
        </div>
      )}

      <form
        className="bchat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={inputRef}
          className="bchat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything…"
          maxLength={500}
          aria-label="Message"
        />
        <button className="bchat-send" type="submit" disabled={streaming || !input.trim()} aria-label="Send">➤</button>
      </form>

      <div className="bchat-foot">
        <span className="bchat-badge">GLM · KB-grounded</span>
        {limits && <span>{limits.daily}/{limits.dailyMax} today</span>}
      </div>
    </div>
  );
}
