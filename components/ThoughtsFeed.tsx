"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { ensureAnonSession } from "@/lib/supabase/anon";
import { fmtContent, relTime, readingTime } from "@/lib/microblog-format";
import type { Thought } from "@/lib/types";

const RX = [
  { key: "heart", emoji: "❤️", label: "Love" },
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "bulb", emoji: "💡", label: "Insightful" },
  { key: "clap", emoji: "👏", label: "Bravo" },
  { key: "target", emoji: "🎯", label: "On Point" },
];
const FILTERS = [
  { key: "all", label: "All" },
  { key: "bookmarked", label: "🔖" },
  { key: "pinned", label: "📌" },
  { key: "polls", label: "📊" },
];
const PAGE_SIZE = 15;

function lsGet<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
function lsSet(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* quota */
  }
}

const viewed = new Set<string>();

export default function ThoughtsFeed({ initial }: { initial: Thought[] }) {
  const sb = getBrowserClient();
  const [posts, setPosts] = useState<Thought[]>(initial);
  const [offset, setOffset] = useState(initial.length);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [myRx, setMyRx] = useState<Record<string, string[]>>({});
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [voted, setVoted] = useState<Record<string, number>>({});

  useEffect(() => {
    setMyRx(lsGet("_blog_reactions", {}));
    setBookmarks(lsGet("_blog_bookmarks", []));
    setVoted(lsGet("_blog_polls", {}));
  }, []);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const { data } = await sb
      .from("microblog")
      .select("*")
      // Match the RLS predicate at the app layer (consistent with getThoughts).
      .eq("published", true)
      .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
      .order("pinned", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    const rows = (data || []) as Thought[];
    // De-dupe by id: range/offset pagination over a newest-first, mutable list can
    // re-surface a row if a post was inserted/removed between page fetches.
    setPosts((p) => {
      const seen = new Set(p.map((x) => x.id));
      return [...p, ...rows.filter((r) => !seen.has(r.id))];
    });
    setOffset((o) => o + rows.length);
    setHasMore(rows.length >= PAGE_SIZE);
    setLoading(false);
  };

  const toggleRx = async (pid: string, rk: string) => {
    const all = lsGet<Record<string, string[]>>("_blog_reactions", {});
    const mine = all[pid] || [];
    const was = mine.includes(rk);
    all[pid] = was ? mine.filter((k) => k !== rk) : [...mine, rk];
    lsSet("_blog_reactions", all);
    setMyRx({ ...all });
    setPosts((ps) =>
      ps.map((p) =>
        p.id === pid
          ? { ...p, reactions: { ...p.reactions, [rk]: Math.max(0, (p.reactions?.[rk] || 0) + (was ? -1 : 1)) } }
          : p,
      ),
    );
    try {
      const { data } = await sb.rpc("update_microblog_reactions", {
        p_post_id: pid,
        p_reaction_key: rk,
        p_delta: was ? -1 : 1,
      });
      if (data)
        setPosts((ps) => ps.map((p) => (p.id === pid ? { ...p, reactions: data as Record<string, number> } : p)));
    } catch {
      /* keep optimistic */
    }
  };

  const vote = async (pid: string, idx: number) => {
    if (voted[pid] != null) return;
    const v = { ...lsGet<Record<string, number>>("_blog_polls", {}), [pid]: idx };
    lsSet("_blog_polls", v);
    setVoted(v);
    setPosts((ps) =>
      ps.map((p) => {
        if (p.id !== pid || !p.poll) return p;
        const opts = p.poll.options.map((o, i) => (i === idx ? { ...o, votes: (o.votes || 0) + 1 } : o));
        return { ...p, poll: { ...p.poll, options: opts } };
      }),
    );
    try {
      const { data } = await sb.rpc("vote_microblog_poll", { p_post_id: pid, p_option_idx: idx });
      if (data) setPosts((ps) => ps.map((p) => (p.id === pid ? { ...p, poll: data as Thought["poll"] } : p)));
    } catch {
      /* keep optimistic */
    }
  };

  const toggleBookmark = (pid: string) => {
    const bm = lsGet<string[]>("_blog_bookmarks", []);
    const next = bm.includes(pid) ? bm.filter((i) => i !== pid) : [...bm, pid];
    lsSet("_blog_bookmarks", next);
    setBookmarks(next);
  };

  const trackView = useCallback(
    (pid: string) => {
      if (viewed.has(pid)) return;
      viewed.add(pid);
      sb.rpc("increment_views", { post_id: pid }).then(
        () => {},
        () => {},
      );
    },
    [sb],
  );

  // trending tags
  const tagCounts: Record<string, number> = {};
  posts.forEach((p) => (p.content.match(/#(\w+)/g) || []).forEach((t) => (tagCounts[t.toLowerCase()] = (tagCounts[t.toLowerCase()] || 0) + 1)));
  const trending = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t);

  // filter + search
  const q = query.trim().toLowerCase();
  let list = posts;
  if (filter === "bookmarked") list = list.filter((p) => bookmarks.includes(p.id));
  else if (filter === "pinned") list = list.filter((p) => p.pinned);
  else if (filter === "polls") list = list.filter((p) => p.poll);
  if (q) list = list.filter((p) => (p.content || "").toLowerCase().includes(q));
  list = [...list].sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));

  return (
    <>
      <div className="blog-search-wrap">
        <i className="fa-solid fa-magnifying-glass blog-search-icon" aria-hidden="true" />
        <input
          className="blog-search"
          placeholder="Search posts or #tags..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search posts"
        />
      </div>

      <div className="blog-filter-strip">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={"blog-filter-btn" + (filter === f.key ? " active" : "")}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {trending.length > 0 && (
        <div className="blog-trending">
          {trending.map((t) => (
            <button key={t} className="blog-trending-tag" onClick={() => setQuery(t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="blog-feed" role="feed" aria-label="Thoughts">
        {list.length === 0 ? (
          <div className="blog-empty">{q || filter !== "all" ? "No matching posts." : "No updates yet."}</div>
        ) : (
          list.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              myRx={myRx[p.id] || []}
              bookmarked={bookmarks.includes(p.id)}
              votedIdx={voted[p.id]}
              onReact={toggleRx}
              onVote={vote}
              onBookmark={toggleBookmark}
              onView={trackView}
              onTag={setQuery}
            />
          ))
        )}
        {hasMore && !q && filter === "all" && (
          <div className="blog-load-more" onClick={loadMore}>
            {loading ? "[ LOADING… ]" : "[ LOAD MORE ]"}
          </div>
        )}
      </div>
    </>
  );
}

function PostCard({
  post,
  myRx,
  bookmarked,
  votedIdx,
  onReact,
  onVote,
  onBookmark,
  onView,
  onTag,
}: {
  post: Thought;
  myRx: string[];
  bookmarked: boolean;
  votedIdx: number | undefined;
  onReact: (pid: string, rk: string) => void;
  onVote: (pid: string, idx: number) => void;
  onBookmark: (pid: string) => void;
  onView: (pid: string) => void;
  onTag: (tag: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<{ id: string; author: string; content: string; created_at: string }[]>([]);
  const [cInput, setCInput] = useState("");
  const sb = getBrowserClient();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            onView(post.id);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    requestAnimationFrame(() => el.classList.add("visible"));
    return () => io.disconnect();
  }, [post.id, onView]);

  const loadComments = async () => {
    const { data } = await sb
      .from("microblog_comments")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true })
      .limit(50);
    setComments((data || []) as typeof comments);
  };

  const sendComment = async () => {
    if (!cInput.trim()) return;
    const author = localStorage.getItem("_blog_commenter") || "Visitor";
    localStorage.setItem("_blog_commenter", author);
    await ensureAnonSession();
    const { error } = await sb
      .from("microblog_comments")
      .insert({ post_id: post.id, author, content: cInput.trim() });
    if (!error) {
      setCInput("");
      await loadComments();
    }
  };

  const rx = post.reactions || {};
  const activeRx = RX.filter((r) => (rx[r.key] || 0) > 0 || myRx.includes(r.key));
  const poll = post.poll;
  const pollTotal = poll ? poll.options.reduce((s, o) => s + (o.votes || 0), 0) : 0;

  return (
    <div
      ref={ref}
      className={"blog-post" + (post.pinned ? " pinned" : "") + (bookmarked ? " bookmarked" : "")}
      tabIndex={0}
      role="article"
    >
      <div
        className="blog-post-content"
        dangerouslySetInnerHTML={{ __html: post.content ? fmtContent(post.content) : "" }}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.classList.contains("hashtag")) onTag("#" + (t.dataset.tag || ""));
        }}
      />

      {poll && (
        <div className="blog-poll">
          <div className="blog-poll-q">{poll.question}</div>
          {poll.options.map((o, oi) => {
            const pct = pollTotal ? Math.round(((o.votes || 0) / pollTotal) * 100) : 0;
            const hasVoted = votedIdx != null;
            return (
              <div
                key={oi}
                className={"blog-poll-opt" + (hasVoted ? " voted" : "")}
                onClick={() => !hasVoted && onVote(post.id, oi)}
              >
                <div className="poll-bar" style={{ width: hasVoted ? pct + "%" : "0%" }} />
                <span className="poll-label">
                  {o.text} {votedIdx === oi ? "✓" : ""}
                </span>
                <span className="poll-pct">{hasVoted ? pct + "%" : ""}</span>
              </div>
            );
          })}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#6b7a90", marginTop: 6 }}>
            {pollTotal} vote{pollTotal !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      <div className="blog-post-reactions">
        {activeRx.map((r) => (
          <button
            key={r.key}
            className={"blog-reaction-btn" + (myRx.includes(r.key) ? " active" : "")}
            title={r.label}
            onClick={() => onReact(post.id, r.key)}
          >
            {r.emoji} <span className="rcount">{rx[r.key] || 0}</span>
          </button>
        ))}
        <button
          className="blog-reaction-add"
          title="React"
          onClick={(e) => {
            e.stopPropagation();
            setPickerOpen((o) => !o);
          }}
        >
          +
        </button>
        <div className={"blog-reaction-picker" + (pickerOpen ? " show" : "")}>
          {RX.map((r) => (
            <button
              key={r.key}
              title={r.label}
              onClick={(e) => {
                e.stopPropagation();
                setPickerOpen(false);
                onReact(post.id, r.key);
              }}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="blog-post-meta">
        <span>
          {relTime(post.created_at)}
          {post.content ? <span className="blog-reading-time">· {readingTime(post.content)}</span> : null}
          {post.views ? <span className="blog-views">👁 {post.views}</span> : null}
        </span>
        <div className="blog-post-actions">
          <button
            className="blog-copy-btn"
            title="Copy text"
            onClick={() => navigator.clipboard?.writeText(post.content || "")}
          >
            <i className="fa-solid fa-copy" />
          </button>
          <button
            className={"blog-action-btn" + (bookmarked ? " bookmark-active" : "")}
            title="Bookmark"
            onClick={() => onBookmark(post.id)}
          >
            <i className="fa-solid fa-bookmark" />
          </button>
          <button
            className="blog-action-btn"
            title="Comments"
            onClick={() => {
              const next = !showComments;
              setShowComments(next);
              if (next) loadComments();
            }}
          >
            <i className="fa-solid fa-comment" />
          </button>
        </div>
      </div>

      {showComments && (
        <div className="blog-comments-section">
          <div className="blog-comments-list">
            {comments.length ? (
              comments.map((c) => (
                <div key={c.id} className="blog-comment">
                  <span className="blog-comment-author">
                    {c.author}
                    <span className="blog-comment-time">{relTime(c.created_at)}</span>
                  </span>
                  <div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 10, color: "#6b7a90" }}>No comments yet.</div>
            )}
          </div>
          <div className="blog-comment-form">
            <input
              className="blog-comment-input"
              placeholder="Leave a comment..."
              maxLength={200}
              value={cInput}
              onChange={(e) => setCInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendComment();
              }}
            />
            <button className="blog-comment-send" onClick={sendComment}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
