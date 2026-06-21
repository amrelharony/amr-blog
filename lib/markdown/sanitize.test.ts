import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/lib/markdown/sanitize";

describe("sanitizeHtml (text-only blog)", () => {
  it("strips <img> tags from content", () => {
    const out = sanitizeHtml('<p>Before</p><img src="https://x/a.png" alt="A"><p>After</p>');
    expect(out).not.toContain("<img");
    expect(out).toContain("Before");
    expect(out).toContain("After");
  });

  it("strips <figure>/<figcaption> wrappers", () => {
    const out = sanitizeHtml('<figure><img src="a.png"><figcaption>Cap</figcaption></figure>');
    expect(out).not.toContain("<figure");
    expect(out).not.toContain("<figcaption");
    expect(out).not.toContain("<img");
  });

  it("keeps iframe embeds (YouTube/CodePen)", () => {
    const out = sanitizeHtml('<iframe src="https://www.youtube-nocookie.com/embed/x" allowfullscreen></iframe>');
    expect(out).toContain("<iframe");
    expect(out).toContain("youtube-nocookie.com/embed/x");
  });

  it("drops an iframe whose src is not an allow-listed embed host", () => {
    const out = sanitizeHtml('<p>x</p><iframe src="https://evil.example/frame"></iframe><p>y</p>');
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("evil.example");
    expect(out).toContain("x");
    expect(out).toContain("y");
  });

  it("keeps a CodePen embed iframe", () => {
    const out = sanitizeHtml('<iframe src="https://codepen.io/u/embed/abc"></iframe>');
    expect(out).toContain("<iframe");
    expect(out).toContain("codepen.io/u/embed/abc");
  });

  it("keeps ordinary text formatting", () => {
    const out = sanitizeHtml("<p><strong>Bold</strong> and <em>italic</em></p>");
    expect(out).toContain("<strong>Bold</strong>");
    expect(out).toContain("<em>italic</em>");
  });
});
