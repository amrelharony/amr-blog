// Share-target URL builders for the article share panel — extracted from the
// inline encodeURIComponent expressions in app/p/[slug]/page.tsx so the server
// page, the client ShareActions component, and unit tests all build the exact
// same URLs.

export interface ShareUrls {
  x: string;
  linkedin: string;
  whatsapp: string;
  telegram: string;
  email: string;
}

/** Share message convention used by the article page: title, blank line, excerpt. */
export function shareMessage(title: string, excerpt?: string | null): string {
  return title + (excerpt ? `\n\n${excerpt}` : "");
}

export function shareUrls(
  title: string,
  excerpt: string | null | undefined,
  url: string,
): ShareUrls {
  const text = shareMessage(title, excerpt);
  return {
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text + "\n\n" + url)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + "\n\n" + url)}`,
  };
}
