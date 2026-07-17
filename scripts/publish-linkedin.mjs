// publish-linkedin.js — Publish scheduled Supabase posts to LinkedIn
// Runs via GitHub Actions cron every 30 minutes
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY,
//   LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_URN
//   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REFRESH_TOKEN (for auto-refresh)

const SITE = 'https://blog.amrelharony.com';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const LI_TOKEN_VAR = { value: process.env.LINKEDIN_ACCESS_TOKEN };
const LI_PERSON = process.env.LINKEDIN_PERSON_URN;

// Safety guards (configurable): never auto-post items whose effective publish
// time is older than MAX_AGE_HOURS, and post at most MAX_PER_RUN items per run,
// so a first run / re-enable can't dump the whole back catalogue to LinkedIn.
const MAX_AGE_HOURS = Number(process.env.LINKEDIN_MAX_AGE_HOURS) || 6;
const MAX_PER_RUN = Number(process.env.LINKEDIN_MAX_PER_RUN) || 5;
let runBudget = MAX_PER_RUN;

function withinWindow(row) {
  const t = row.scheduled_at || row.created_at;
  const ms = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(ms) && ms >= Date.now() - MAX_AGE_HOURS * 3600000;
}

if (!SB_URL || !SB_KEY || !LI_TOKEN_VAR.value || !LI_PERSON) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const sbHeaders = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Prefer': 'return=minimal'
};

async function sbQuery(table, filter) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbUpdate(table, id, data) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table}/${id}: ${res.status} ${await res.text()}`);
}

// Persist the LinkedIn dedup flag in its OWN write, retried, so a transient failure of
// a later bookkeeping update can't leave a row that was already posted eligible for a
// re-post on the next cron run (the linkedin_posted flag is the only dedup guard).
async function markLinkedinPosted(table, id) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await sbUpdate(table, id, { linkedin_posted: true });
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function refreshTokenIfNeeded() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const refreshToken = process.env.LINKEDIN_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return;

  const testRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${LI_TOKEN_VAR.value}` }
  });

  if (testRes.status === 401) {
    console.log('Access token expired, refreshing...');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    });
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`LinkedIn token refresh failed: ${tokenRes.status} ${body}`);
    }
    const tokenData = await tokenRes.json();
    LI_TOKEN_VAR.value = tokenData.access_token;
    console.log('Token refreshed successfully. Update LINKEDIN_ACCESS_TOKEN secret with the new token.');
    console.log('::warning::LinkedIn access token was refreshed. Update the LINKEDIN_ACCESS_TOKEN repository secret with the new token.');
  }
}

async function uploadImageToLinkedIn(imageUrl) {
  if (!imageUrl) return null;

  console.log(`  Downloading image: ${imageUrl}`);
  // Defense-in-depth SSRF/size guards (mirrors app/api/cover-proxy): the URL is
  // agent-supplied. redirect:manual stops a 3xx bounce to an internal host; the
  // AbortController bounds a slow host; the streamed cap stops an oversized/lying
  // body from OOM-ing the runner; content-type must be an image.
  const MAX_IMG_BYTES = 5 * 1024 * 1024;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let imgRes;
  try {
    imgRes = await fetch(imageUrl, { signal: ctrl.signal, redirect: 'manual' });
  } catch (e) {
    clearTimeout(timer);
    console.log(`  ✗ Image download failed: ${e.message}`);
    return null;
  }
  clearTimeout(timer);
  if (imgRes.type === 'opaqueredirect' || (imgRes.status >= 300 && imgRes.status < 400)) {
    console.log(`  ✗ Image redirect not allowed`);
    return null;
  }
  if (!imgRes.ok) {
    console.log(`  ✗ Image download failed: ${imgRes.status} ${imgRes.statusText}`);
    return null;
  }
  const ct = imgRes.headers.get('content-type') || '';
  if (!/^image\//i.test(ct)) {
    console.log(`  ✗ Not an image (content-type: ${ct || 'none'})`);
    return null;
  }
  if (parseInt(imgRes.headers.get('content-length') || '0', 10) > MAX_IMG_BYTES) {
    console.log(`  ✗ Image too large (>5MB)`);
    return null;
  }
  const reader = imgRes.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMG_BYTES) {
      try { await reader.cancel(); } catch {}
      console.log(`  ✗ Image too large (>5MB)`);
      return null;
    }
    chunks.push(value);
  }
  const imgBuffer = Buffer.concat(chunks);
  console.log(`  ✓ Image downloaded: ${imgBuffer.length} bytes`);

  console.log(`  Initializing LinkedIn image upload (owner: ${LI_PERSON})...`);
  const initRes = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LI_TOKEN_VAR.value}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202601'
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: LI_PERSON } })
  });
  if (!initRes.ok) {
    const errBody = await initRes.text();
    console.log(`  ✗ LinkedIn image init failed: ${initRes.status} ${errBody}`);
    return null;
  }
  const initData = await initRes.json();
  const { uploadUrl, image: imageUrn } = initData.value;
  console.log(`  ✓ Got upload URL, image URN: ${imageUrn}`);

  console.log(`  Uploading binary to LinkedIn...`);
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${LI_TOKEN_VAR.value}`,
      'Content-Type': 'application/octet-stream'
    },
    body: imgBuffer
  });
  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    console.log(`  ✗ LinkedIn image upload failed: ${uploadRes.status} ${errBody}`);
    return null;
  }

  console.log(`  ✓ Uploaded image → ${imageUrn}`);
  return imageUrn;
}

async function postToLinkedIn(text, articleUrl, thumbnailUrn) {
  const body = {
    author: LI_PERSON,
    lifecycleState: 'PUBLISHED',
    visibility: 'PUBLIC',
    commentary: text,
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: []
    }
  };

  if (articleUrl) {
    body.content = {
      article: {
        source: articleUrl,
        title: text.split('\n')[0] || 'New Article'
      }
    };
    if (thumbnailUrn) body.content.article.thumbnail = thumbnailUrn;
  }

  console.log(`  Creating LinkedIn post (type: ${articleUrl ? 'article' : 'text'})...`);
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LI_TOKEN_VAR.value}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202601'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LinkedIn POST failed: ${res.status} ${errBody}`);
  }

  const postId = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || '';
  console.log(`  ✓ LinkedIn post created: ${postId}`);
  return postId;
}

async function postToLinkedInWithImage(text, imageUrn) {
  const body = {
    author: LI_PERSON,
    lifecycleState: 'PUBLISHED',
    visibility: 'PUBLIC',
    commentary: text,
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    content: {
      media: { id: imageUrn }
    }
  };

  console.log(`  Creating LinkedIn post (type: image, urn: ${imageUrn})...`);
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LI_TOKEN_VAR.value}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202601'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LinkedIn POST (image) failed: ${res.status} ${errBody}`);
  }

  const postId = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || '';
  console.log(`  ✓ LinkedIn image post created: ${postId}`);
  return postId;
}

async function publishThoughts() {
  const now = new Date().toISOString();
  const rows = await sbQuery('microblog',
    `select=id,content,image_url,published,created_at,scheduled_at&linkedin_posted=eq.false&or=(and(published.eq.true,scheduled_at.is.null),and(scheduled_at.not.is.null,scheduled_at.lte.${now}))`
  );

  const fresh = rows.filter(withinWindow);
  const batch = fresh.slice(0, runBudget);
  runBudget -= batch.length;
  console.log(`Found ${rows.length} thought(s) due; ${fresh.length} within ${MAX_AGE_HOURS}h window; posting ${batch.length} (run budget left: ${runBudget})`);

  for (const row of batch) {
    try {
      console.log(`Publishing thought ${row.id}...`);

      if (row.image_url) {
        const imageUrn = await uploadImageToLinkedIn(row.image_url);
        if (imageUrn) {
          await postToLinkedInWithImage(row.content, imageUrn);
        } else {
          await postToLinkedIn(row.content);
        }
      } else {
        await postToLinkedIn(row.content);
      }

      // Dedup flag first (own retried write), then bookkeeping — see publishArticles.
      await markLinkedinPosted('microblog', row.id);
      await sbUpdate('microblog', row.id, { published: true });
      console.log(`  Done: ${row.id}`);
    } catch (err) {
      console.error(`  Failed thought ${row.id}: ${err.message}`);
    }
  }
}

async function publishArticles() {
  const now = new Date().toISOString();
  // Mirror publishThoughts' predicate: an immediate publish (published + no schedule),
  // or a scheduled post that has come due. A bare `published.eq.true` would also match
  // an article that is published but has a still-FUTURE scheduled_at, posting it early.
  const rows = await sbQuery('longform_articles',
    `select=id,title,slug,excerpt,cover_image,published,scheduled_at,created_at&linkedin_posted=eq.false&or=(and(published.eq.true,scheduled_at.is.null),and(scheduled_at.not.is.null,scheduled_at.lte.${now}))`
  );

  const fresh = rows.filter(withinWindow);
  const batch = fresh.slice(0, runBudget);
  runBudget -= batch.length;
  console.log(`Found ${rows.length} article(s) due; ${fresh.length} within ${MAX_AGE_HOURS}h window; posting ${batch.length} (run budget left: ${runBudget})`);

  for (const row of batch) {
    try {
      console.log(`Publishing article "${row.title}" (${row.id})...`);
      console.log(`  cover_image: ${row.cover_image || '(none)'}`);

      if (!row.published) {
        await sbUpdate('longform_articles', row.id, { published: true, ...(row.scheduled_at ? { created_at: row.scheduled_at } : {}) });
        console.log(`  Set published=true for scheduled article`);
      }

      const url = `${SITE}/p/${encodeURIComponent(row.slug)}`;
      const text = `${row.title}\n\n${row.excerpt || ''}\n\nRead more: ${url}`.trim();

      let thumbnailUrn = null;
      if (row.cover_image) {
        thumbnailUrn = await uploadImageToLinkedIn(row.cover_image);
        if (!thumbnailUrn) console.log(`  Thumbnail upload failed, posting without image`);
      }
      await postToLinkedIn(text, url, thumbnailUrn);

      // Set the dedup flag FIRST in its own retried write; only then do the (less
      // critical) bookkeeping, so a failure there can't cause a duplicate post.
      await markLinkedinPosted('longform_articles', row.id);
      if (row.scheduled_at) {
        await sbUpdate('longform_articles', row.id, { published: true, created_at: row.scheduled_at });
      }
      console.log(`  Done: ${row.id}`);
    } catch (err) {
      console.error(`  Failed article ${row.id}: ${err.message}`);
    }
  }
}

async function main() {
  const ts = new Date().toISOString();
  console.log(`[${ts}] LinkedIn publish run starting...`);

  await refreshTokenIfNeeded();
  await publishThoughts();
  await publishArticles();

  console.log(`[${new Date().toISOString()}] Done.`);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
