// Minimal mock of the Supabase PostgREST endpoints the PUBLIC pages read.
// Lets us boot the real Next app (feed / thoughts / article) with deterministic
// content and zero secrets, so the device-preview check renders the genuine
// components + CSS instead of a hand-built mock-up.
//
// It only needs to satisfy the handful of reads in lib/queries/* :
//   • longform_articles  → array (feed/related/tag) or single object (maybeSingle)
//   • microblog          → array (thoughts)
//   • everything else     → [] (client reactions/comments degrade to empty state)
import { createServer } from "node:http";

export const MOCK_PORT = 54321;

// ── tiny inline SVG cover so cards show real imagery without any network ──
function cover(a, b, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient></defs>
    <rect width="1200" height="675" fill="url(#g)"/>
    <text x="60" y="600" font-family="monospace" font-size="40" fill="rgba(255,255,255,.85)">${label}</text>
  </svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

const now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();

const ARTICLE_CARDS = [
  { id: "a1", title: "Scaling Agile Across a FinTech Org Without the Theatre", slug: "preview-article",
    excerpt: "How we cut cycle time in half by deleting ceremonies, not adding them — a field report from three banking transformations.",
    created_at: iso(1), tags: ["Agile", "FinTech", "Leadership"], views: 1284,
    reactions: { like: 42, fire: 18 }, cover_image: cover("#0ea5e9", "#6366f1", "AGILE"), series_name: null },
  { id: "a2", title: "The Data Mesh Migration Nobody Warned Us About", slug: "data-mesh",
    excerpt: "Domain ownership sounds clean on a slide. Here is what actually broke, and the guardrails that saved the quarter.",
    created_at: iso(6), tags: ["Data", "Architecture"], views: 642,
    reactions: { like: 11 }, cover_image: cover("#a855f7", "#0c1018", "DATA"), series_name: null },
  { id: "a3", title: "Mentoring Engineers Through a Reorg", slug: "mentoring-reorg",
    excerpt: "Trust evaporates fast during restructuring. Five conversations that keep teams shipping when the org chart wobbles.",
    created_at: iso(12), tags: ["Leadership", "Career"], views: 318,
    reactions: { like: 7 }, cover_image: cover("#22c55e", "#0c1018", "PEOPLE"), series_name: null },
  { id: "a4", title: "Open Banking APIs: A Pragmatic Security Baseline", slug: "open-banking-security",
    excerpt: "Consent, rotation, and rate-limits — the unglamorous controls that keep regulators and customers equally happy.",
    created_at: iso(20), tags: ["FinTech", "Security"], views: 980,
    reactions: { like: 23, fire: 9 }, cover_image: cover("#f59e0b", "#0c1018", "API"), series_name: null },
  { id: "a5", title: "Why Our Roadmap Is a Set of Questions", slug: "roadmap-questions",
    excerpt: "Outcomes over output is a cliché until you rebuild the roadmap around hypotheses. A template you can steal.",
    created_at: iso(28), tags: ["Product", "Agile"], views: 455,
    reactions: { like: 14 }, cover_image: cover("#ef4444", "#0c1018", "PRODUCT"), series_name: null },
];

// Full article (maybeSingle) — markdown exercises the .lb-content type scale +
// the new scroll-margin-top headings.
const ARTICLE_FULL = {
  ...ARTICLE_CARDS[0],
  updated_at: iso(1),
  published: true,
  scheduled_at: null,
  linkedin_posted: false,
  series_order: 0,
  content: `Cutting cycle time is rarely about working faster. It is about removing the
things that quietly wait between hand-offs.

## The ceremony tax

Most teams I meet are paying a **ceremony tax**: meetings that exist to compensate for
a lack of trust or visibility. Remove the root cause and the meeting evaporates.

> If a status meeting can be replaced by a dashboard, it should have been a dashboard
> last quarter.

### What we measured

- Lead time, from idea to production
- Review latency, the silent killer
- Deploy frequency per team

Here is the rough shape of the before/after:

\`\`\`txt
cycle time   18d  ->  8d
review wait   3d  ->  6h
deploys/wk    1.2 ->  9
\`\`\`

### What actually moved the needle

1. Trunk-based development with small PRs
2. A hard WIP limit per engineer
3. Killing the daily status call

The point is not the specific numbers — it is that **deletion**, not addition, was the
lever. Ship smaller, wait less, trust more.`,
};

const THOUGHTS = [
  { id: "t1", content: "Pinned: the fastest way to speed up a team is to shrink the batch size. Everything else is downstream of that. #Agile #Delivery",
    likes: 24, created_at: iso(0), image_url: null, pinned: true, reactions: { "👍": 12, "🔥": 6 }, views: 540, poll: null, published: true, scheduled_at: null, linkedin_posted: false },
  { id: "t2", content: "Spent the morning deleting a microservice. Best refactor of the quarter. Sometimes the right architecture is **less** architecture.",
    likes: 18, created_at: iso(1), image_url: null, pinned: false, reactions: { "👍": 9 }, views: 410, poll: null, published: true, scheduled_at: null, linkedin_posted: false },
  { id: "t3", content: "Reminder for reviewers: a fast `LGTM` on a small PR beats a thorough review on a giant one that lands three days late. #CodeReview",
    likes: 31, created_at: iso(2), image_url: null, pinned: false, reactions: { "🔥": 14, "💯": 8 }, views: 720, poll: null, published: true, scheduled_at: null, linkedin_posted: false },
  { id: "t4", content: "Quick poll for the delivery folks:",
    likes: 5, created_at: iso(3), image_url: null, pinned: false, reactions: {}, views: 160, published: true, scheduled_at: null, linkedin_posted: false,
    poll: { question: "Biggest cycle-time killer?", options: [{ text: "Review latency", votes: 41 }, { text: "Unclear requirements", votes: 27 }, { text: "Env/CI flakiness", votes: 19 }] } },
  { id: "t5", content: "Onboarding doc test: if a new hire can ship a one-line change on day one, your pipeline is healthy. If not, fix that before the next hire. #DevEx",
    likes: 12, created_at: iso(5), image_url: null, pinned: false, reactions: { "👍": 7 }, views: 260, poll: null, published: true, scheduled_at: null, linkedin_posted: false },
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "*",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "Content-Range",
};

export function createMockServer() {
  return createServer((req, res) => {
    const send = (body, status = 200) => {
      res.writeHead(status, { "content-type": "application/json", ...CORS });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    const url = req.url || "";
    const wantsObject = (req.headers["accept"] || "").includes("vnd.pgrst.object");

    if (url.startsWith("/rest/v1/longform_articles")) {
      // The article-by-slug read filters on `slug=eq.`. supabase-js `.maybeSingle()`
      // does NOT send the pgrst.object Accept header — it fetches an array and unwraps
      // a single row client-side — so we must return exactly ONE row here, or it errors
      // with PGRST116 ("multiple rows returned"). `.single()` (object Accept) wants a
      // bare object instead; cover both.
      if (url.includes("slug=eq.")) {
        return send(wantsObject ? ARTICLE_FULL : [ARTICLE_FULL]);
      }
      return send(ARTICLE_CARDS); // feed / related / tag listings
    }
    if (url.startsWith("/rest/v1/microblog")) {
      return send(THOUGHTS);
    }
    if (url.startsWith("/auth/v1/")) {
      // Lazily hit only on user writes; keep it from 500-ing if it ever fires.
      return send({});
    }
    // Reactions, comments, collections, newsletter, etc. → empty, components
    // fall back to their zero-state which is exactly what we want to preview.
    return send(wantsObject ? null : []);
  });
}

// Allow `node mock-supabase.mjs` for standalone debugging.
if (import.meta.url === `file://${process.argv[1]}`) {
  createMockServer().listen(MOCK_PORT, "127.0.0.1", () =>
    console.log(`mock supabase on http://127.0.0.1:${MOCK_PORT}`),
  );
}
