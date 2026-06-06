// Real device-preview check.
//
// Boots the actual Next app against a local mock of the public Supabase reads,
// then drives it with Playwright under several phone profiles. For each
// device × page it captures a full-page screenshot AND runs hard assertions
// that gate the mobile UX work:
//
//   1. no horizontal overflow (scrollWidth ≤ viewport)
//   2. every visible text field is ≥ 16px (no iOS focus-zoom)
//   3. primary tap targets aren't tiny (hard-fail < 24px, warn < 44px)
//
// Usage:  npm run preview:devices
// Browsers: uses PLAYWRIGHT_BROWSERS_PATH if set, else `npx playwright install chromium`.
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium, devices } from "playwright";
import { createMockServer, MOCK_PORT } from "./mock-supabase.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "shots");
const APP_PORT = 3100;
const BASE = `http://127.0.0.1:${APP_PORT}`;

// Matrix is overridable via env (comma-separated) so CI / smoke runs can scope it,
// e.g. PREVIEW_DEVICES="iPhone 13" PREVIEW_THEMES=dark npm run preview:devices
const list = (v, d) => (v || d).split(",").map((s) => s.trim()).filter(Boolean);
const DEVICES = list(process.env.PREVIEW_DEVICES, "iPhone SE,iPhone 13,Pixel 7");
const THEMES = list(process.env.PREVIEW_THEMES, "dark,light"); // .light-mode ← localStorage.theme
const PAGES = [
  { name: "feed", path: "/" },
  { name: "thoughts", path: "/thoughts" },
  { name: "article", path: "/p/preview-article" },
];
const TARGET_SELECTORS = [
  ".sc-btn", ".lb-tag-chip", ".lb-share-icon", ".lb-bookmark-btn",
  ".lb-tts-btn", ".blog-reaction-btn", ".blog-action-btn", ".blog-filter-btn",
  ".blog-comment-send", ".lb-nav-back",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    try {
      const ctrl = AbortSignal.timeout(8000);
      const res = await fetch(url, { signal: ctrl });
      if (res.status < 500) return true;
    } catch { /* still compiling */ }
    await sleep(1500);
  }
  return false;
}

// Runs in the page. Returns measurements; serializable only.
function audit(targetSelectors) {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const label = (el) =>
    el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/)[0]
      : el.tagName.toLowerCase();

  const fields = [...document.querySelectorAll("input, textarea")].filter(
    (el) => vis(el) && !["hidden", "checkbox", "radio", "range", "submit", "button"].includes(el.type),
  );
  const inputs = fields.map((el) => ({
    sel: label(el),
    type: el.type || "text",
    fontSize: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
  }));

  const targets = [];
  for (const sel of targetSelectors) {
    const els = [...document.querySelectorAll(sel)].filter(vis);
    if (!els.length) continue;
    const minH = Math.min(...els.map((el) => Math.round(el.getBoundingClientRect().height)));
    targets.push({ sel, count: els.length, minHeight: minH });
  }

  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    coarse: matchMedia("(pointer: coarse)").matches,
    inputs,
    targets,
  };
}

function evalRow(device, theme, page, m) {
  const problems = [];
  const warnings = [];
  if (m.scrollWidth > m.innerWidth + 2)
    problems.push(`h-overflow ${m.scrollWidth}>${m.innerWidth}`);
  for (const i of m.inputs)
    if (i.fontSize < 16) problems.push(`${i.sel}(${i.type}) ${i.fontSize}px<16`);
  // FAIL under 30px (well below WCAG 2.5.8's 24px floor once you account for
  // spacing); WARN under 40px (a comfortable touch minimum, shy of the 44px ideal).
  for (const t of m.targets) {
    if (t.minHeight < 30) problems.push(`${t.sel} ${t.minHeight}px<30`);
    else if (t.minHeight < 40) warnings.push(`${t.sel} ${t.minHeight}px`);
  }
  return { device, theme, page, ...m, problems, warnings, ok: problems.length === 0 };
}

async function main() {
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  // 1. mock supabase
  const mock = createMockServer();
  await new Promise((res) => mock.listen(MOCK_PORT, "127.0.0.1", res));
  console.log(`▸ mock supabase on http://127.0.0.1:${MOCK_PORT}`);

  // 2. real next dev
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "preview-anon-key",
    NEXT_PUBLIC_SITE_URL: BASE,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  console.log(`▸ starting next dev on ${BASE} …`);
  const dev = spawn("node_modules/.bin/next", ["dev", "-p", String(APP_PORT)], {
    env, stdio: ["ignore", "pipe", "pipe"],
  });
  dev.stdout.on("data", (d) => process.env.PREVIEW_VERBOSE && process.stdout.write(`[next] ${d}`));
  dev.stderr.on("data", (d) => process.env.PREVIEW_VERBOSE && process.stderr.write(`[next] ${d}`));

  const results = [];
  let browser;
  try {
    if (!(await waitForServer(BASE, 150000))) throw new Error("next dev did not become ready");
    console.log("▸ app is up — launching chromium\n");
    browser = await chromium.launch();

    for (const dname of DEVICES) {
      const device = devices[dname];
      for (const theme of THEMES) {
        const ctx = await browser.newContext({
          ...device,
          reducedMotion: "reduce", // skips the intro overlay + heavy anims for clean, stable shots
          colorScheme: theme,
        });
        // Pin the theme so screenshots are deterministic (it's time-of-day by default).
        // .light-mode is applied pre-paint from localStorage.theme by the inline script.
        await ctx.addInitScript((t) => {
          try { localStorage.setItem("theme", t); } catch {}
        }, theme);
        const page = await ctx.newPage();

        for (const p of PAGES) {
          const tag = `${dname.replace(/\s+/g, "-")}__${theme}__${p.name}`;
          try {
            await page.goto(BASE + p.path, { waitUntil: "load", timeout: 60000 });
            await page.waitForSelector(".lb-nav", { timeout: 30000 }).catch(() => {});
            // let the intro detach + fonts settle
            await page.waitForFunction(() => !document.getElementById("blog-intro"), null, { timeout: 8000 }).catch(() => {});
            await sleep(900);
            // Force the final, revealed state for the capture: scroll-reveal elements
            // (.lb-reveal animate in on intersection; .blog-post likewise) would
            // otherwise be invisible in a headless full-page shot.
            await page.addStyleTag({
              content: ".blog-post,.lb-reveal,.lb-reveal-left{opacity:1!important;transform:none!important}",
            }).catch(() => {});
            await sleep(150);
            await page.screenshot({ path: join(SHOTS, `${tag}.png`), fullPage: true });
            const m = await page.evaluate(audit, TARGET_SELECTORS);
            results.push(evalRow(dname, theme, p.name, m));
          } catch (e) {
            results.push({ device: dname, theme, page: p.name, error: String(e.message || e), problems: ["load-failed"], warnings: [], ok: false });
          }
        }
        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    dev.kill("SIGTERM");
    await sleep(500);
    if (!dev.killed) dev.kill("SIGKILL");
    mock.close();
  }

  // ── report ──
  await writeFile(join(SHOTS, "report.json"), JSON.stringify(results, null, 2));
  console.log("\n──────── DEVICE PREVIEW REPORT ────────");
  for (const r of results) {
    const head = `${r.ok ? "✓" : "✗"} ${r.device.padEnd(11)} ${r.theme.padEnd(5)} ${r.page.padEnd(9)}`;
    if (r.error) { console.log(`${head}  ERROR ${r.error}`); continue; }
    const tgt = r.targets.map((t) => `${t.sel}=${t.minHeight}`).join(" ");
    console.log(`${head}  width ${r.scrollWidth}/${r.innerWidth}  inputs[${r.inputs.map((i) => i.fontSize).join(",") || "-"}]`);
    if (tgt) console.log(`                    targets ${tgt}`);
    if (r.warnings.length) console.log(`                    ⚠ under-40px: ${r.warnings.join(", ")}`);
    if (r.problems.length) console.log(`                    ✗ ${r.problems.join(", ")}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log("───────────────────────────────────────");
  console.log(`${results.length - failed.length}/${results.length} passed · screenshots → scripts/device-preview/shots/`);
  if (failed.length) {
    console.log(`FAILED: ${failed.map((r) => `${r.device}/${r.theme}/${r.page}`).join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
