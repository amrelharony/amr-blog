// Microblog content formatting, ported from Js/microblog.js (fmtContent/renderMd).
// Content is admin-authored (RLS: only admin can insert), escaped first, so the
// controlled-tag HTML is safe to inject. Spoilers use an inline onclick toggle.
import { esc } from "@/lib/format";

export function relTime(d: string): string {
  const s = Math.floor(Math.max(0, Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const dy = Math.floor(h / 24);
  if (dy < 7) return dy + "d ago";
  if (dy < 30) return Math.floor(dy / 7) + "w ago";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function readingTime(text: string | null | undefined): string {
  const w = (text || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(w / 200)) + " min read";
}

function renderMd(s: string): string {
  s = s.replace(
    /\|\|\|([\s\S]*?)\|\|\|/g,
    "<div class=\"blog-spoiler\" onclick=\"this.classList.toggle('revealed')\"><div class=\"blog-spoiler-body\">$1</div></div>",
  );
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/`(.+?)`/g, "<code>$1</code>");
  s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
  return s;
}

export function fmtContent(raw: string): string {
  let s = esc(raw);
  // Extract fenced code blocks to placeholders BEFORE any inline/link/hashtag pass, so
  // their contents (which may hold **, `, ~~, http://, #foo) aren't reinterpreted as markup.
  // The <!--CBn--> sentinel is collision-proof: esc() has turned every user '<' into &lt;,
  // so a raw '<' can only be one we inserted here, and no transform regex below matches it.
  const codeBlocks: string[] = [];
  s = s.replace(/```([\s\S]*?)```/g, (_m, code: string) => {
    codeBlocks.push("<pre>" + code.trim() + "</pre>");
    return "<!--CB" + (codeBlocks.length - 1) + "-->";
  });
  s = renderMd(s);
  // Don't turn a URL fragment (e.g. /wiki/Foo#History) into a hashtag: only match a '#'
  // that isn't preceded by URL-ish characters, so the bare-URL autolink below still sees
  // the whole link. Standalone "#tag" (line start / after whitespace) still matches.
  s = s.replace(/(?<![\w\/#?&=.-])#(\w+)/g, '<span class="hashtag" data-tag="$1">#$1</span>');
  s = s.replace(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})(?:[^\s<]*)/g,
    '<div class="blog-yt-embed"><iframe src="https://www.youtube-nocookie.com/embed/$1" allowfullscreen loading="lazy"></iframe></div>',
  );
  s = s.replace(
    /(?<!["=])(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">$1</a>',
  );
  // Restore the extracted code blocks, now that no further pass will touch them.
  s = s.replace(/<!--CB(\d+)-->/g, (_m, i: string) => codeBlocks[Number(i)] ?? "");
  return s;
}
