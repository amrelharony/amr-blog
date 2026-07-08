import { describe, it, expect } from "vitest";
import {
  articleEmailHTML,
  replyEmailHTML,
  batchWindow,
  resolveClaim,
} from "@/lib/newsletter/notify";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-07-07T12:00:00Z");

const article = {
  title: 'Banking "APIs" & <You>',
  slug: "banking-apis",
  excerpt: "Short teaser.",
  tldr: null,
  tags: ["fintech", "banking"],
  created_at: "2026-07-01T00:00:00Z",
};

describe("articleEmailHTML", () => {
  it("escapes HTML in title/blurb/tags and links the article", () => {
    const html = articleEmailHTML(article, "https://x/unsub?token=t");
    expect(html).toContain("Banking &quot;APIs&quot; &amp; &lt;You&gt;");
    expect(html).not.toContain("<You>");
    expect(html).toContain("/p/banking-apis");
    expect(html).toContain("https://x/unsub?token=t");
  });

  it("prefers the tldr over the excerpt as the blurb", () => {
    const html = articleEmailHTML({ ...article, tldr: "The gist." }, "u");
    expect(html).toContain("The gist.");
    expect(html).not.toContain("Short teaser.");
  });
});

describe("replyEmailHTML", () => {
  it("escapes user-supplied author, comment text and article title", () => {
    const html = replyEmailHTML({
      articleTitle: "On <Banks>",
      articleSlug: "on-banks",
      parentExcerpt: 'my "hot take" & more',
      replyAuthor: "<img src=x>Eve",
      replyExcerpt: "<script>alert(1)</script> nice point",
      unsubUrl: "https://x/api/comments/unsubscribe?token=t",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;Eve");
    expect(html).toContain("On &lt;Banks&gt;");
    expect(html).toContain("/p/on-banks#comments");
    expect(html).toContain("unsubscribe?token=t");
  });

  it("truncates long excerpts", () => {
    const html = replyEmailHTML({
      articleTitle: "T",
      articleSlug: "t",
      parentExcerpt: "p".repeat(500),
      replyAuthor: "A",
      replyExcerpt: "r".repeat(1000),
      unsubUrl: "u",
    });
    expect(html).toContain("r".repeat(300) + "…");
    expect(html).not.toContain("r".repeat(301));
  });
});

describe("batchWindow (resume arithmetic — mirrors runBulletinSend)", () => {
  it("first run: sends from 0, leaves the tail", () => {
    expect(batchWindow(250, 250, 90)).toEqual({ offset: 0, size: 90, remainingAfter: 160 });
  });

  it("resumed run: picks up where the last batch stopped", () => {
    expect(batchWindow(250, 160, 90)).toEqual({ offset: 90, size: 90, remainingAfter: 70 });
    expect(batchWindow(250, 70, 90)).toEqual({ offset: 180, size: 70, remainingAfter: 0 });
  });

  it("small lists finish in one batch", () => {
    expect(batchWindow(5, 5, 90)).toEqual({ offset: 0, size: 5, remainingAfter: 0 });
    expect(batchWindow(0, 0, 90)).toEqual({ offset: 0, size: 0, remainingAfter: 0 });
  });
});

describe("resolveClaim (lost-race decision)", () => {
  it("resumes a pending row; skips sent/missing/unexpected", () => {
    expect(resolveClaim({ status: "pending" }, NOW)).toBe("resume");
    expect(resolveClaim({ status: "sent" }, NOW)).toBe("skip");
    expect(resolveClaim(null, NOW)).toBe("skip");
    expect(resolveClaim(undefined, NOW)).toBe("skip");
    expect(resolveClaim({ status: "weird" }, NOW)).toBe("skip");
  });

  it("skips a fresh in_progress run (recent sent_at heartbeat)", () => {
    const sent_at = new Date(NOW - 1 * HOUR).toISOString();
    expect(resolveClaim({ status: "in_progress", sent_at }, NOW)).toBe("skip");
  });

  it("reclaims an in_progress run whose heartbeat is older than the 2h threshold", () => {
    const sent_at = new Date(NOW - 3 * HOUR).toISOString();
    expect(resolveClaim({ status: "in_progress", sent_at }, NOW)).toBe("reclaim");
  });

  it("falls back to created_at when sent_at is null (legacy wedge)", () => {
    const fresh = new Date(NOW - 1 * HOUR).toISOString();
    const old = new Date(NOW - 5 * HOUR).toISOString();
    expect(resolveClaim({ status: "in_progress", sent_at: null, created_at: fresh }, NOW)).toBe("skip");
    expect(resolveClaim({ status: "in_progress", sent_at: null, created_at: old }, NOW)).toBe("reclaim");
  });

  it("reclaims when no heartbeat is parseable at all", () => {
    expect(resolveClaim({ status: "in_progress", sent_at: null, created_at: null }, NOW)).toBe("reclaim");
  });
});
