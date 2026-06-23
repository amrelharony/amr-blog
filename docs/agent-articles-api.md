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
| `slug`         | no                 | derived from title | URL segment `/p/<slug>`. If you pass one that's taken → `409`. If omitted, a slug is generated from the title (a short random suffix is appended on collision). |
| `excerpt`      | no                 | `""`             | short summary; also used in the LinkedIn share text. **Max 500 chars** (keep it short — title + excerpt must fit LinkedIn's post limit) |
| `tags`         | no                 | `[]`             | array `["ai","fintech"]` or comma string `"ai, fintech"`. Max 20 tags, 50 chars each (extras trimmed) |
| `category`     | no                 | none             | exactly one of `Fintech`, `Leadership`, `Business`, `Tech` (case-insensitive) — or omit |
| `cover_image`  | no                 | `""`             | **HTTPS** image URL; used only as a LinkedIn thumbnail (never shown on the blog) |
| `source_url`   | no                 | none             | attribution / canonical link (`http` or `https`) |
| `series_name`  | no                 | none             | groups posts into a series (max 200 chars) |
| `series_order` | no                 | `0`              | order within the series |
| `tldr`         | no                 | none             | one-line summary shown on the article (max 500 chars) |
| `status`       | no                 | `"draft"`        | `draft` \| `publish` \| `schedule` |
| `scheduled_at` | only if `schedule` | —                | future ISO-8601 within ~2 years, e.g. `2026-07-01T09:00:00Z` |
| `linkedin`     | no                 | `false`          | `true` also distributes to LinkedIn (see below) |
| `pdf_url`      | no                 | none             | HTTPS URL of a PDF you host (see "Attaching a PDF") — rendered inline |
| `pdf_name`     | no                 | from `pdf_url`   | download label for the PDF; defaults to the URL's filename |

### `status`
- `draft` — saved, not public. Review and publish it later from the admin panel.
- `publish` — live immediately at `/p/<slug>` (the listings/sitemap/feed are refreshed on publish).
- `schedule` — goes live at `scheduled_at`, flipped by a background cron. **For an exact go-live
  time, prefer `publish`** (send the request when you want it live): scheduled publishing runs on
  the deployment's cron cadence and can lag behind `scheduled_at`.

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
  "pdf_url": null,
  "pdf_name": null,
  "warnings": []
}
```

(`pdf_url`/`pdf_name` are non-null only when you attach a PDF — see below.)

### Errors

`{ "ok": false, "error": "<message>", "field": "<optional>" }`

| status | when |
|--------|------|
| `400`  | invalid JSON, missing `title`/`content`, a field over its length cap (`title`/`excerpt`/`tldr`/`series_name`), bad `category`/`status`, `schedule` without a valid future `scheduled_at`, un-sluggable title, or a `pdf_url`/`cover_image`/`source_url` that isn't a valid URL of the allowed scheme |
| `401`  | missing/incorrect API key (or the server's `ARTICLES_API_KEY` isn't set) |
| `409`  | the slug is already in use — an explicit `slug` you sent, or (very rarely) an auto-generated one after retries are exhausted; for an auto slug, just retry |
| `413`  | body larger than ~1 MB |
| `500`  | server misconfiguration or DB error |

## Attaching a PDF

To attach a PDF that renders **inline** in the article (mobile-friendly viewer,
with download / open-in-new-tab links): **host the PDF yourself on the VPS** and
pass its URL as `pdf_url`. The blog stores the URL and the in-browser pdf.js viewer
fetches it directly — there is no upload.

```bash
curl -X POST https://blog.amrelharony.com/api/articles \
  -H "Authorization: Bearer $ARTICLES_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Q2 Market Report",
    "category": "Business",
    "status": "publish",
    "content": "## Highlights\n\nFull analysis in the PDF below.\n",
    "pdf_url": "https://files.your-vps.com/pdfs/q2-report.pdf",
    "pdf_name": "Q2-Market-Report.pdf"
  }'
```

The response includes the `pdf_url` and `pdf_name` you sent (omit `pdf_name` and
it's derived from the URL's filename).

**Your VPS must serve the PDF with:**
- **HTTPS** with a valid cert — the blog is HTTPS, so an `http://` URL is blocked as
  mixed content. (`pdf_url` must start with `https://` or you get a `400`.)
- a **CORS** header allowing the blog origin — the viewer fetches cross-origin:
  `Access-Control-Allow-Origin: https://blog.amrelharony.com`
- `Content-Type: application/pdf` (and ideally `Accept-Ranges: bytes`).

nginx example:
```nginx
location /pdfs/ {
    root /var/www;                      # serves /var/www/pdfs/*.pdf
    default_type application/pdf;
    add_header Access-Control-Allow-Origin  "https://blog.amrelharony.com" always;
    add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Range" always;
}
```

**Notes**
- One PDF per article. Omit `pdf_url` for a normal text-only article.
- The no-images rule for the **article body** still applies. The PDF is a separate
  asset rendered *outside* the article text, so it doesn't change that.

> **Privacy:** the PDF URL is public — anyone with the link can view or download it
> (same as a published article). Don't host anything confidential there. **Uptime:**
> if the VPS is down or the file is removed, the viewer shows an error with the
> download/open links still available.

## Server configuration (one-time)

Set both in the deployment environment (and the local `.env.local`):

- `ARTICLES_API_KEY` — the secret the agent sends. Generate a long random value.
- `SUPABASE_SERVICE_ROLE_KEY` — already part of the env template; required for the
  endpoint to write. Keep both strictly server-side.
