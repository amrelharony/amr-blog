# Articles API — authoring guide for the openclaw agent

`POST /api/articles` lets a trusted agent publish a long-form article to the blog.
Articles are **Markdown** (GitHub-Flavored). Tables and rich formatting work out of
the box — the only hard rule is **no images** (they are stripped).

## Endpoint

```
POST https://blog.amrelharony.com/api/articles
Authorization: Bearer <ARTICLES_API_KEY>
Content-Type: application/json
```

(You may send the key as `x-articles-api-key: <key>` instead of the `Authorization`
header.) Max request body ≈ 1 MB.

## Request body

| field          | required           | default          | notes |
|----------------|--------------------|------------------|-------|
| `title`        | **yes**            | —                | 1–200 chars |
| `content`      | **yes**            | —                | raw GFM markdown (see below) |
| `slug`         | no                 | derived from title | URL segment `/p/<slug>`. If you pass one that's taken → `409`. If omitted, a unique slug is generated. |
| `excerpt`      | no                 | `""`             | short summary; also used in the LinkedIn share text |
| `tags`         | no                 | `[]`             | array `["ai","fintech"]` or comma string `"ai, fintech"` |
| `category`     | no                 | none             | exactly one of `Fintech`, `Leadership`, `Business`, `Tech` (case-insensitive) — or omit |
| `cover_image`  | no                 | `""`             | URL; used only as a LinkedIn thumbnail (never shown on the blog) |
| `source_url`   | no                 | none             | attribution / canonical link |
| `series_name`  | no                 | none             | groups posts into a series |
| `series_order` | no                 | `0`              | order within the series |
| `tldr`         | no                 | none             | one-line summary shown on the article |
| `status`       | no                 | `"draft"`        | `draft` \| `publish` \| `schedule` |
| `scheduled_at` | only if `schedule` | —                | future ISO-8601, e.g. `2026-07-01T09:00:00Z` |
| `linkedin`     | no                 | `false`          | `true` also distributes to LinkedIn (see below) |

### `status`
- `draft` — saved, not public. Review and publish it later from the admin panel.
- `publish` — live immediately at `/p/<slug>`.
- `schedule` — goes live automatically at `scheduled_at`.

### `linkedin`
LinkedIn distribution is handled by an existing hourly job, not by this endpoint.
Set `linkedin: true` to opt an article in; it then posts (title + excerpt + link)
on the next hourly run.

> **Important:** the job only posts **published or scheduled** articles, and only
> within a ~6-hour freshness window. So `linkedin: true` works with `status:"publish"`
> or `status:"schedule"`. With `status:"draft"` it has no effect until the article is
> published (and may then be too old to auto-post) — the response returns a `warnings`
> entry in that case.

## Markdown you can use

- **Headings:** `#` … `######`
- **Emphasis:** `**bold**`, `*italic*`, `~~strikethrough~~`
- **Lists:** `- bullet` and `1. numbered` (nesting allowed)
- **Tables (GFM):**
  ```
  | Feature      | Status |
  |--------------|--------|
  | Tables       | ✅     |
  | Formatting   | ✅     |
  ```
- **Blockquotes:** `> quoted text`
- **Callouts:** `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]`, `> [!DANGER]`
- **Code:** `` `inline` `` and triple-backtick fenced blocks (with a language for highlighting)
- **Footnotes:** `text[^1]` … and at the end `[^1]: the note`
- **Links:** `[label](https://example.com)`
- **Embeds:** paste a **bare** YouTube, CodePen, or X/Twitter link on its own line — it's auto-embedded.

### Not supported
- **Images** — `![alt](url)` and any `<img>`/`<figure>` are removed by the sanitizer.
  The blog is intentionally text-only. Don't include them.
- Arbitrary raw HTML beyond the safe set is stripped; iframes are allowed only for
  YouTube / CodePen.

## Example

```bash
curl -X POST https://blog.amrelharony.com/api/articles \
  -H "Authorization: Bearer $ARTICLES_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Comparing Payment Rails in 2026",
    "category": "Fintech",
    "tags": ["payments", "fintech"],
    "excerpt": "ACH vs RTP vs cards — where each one wins.",
    "status": "publish",
    "linkedin": true,
    "content": "## The landscape\n\nThree rails dominate.\n\n| Rail | Speed | Cost |\n|------|-------|------|\n| ACH  | 1–2 days | low |\n| RTP  | instant | medium |\n| Cards| instant | high |\n\n> [!NOTE]\n> Settlement speed and cost usually trade off against each other.\n"
  }'
```

### Success (HTTP 201)

```json
{
  "ok": true,
  "id": "…uuid…",
  "slug": "comparing-payment-rails-in-2026",
  "url": "https://blog.amrelharony.com/p/comparing-payment-rails-in-2026",
  "status": "publish",
  "published": true,
  "scheduled_at": null,
  "linkedin_posted": false,
  "warnings": []
}
```

### Errors

`{ "ok": false, "error": "<message>", "field": "<optional>" }`

| status | when |
|--------|------|
| `400`  | invalid JSON, missing `title`/`content`, bad `category`/`status`, `schedule` without a valid future `scheduled_at`, un-sluggable title |
| `401`  | missing/incorrect API key |
| `409`  | an explicit `slug` is already in use |
| `413`  | body larger than ~1 MB |
| `500`  | server misconfiguration or DB error |

## Server configuration (one-time)

Set both in the deployment environment (and the local `.env.local`):

- `ARTICLES_API_KEY` — the secret the agent sends. Generate a long random value.
- `SUPABASE_SERVICE_ROLE_KEY` — already part of the env template; required for the
  endpoint to write. Keep both strictly server-side.
