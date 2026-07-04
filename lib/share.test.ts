import { describe, it, expect } from "vitest";
import { shareMessage, shareUrls } from "./share";

describe("shareMessage", () => {
  it("is just the title when there is no excerpt", () => {
    expect(shareMessage("Hello")).toBe("Hello");
    expect(shareMessage("Hello", null)).toBe("Hello");
    expect(shareMessage("Hello", "")).toBe("Hello");
  });

  it("joins title and excerpt with a blank line", () => {
    expect(shareMessage("Title", "Excerpt.")).toBe("Title\n\nExcerpt.");
  });
});

describe("shareUrls", () => {
  const url = "https://blog.example.com/p/my-post";

  it("percent-encodes &, #, quotes and plus signs in the text", () => {
    const s = shareUrls('C# & "AI" + more', null, url);
    // Raw &, #, " or + in a query value would corrupt or truncate the intent URL.
    const textPart = s.x.slice("https://twitter.com/intent/tweet?text=".length).split("&url=")[0];
    expect(textPart).not.toMatch(/[&#"+]/);
    expect(decodeURIComponent(textPart)).toBe('C# & "AI" + more');
  });

  it("round-trips non-ASCII text", () => {
    const s = shareUrls("تكنولوجيا مالية", "عنوان", url);
    const textPart = s.telegram.split("&text=")[1];
    expect(decodeURIComponent(textPart)).toBe("تكنولوجيا مالية\n\nعنوان");
  });

  it("linkedin carries only the url", () => {
    const s = shareUrls("Title", "Excerpt", url);
    expect(s.linkedin).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    );
  });

  it("whatsapp and email append the url after the message", () => {
    const s = shareUrls("Title", "Excerpt", url);
    const waText = decodeURIComponent(s.whatsapp.split("?text=")[1]);
    expect(waText).toBe(`Title\n\nExcerpt\n\n${url}`);
    expect(s.email.startsWith("mailto:?subject=Title&body=")).toBe(true);
    const body = decodeURIComponent(s.email.split("&body=")[1]);
    expect(body.endsWith(url)).toBe(true);
  });

  it("x/twitter intent carries text and url as separate params", () => {
    const s = shareUrls("Title", null, url);
    expect(s.x).toBe(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent("Title")}&url=${encodeURIComponent(url)}`,
    );
  });
});
