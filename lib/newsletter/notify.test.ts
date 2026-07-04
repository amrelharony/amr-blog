import { describe, it, expect } from "vitest";
import {
  articleEmailHTML,
  replyEmailHTML,
  batchWindow,
  shouldSend,
} from "@/lib/newsletter/notify";

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

describe("shouldSend (claim decision)", () => {
  it("proceeds with no prior row or a resumable pending row", () => {
    expect(shouldSend(null)).toBe(true);
    expect(shouldSend(undefined)).toBe(true);
    expect(shouldSend({ status: "pending" })).toBe(true);
  });

  it("skips when another run owns it or it already went out", () => {
    expect(shouldSend({ status: "in_progress" })).toBe(false);
    expect(shouldSend({ status: "sent" })).toBe(false);
  });
});
