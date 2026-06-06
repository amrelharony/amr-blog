#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs JS dependencies so lint, the build, and the device-preview check
# (npm run preview:devices) are ready to run in-session. The matching Playwright
# Chromium is pre-provisioned in the web environment via PLAYWRIGHT_BROWSERS_PATH,
# so no browser download is needed here (the download CDN is firewalled anyway).
set -euo pipefail

# Only run in the remote (web) environment; local sessions manage their own deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# npm install (not ci) so the cached container layer is reused across sessions.
npm install --no-audit --no-fund
