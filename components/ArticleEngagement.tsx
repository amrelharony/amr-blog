"use client";
import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { ensureAnonSession } from "@/lib/supabase/anon";

// Reactions + threaded comments + bookmark, ported from Js/blog-social.js.
const ARTICLE_RX = [
  { key: "heart", emoji: "❤️", label: "Love" },
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "bulb", emoji: "💡", label: "Insightful" },
  { key: "clap", emoji: "👏", label: "Bravo" },
  { key: "target", emoji: "🎯", label: "On Point" },
];
const ADMIN_NAME = "Amr Elharony";

interface Comment {
  id: string;
  parent_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
  likes: number;
}
type TreeComment = Comment & { replies: TreeComment[] };

function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* quota */
  }
}

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + "d ago";
  return Math.floor(days / 30) + "mo ago";
}

function buildTree(comments: Comment[]): TreeComment[] {
  const map: Record<string, TreeComment> = {};
  const roots: TreeComment[] = [];
  comments.forEach((c) => (map[c.id] = { ...c, replies: [] }));
  comments.forEach((c) => {
    if (c.parent_id && map[c.parent_id]) map[c.parent_id].replies.push(map[c.id]);
    else roots.push(map[c.id]);
  });
  return roots;
}

export default function ArticleEngagement({
  articleId,
  slug,
  initialReactions,
}: {
  articleId: string;
  slug: string;
  initialReactions: Record<string, number>;
}) {
  const sb = getBrowserClient();
  const [reactions, setReactions] = useState<Record<string, number>>(initialReactions || {});
  const [myRx, setMyRx] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  // hydrate local state
  useEffect(() => {
    setMyRx(lsGet<Record<string, string[]>>("_lb_reactions", {})[articleId] || []);
    setLikedIds(lsGet<string[]>("_lb_comment_likes", []));
    setName(localStorage.getItem("_lb_commenter") || "");
  }, [articleId, slug]);

  // view increment, once per session
  useEffect(() => {
    const key = "_lb_viewed_" + slug;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    sb.rpc("increment_article_views", { article_slug: slug }).then(
      () => {},
      () => {},
    );
  }, [sb, slug]);

  const loadComments = useCallback(async () => {
    const { data } = await sb
      .from("article_comments")
      .select("*")
      .eq("article_id", articleId)
      .order("created_at", { ascending: true });
    setComments((data || []) as Comment[]);
  }, [sb, articleId]);
  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // dismiss reaction picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const h = () => setPickerOpen(false);
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [pickerOpen]);

  const toggleRx = async (rk: string) => {
    const all = lsGet<Record<string, string[]>>("_lb_reactions", {});
    const mine = all[articleId] || [];
    const was = mine.includes(rk);
    all[articleId] = was ? mine.filter((k) => k !== rk) : [...mine, rk];
    lsSet("_lb_reactions", all);
    setMyRx(all[articleId]);
    setReactions((prev) => ({ ...prev, [rk]: Math.max(0, (prev[rk] || 0) + (was ? -1 : 1)) }));
    setPickerOpen(false);
    try {
      const { data } = await sb.rpc("update_article_reactions", {
        p_article_id: articleId,
        p_reaction_key: rk,
        p_delta: was ? -1 : 1,
      });
      if (data) setReactions(data as Record<string, number>);
    } catch {
      /* keep optimistic */
    }
  };

  const postComment = async (content: string, parentId: string | null, author: string) => {
    if (!content.trim()) return false;
    await ensureAnonSession();
    localStorage.setItem("_lb_commenter", author);
    setName(author);
    const { error } = await sb.from("article_comments").insert({
      article_id: articleId,
      parent_id: parentId,
      author_name: author || "Anonymous",
      content: content.trim(),
    });
    if (!error) await loadComments();
    return !error;
  };

  const likeComment = async (cid: string) => {
    const liked = lsGet<string[]>("_lb_comment_likes", []);
    const was = liked.includes(cid);
    const next = was ? liked.filter((i) => i !== cid) : [...liked, cid];
    lsSet("_lb_comment_likes", next);
    setLikedIds(next);
    setComments((prev) =>
      prev.map((c) => (c.id === cid ? { ...c, likes: Math.max(0, (c.likes || 0) + (was ? -1 : 1)) } : c)),
    );
    try {
      await sb.rpc("like_article_comment", { p_comment_id: cid, p_delta: was ? -1 : 1 });
    } catch {
      /* silent */
    }
  };

  const tree = buildTree(comments);
  const activeRx = ARTICLE_RX.filter((r) => (reactions[r.key] || 0) > 0 || myRx.includes(r.key));

  return (
    <>
      <div className="lb-reactions" id="lbReactions">
        {activeRx.map((r) => (
          <button
            key={r.key}
            className={"lb-rx-btn" + (myRx.includes(r.key) ? " active" : "")}
            title={r.label}
            onClick={() => toggleRx(r.key)}
          >
            {r.emoji} <span className="rcount">{reactions[r.key] || 0}</span>
          </button>
        ))}
        <span className="lb-rx-wrap">
          <button
            className="lb-rx-add"
            title="React"
            onClick={(e) => {
              e.stopPropagation();
              setPickerOpen((o) => !o);
            }}
          >
            +
          </button>
          <div className={"lb-rx-picker" + (pickerOpen ? " show" : "")}>
            {ARTICLE_RX.map((r) => (
              <button
                key={r.key}
                title={r.label}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRx(r.key);
                }}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        </span>
      </div>

      <div id="lbCommentsSection">
        <div className="lb-comments-section">
          <h3 className="lb-comments-title">
            Discussion <span className="count">{comments.length} comment{comments.length !== 1 ? "s" : ""}</span>
          </h3>
          <div className="lb-comment-form">
            <div className="lb-comment-form-row">
              <input
                className="lb-comment-name"
                placeholder="Your name"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <textarea
                className="lb-comment-textarea"
                placeholder="Share your thoughts..."
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <button
              className="lb-comment-submit"
              disabled={posting || !text.trim()}
              onClick={async () => {
                setPosting(true);
                const ok = await postComment(text, null, name.trim() || "Anonymous");
                if (ok) setText("");
                setPosting(false);
              }}
            >
              {posting ? "Posting…" : "Post Comment"}
            </button>
          </div>
          {tree.length ? (
            <div className="lb-comment-list">
              {tree.map((c) => (
                <CommentNode
                  key={c.id}
                  c={c}
                  depth={0}
                  likedIds={likedIds}
                  onLike={likeComment}
                  onReply={postComment}
                  defaultName={name}
                />
              ))}
            </div>
          ) : (
            <div className="lb-comments-empty">No comments yet. Be the first to share your thoughts.</div>
          )}
        </div>
      </div>
    </>
  );
}

function CommentNode({
  c,
  depth,
  likedIds,
  onLike,
  onReply,
  defaultName,
}: {
  c: TreeComment;
  depth: number;
  likedIds: string[];
  onLike: (id: string) => void;
  onReply: (content: string, parentId: string | null, author: string) => Promise<boolean>;
  defaultName: string;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [rName, setRName] = useState(defaultName);
  const [rText, setRText] = useState("");
  const [busy, setBusy] = useState(false);
  const isAuthor = (c.author_name || "").toLowerCase() === ADMIN_NAME.toLowerCase();
  const isLiked = likedIds.includes(c.id);

  return (
    <div className="lb-comment" data-cid={c.id}>
      <div className="lb-comment-header">
        <span className={"lb-comment-author" + (isAuthor ? " admin" : "")}>{c.author_name}</span>
        <span className="lb-comment-time">{timeAgo(c.created_at)}</span>
      </div>
      <div className="lb-comment-body">
        <p style={{ whiteSpace: "pre-wrap" }}>{c.content}</p>
      </div>
      <div className="lb-comment-actions">
        <button
          className={"lb-comment-action-btn" + (isLiked ? " liked" : "")}
          onClick={() => onLike(c.id)}
        >
          <i className={"fa-" + (isLiked ? "solid" : "regular") + " fa-heart"} /> {c.likes || 0}
        </button>
        {depth < 2 && (
          <button className="lb-comment-action-btn" onClick={() => setReplyOpen((o) => !o)}>
            <i className="fa-regular fa-comment" /> Reply
          </button>
        )}
      </div>
      {replyOpen && (
        <div className="lb-comment-reply-form" style={{ display: "block" }}>
          <input
            className="lb-comment-name"
            placeholder="Your name"
            maxLength={60}
            value={rName}
            onChange={(e) => setRName(e.target.value)}
            style={{ marginBottom: 6, width: "100%" }}
          />
          <textarea
            className="lb-comment-reply-input"
            placeholder="Write a reply..."
            value={rText}
            onChange={(e) => setRText(e.target.value)}
          />
          <div className="lb-comment-reply-actions">
            <button
              className="lb-cms-btn primary"
              style={{ fontSize: 9, padding: "6px 16px" }}
              disabled={busy || !rText.trim()}
              onClick={async () => {
                setBusy(true);
                const ok = await onReply(rText, c.id, rName.trim() || "Anonymous");
                if (ok) {
                  setRText("");
                  setReplyOpen(false);
                }
                setBusy(false);
              }}
            >
              Reply
            </button>
            <button
              className="lb-cms-btn secondary"
              style={{ fontSize: 9, padding: "6px 16px" }}
              onClick={() => setReplyOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {c.replies.length > 0 && (
        <div className="lb-comment-replies">
          {c.replies.map((r) => (
            <CommentNode
              key={r.id}
              c={r}
              depth={depth + 1}
              likedIds={likedIds}
              onLike={onLike}
              onReply={onReply}
              defaultName={defaultName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
