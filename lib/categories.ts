// The three top-level content categories. `label` is the canonical value stored
// in longform_articles.category; `slug` is the URL segment (/category/<slug>).
export interface CategoryDef {
  slug: string;
  label: string;
  blurb: string;
  icon: string; // Font Awesome class (without the fa-solid prefix)
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: "leadership",
    label: "Leadership",
    icon: "fa-users-gear",
    blurb:
      "Agile delivery, team building, and people management — leading change and growing high-performing teams.",
  },
  {
    slug: "business",
    label: "Business",
    icon: "fa-chart-line",
    blurb:
      "Strategy, fintech, markets, and the economy — how companies grow, compete, and transform.",
  },
  {
    slug: "tech",
    label: "Tech",
    icon: "fa-microchip",
    blurb:
      "AI, hardware, software, and the innovations reshaping how we live and work.",
  },
];

export const CATEGORY_LABELS = CATEGORIES.map((c) => c.label);

export function categoryBySlug(slug: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.slug === (slug || "").toLowerCase());
}

export function categoryByLabel(label: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.label.toLowerCase() === (label || "").toLowerCase());
}
