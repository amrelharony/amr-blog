// linkedin-auth.mjs — Mint LinkedIn API credentials via the OAuth authorization-code flow.
//
// One-shot local helper for switching / re-minting the account that
// scripts/publish-linkedin.mjs posts as. Runs a tiny local server to catch the
// redirect, exchanges the code for tokens, then reads /v2/userinfo to derive the
// person URN. Prints everything ready to paste into GitHub Actions secrets.
//
// Usage (run in a terminal, with a browser logged in as the TARGET account):
//   LINKEDIN_CLIENT_ID=... LINKEDIN_CLIENT_SECRET=... node scripts/linkedin-auth.mjs
//
// Env vars:
//   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET   (required — the LinkedIn app)
//   LINKEDIN_REDIRECT_URI                         (optional, default http://localhost:8765/callback)
//                                                  must be registered in the app's Authorized redirect URLs
//   LINKEDIN_EXPECTED_EMAIL                        (optional, default elharonyclaw@gmail.com)
//                                                  warns if the authorized account's email differs
//
// The app must grant scopes: openid profile email (for the URN) + w_member_social (to post).

import http from 'node:http';
import crypto from 'node:crypto';

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:8765/callback';
const EXPECTED_EMAIL = (process.env.LINKEDIN_EXPECTED_EMAIL || 'elharonyclaw@gmail.com').toLowerCase();
const SCOPE = 'openid profile email w_member_social';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET');
  process.exit(1);
}

let redirect;
try {
  redirect = new URL(REDIRECT_URI);
} catch {
  console.error(`Invalid LINKEDIN_REDIRECT_URI: ${REDIRECT_URI}`);
  process.exit(1);
}
if (redirect.hostname !== 'localhost' && redirect.hostname !== '127.0.0.1') {
  console.error('LINKEDIN_REDIRECT_URI must point at localhost so this script can catch the callback');
  process.exit(1);
}
const PORT = Number(redirect.port) || 80;

const state = crypto.randomBytes(16).toString('hex');

const authUrl = 'https://www.linkedin.com/oauth/v2/authorization?' + new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  state,
  scope: SCOPE
}).toString();

async function exchangeCode(code) {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }).toString()
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchUserinfo(accessToken) {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`/v2/userinfo failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function shellQuote(v) {
  return `'${String(v).replace(/'/g, `'\\''`)}'`;
}

function report(tokens, info) {
  const personUrn = `urn:li:person:${info.sub}`;
  const accountEmail = (info.email || '').toLowerCase();

  console.log('\n──────────────────────────────────────────────');
  console.log(`Authorized account: ${info.name || '(no name)'} <${info.email || 'no email'}>`);
  if (!accountEmail) {
    console.log('⚠ No email in /v2/userinfo (the app may lack the "email" scope) — verify the account manually.');
  } else if (accountEmail !== EXPECTED_EMAIL) {
    console.log(`⚠ WARNING: authorized account (${accountEmail}) is NOT ${EXPECTED_EMAIL}.`);
    console.log('  You likely authorized in a browser logged into the wrong account. Re-run and switch accounts first.');
  } else {
    console.log(`✓ Account matches expected ${EXPECTED_EMAIL}`);
  }
  if (!tokens.refresh_token) {
    console.log('⚠ No refresh_token returned — the cron auto-refresh will be disabled for this account.');
    console.log('  Enable refresh tokens for the app (or it will need manual re-minting every ~60 days).');
  }
  console.log('──────────────────────────────────────────────\n');

  console.log('Values:');
  console.log(`  LINKEDIN_ACCESS_TOKEN  = ${tokens.access_token}`);
  console.log(`  LINKEDIN_REFRESH_TOKEN = ${tokens.refresh_token || '(none)'}`);
  console.log(`  LINKEDIN_PERSON_URN    = ${personUrn}`);
  console.log(`  (access token expires in ~${Math.round((tokens.expires_in || 0) / 86400)} day(s))\n`);

  console.log('Set the GitHub Actions secrets (run from the repo):');
  console.log(`  gh secret set LINKEDIN_ACCESS_TOKEN  --body ${shellQuote(tokens.access_token)}`);
  if (tokens.refresh_token) {
    console.log(`  gh secret set LINKEDIN_REFRESH_TOKEN --body ${shellQuote(tokens.refresh_token)}`);
  }
  console.log(`  gh secret set LINKEDIN_PERSON_URN    --body ${shellQuote(personUrn)}`);
  console.log('  # only if you created a NEW app, also set LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET\n');
}

// `body` carries provider-supplied query values (error / error_description) straight
// off the callback URL, so escape both — otherwise loading
// http://localhost:8765/callback?error=<script>… while this one-shot server is
// listening reflects that markup into the page.
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(title, body) {
  const t = escHtml(title);
  return `<!doctype html><meta charset="utf-8"><title>${t}</title>` +
    `<body style="font:16px system-ui;margin:3rem"><h1>${t}</h1><p>${escHtml(body)}</p></body>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== redirect.pathname) {
    res.writeHead(404).end();
    return;
  }

  const err = url.searchParams.get('error');
  if (err) {
    const desc = url.searchParams.get('error_description') || '';
    res.writeHead(400, { 'Content-Type': 'text/html' }).end(html('Authorization failed', `${err}: ${desc}`));
    console.error(`\n✗ Authorization denied: ${err} ${desc}`);
    server.close();
    process.exit(1);
  }

  if (url.searchParams.get('state') !== state) {
    res.writeHead(400, { 'Content-Type': 'text/html' }).end(html('State mismatch', 'Possible CSRF — re-run the script.'));
    console.error('\n✗ State mismatch — aborting.');
    server.close();
    process.exit(1);
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' }).end(html('No code', 'No authorization code in callback.'));
    return;
  }

  try {
    console.log('✓ Received authorization code, exchanging for tokens...');
    const tokens = await exchangeCode(code);
    console.log('✓ Got tokens, reading /v2/userinfo...');
    const info = await fetchUserinfo(tokens.access_token);
    res.writeHead(200, { 'Content-Type': 'text/html' })
      .end(html('Done', 'Tokens minted. Return to your terminal for the values.'));
    report(tokens, info);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html' }).end(html('Error', e.message));
    console.error(`\n✗ ${e.message}`);
    server.close();
    process.exit(1);
  }
  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`Listening for the LinkedIn callback on ${REDIRECT_URI}`);
  console.log('\nMake sure this exact URL is in the app\'s "Authorized redirect URLs", then open this in a');
  console.log(`browser logged in as ${EXPECTED_EMAIL} and approve:\n`);
  console.log(`  ${authUrl}\n`);
});
