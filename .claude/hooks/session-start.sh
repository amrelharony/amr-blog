#!/bin/bash
# Claude Code on the web: install dependencies so lint, typecheck, tests, and
# `next build` work in the session. Also populates node_modules/next/dist/docs,
# which AGENTS.md requires reading before touching Next APIs.
set -euo pipefail

# Local sessions already have a working node_modules; only run on the web.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `npm install` (not `npm ci`) so the cached container layer is reused across
# sessions; it's idempotent when the lockfile is unchanged.
npm install

# Note: building/running the app or doing live RLS/OG checks additionally needs
# these env vars set as environment SECRETS in the Claude Code web environment
# (they are NOT provided by this hook):
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY  (public site + admin)
#   OPENCLAW_API_KEY  (TL;DR generator / chat; SUMMARY_API_* to override)
