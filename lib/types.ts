// Shapes for the blog content tables (subset of public.longform_articles / microblog).

export interface Article {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image: string;
  tags: string[];
  /** Top-level category: "Leadership" | "Business" | "Tech" (see lib/categories). */
  category: string | null;
  /** Original URL when republished from elsewhere (e.g. LinkedIn) — used for attribution. */
  source_url: string | null;
  published: boolean;
  views: number;
  reactions: Record<string, number>;
  scheduled_at: string | null;
  linkedin_posted: boolean;
  series_name: string | null;
  series_order: number;
  /** AI-generated TL;DR, authored/reviewed in the admin editor (column `tldr`). */
  tldr: string | null;
  /** Public Storage URL of an attached PDF, rendered inline by PdfViewer (NULL = none). */
  pdf_url: string | null;
  /** Original filename of the attached PDF, used as the viewer's download label. */
  pdf_name: string | null;
}

/** Columns used by the feed/cards (no heavy `content`). */
export type ArticleCard = Pick<
  Article,
  | "id"
  | "title"
  | "slug"
  | "excerpt"
  | "created_at"
  | "tags"
  | "views"
  | "reactions"
  | "cover_image"
  | "series_name"
> & {
  // Optional so existing card fixtures/queries that predate the column still type-check.
  category?: string | null;
};

export interface Thought {
  id: string;
  content: string;
  likes: number;
  created_at: string;
  image_url: string | null;
  pinned: boolean;
  reactions: Record<string, number>;
  views: number;
  poll: Poll | null;
  published: boolean;
  scheduled_at: string | null;
  linkedin_posted: boolean;
}

export interface Poll {
  question: string;
  options: { text: string; votes: number }[];
}
