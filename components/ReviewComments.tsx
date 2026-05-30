"use client";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

interface RComment {
  text: string;
  reviewer: string;
  paragraph_index?: number;
  created_at?: string;
}

export default function ReviewComments({
  token,
  initial,
  reviewerName,
}: {
  token: string;
  initial: RComment[];
  reviewerName: string;
}) {
  const sb = getBrowserClient();
  const [comments, setComments] = useState<RComment[]>(initial || []);
  const [name, setName] = useState(reviewerName || "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const reviewer = name.trim() || "Reviewer";
    const { error } = await sb.rpc("add_review_comment", {
      p_token: token,
      p_reviewer: reviewer,
      p_comment_text: text.trim(),
      p_paragraph_index: 0,
    });
    if (!error) {
      setComments((c) => [...c, { text: text.trim(), reviewer, created_at: new Date().toISOString() }]);
      setText("");
    }
    setBusy(false);
  };

  return (
    <div className="lb-comments-section" style={{ maxWidth: 760, margin: "24px auto" }}>
      <h3 className="lb-comments-title">
        Reviewer feedback <span className="count">{comments.length}</span>
      </h3>
      <div className="lb-comment-list">
        {comments.map((c, i) => (
          <div key={i} className="lb-comment">
            <div className="lb-comment-header">
              <span className="lb-comment-author">{c.reviewer}</span>
            </div>
            <div className="lb-comment-body">
              <p style={{ whiteSpace: "pre-wrap" }}>{c.text}</p>
            </div>
          </div>
        ))}
      </div>
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
            placeholder="Leave feedback on this draft…"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <button className="lb-comment-submit" disabled={busy || !text.trim()} onClick={submit}>
          {busy ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </div>
  );
}
