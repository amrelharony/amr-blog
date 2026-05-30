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
  published: boolean;
  views: number;
  reactions: Record<string, number>;
  scheduled_at: string | null;
  linkedin_posted: boolean;
  series_name: string | null;
  series_order: number;
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
>;

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
  options: { label: string; votes: number }[];
}
