# LinkedIn auto-publishing

The blog auto-posts published **articles** (`longform_articles`) and **microblog thoughts**
(`microblog`) to a single LinkedIn account.

- **Worker:** [`scripts/publish-linkedin.mjs`](../scripts/publish-linkedin.mjs) — pulls due rows
  from Supabase where `linkedin_posted = false`, posts them, then flips `linkedin_posted = true`.
- **Schedule:** [`.github/workflows/publish-linkedin.yml`](../.github/workflows/publish-linkedin.yml)
  runs it **hourly** (`0 * * * *`) and on manual **Run workflow** (`workflow_dispatch`).
- **Safety guards:** never posts items older than `LINKEDIN_MAX_AGE_HOURS` (default 6) and at most
  `LINKEDIN_MAX_PER_RUN` (default 5) per run, so a re-enable can't dump the back catalogue.

The worker is **account-agnostic**: it reads the LinkedIn identity entirely from the secrets below.
Switching which account it posts as is therefore a **secrets change, not a code change**.

## Secrets (GitHub Actions → Settings → Secrets and variables → Actions)

| Secret | What it is |
| --- | --- |
| `LINKEDIN_ACCESS_TOKEN` | OAuth access token for the posting account (~60-day life; auto-refreshed) |
| `LINKEDIN_PERSON_URN` | `urn:li:person:<sub>` of the posting account |
| `LINKEDIN_REFRESH_TOKEN` | Refresh token (~365-day life) used for auto-refresh |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | The LinkedIn Developer app |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Source of the posts (unchanged when switching accounts) |

The app must grant scopes **`w_member_social`** (post via `/rest/posts`) and
**`openid profile email`** (read the person URN via `/v2/userinfo`).

## Switching the posting account

1. **Pick the app.** Reuse the existing app if the target account can authorize it (for apps in
   LinkedIn "Development" status, only members with a role on the app can authorize — add the target
   account as a team member, or use a standard/verified app). Otherwise create a new app, enable the
   "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" products, and use its
   client id/secret.

2. **Register the redirect URL.** Add `http://localhost:8765/callback` (or whatever you pass as
   `LINKEDIN_REDIRECT_URI`) to the app's **Authorized redirect URLs** — it must match exactly.

3. **Mint tokens for the target account.** In a browser logged in as the target account, run:

   ```sh
   LINKEDIN_CLIENT_ID=...  LINKEDIN_CLIENT_SECRET=...  node scripts/linkedin-auth.mjs
   ```

   Open the printed authorization URL, approve, and the script prints the new
   `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_REFRESH_TOKEN`, `LINKEDIN_PERSON_URN`, plus ready-to-run
   `gh secret set ...` commands. It **warns if the authorized account's email is not the expected
   one** (default `elharonyclaw@gmail.com`; override with `LINKEDIN_EXPECTED_EMAIL`).

4. **Update the secrets** with the printed values:

   ```sh
   gh secret set LINKEDIN_ACCESS_TOKEN  --body '<new>'
   gh secret set LINKEDIN_REFRESH_TOKEN --body '<new>'
   gh secret set LINKEDIN_PERSON_URN    --body 'urn:li:person:<sub>'
   # only if you created a NEW app:
   gh secret set LINKEDIN_CLIENT_ID     --body '<new>'
   gh secret set LINKEDIN_CLIENT_SECRET --body '<new>'
   ```

5. **Verify.** Trigger the workflow manually and confirm the post lands on the new account — see
   below.

## Verify

- `gh workflow run "Publish Scheduled Posts to LinkedIn"` (or Actions → **Run workflow**).
- In the run logs, look for `LinkedIn post created` and that image-upload logs show
  `owner: urn:li:person:<new sub>`.
- End-to-end: create one test thought/article with a near-now publish time (inside the 6h window),
  run the workflow, confirm it appears on the **new** account's feed and **not** the old one, and
  that the Supabase row flipped `linkedin_posted = true`. Then delete the test post.

## Gotchas

- **Authorize mismatch** is the most common failure — if the target account can't authorize the
  existing app, create a new app (step 1).
- **Missing `w_member_social`** → `/rest/posts` returns 403.
- **Switch blast radius:** after swapping secrets, the next run posts any due items with
  `linkedin_posted = false` within the 6h window (max `LINKEDIN_MAX_PER_RUN`) to the new account.
  Already-posted items have `linkedin_posted = true` and won't re-post. To avoid a surprise burst,
  swap when nothing fresh is pending, or temporarily lower `LINKEDIN_MAX_PER_RUN`, and test with
  `workflow_dispatch` first.
- **Person vs Page:** a personal account uses `urn:li:person:<sub>` (what the helper produces). A
  Company Page would need `urn:li:organization:<id>` and different scopes — not covered here.
- **Token rotation:** the cron's `refreshTokenIfNeeded()` auto-refreshes the access token; it logs a
  `::warning::` reminding you to update `LINKEDIN_ACCESS_TOKEN` with the refreshed value. No action
  needed until the refresh token itself expires (~1 year), at which point re-run `linkedin-auth.mjs`.
