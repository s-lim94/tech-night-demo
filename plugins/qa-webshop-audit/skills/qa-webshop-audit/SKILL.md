---
name: qa-webshop-audit
description: Reads a QA spec file (YAML), drives a real browser to audit a target website (works on SPAs), captures screenshots as visual evidence, and generates a structured QA report. Designed for live demos.
---

# QA Webshop Audit Skill (Browser-Driven)

You are a QA audit agent. Your job is to read a QA specification file, **drive a real browser** against the target website, perform actual user interactions, capture screenshots, and produce a professional QA report with visual evidence.

This skill uses **browser automation** so it works on modern SPAs (React, Vue, Angular) where content is JavaScript-rendered.

## Required Tools

This skill assumes one of the following is available:
- The `browser-use` skill / Playwright MCP server, OR
- Bash + a Playwright/Puppeteer Node script (auto-install via `npx playwright install chromium` if missing)

If neither is available, install Playwright on demand:
~~~bash
npm init -y && npm install playwright && npx playwright install chromium
~~~

## Input

The user provides a path to a `qa-spec.yaml` file. Read it first. Spec structure:

~~~yaml
target: https://webshop-external-demo.xsolla.site/
scope: functional
report_format: markdown
screenshot_dir: ./qa-screenshots
test_areas:
  - homepage loads correctly
  - navigation menu works
  - product catalog displays items
  - add to cart flow works
  - search functionality exists
  - responsive layout (mobile-ready)
~~~

## Execution Steps

### 1. Read the spec file

Parse the YAML, extract `target` URL, `test_areas`, and `screenshot_dir` (default: `./qa-screenshots`).

### 2. Launch the browser

Use the `browser-use` skill (or write a Playwright script) to launch Chromium. **Use a visible (non-headless) window during the live demo** — the audience seeing the browser open and click is the whole point.

~~~javascript
// Minimal Playwright bootstrap if writing inline
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: false, slowMo: 300 });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
~~~

`slowMo: 300` makes each action visible to the audience — critical for live demos.

### 3. For each test area, perform real interactions

Capture a screenshot for every check (file into `screenshot_dir`).

| Test Area       | Browser Actions                                                                  |
| --------------- | -------------------------------------------------------------------------------- |
| Homepage loads  | `page.goto(target)` → wait for `networkidle` → screenshot. Pass if title exists. |
| Navigation menu | Wait for `nav, [role="navigation"]` → count visible links → screenshot.          |
| Product catalog | Wait for product cards (try `[class*="product"]`, `[data-testid*="product"]`, `article`) → count items → screenshot. |
| Add to cart     | Click first "Add to Cart" button → wait for cart counter to update → screenshot before/after. |
| Search          | Locate search input (`input[type="search"]`, `[placeholder*="search" i]`) → type "demo" → press Enter → screenshot results. |
| Responsive      | Resize viewport to 375×667 (mobile) → reload → screenshot mobile layout.         |

### 4. Bonus checks (impressive add-ons)

- **Page load time**: measure `page.goto()` duration
- **Accessibility**: count `<img>` tags missing `alt` (run `page.$$eval('img:not([alt])', els => els.length)`)
- **SEO basics**: read `<title>`, meta description, og tags, canonical URL
- **Console errors**: subscribe to `page.on('console', ...)` and `page.on('pageerror', ...)` — count errors during the run
- **Network failures**: subscribe to `page.on('requestfailed', ...)` — count failed requests

### 5. Generate the QA Report

Write the report to stdout AND save to `./qa-report.md` with embedded screenshot paths. Use this format:

~~~text
╔══════════════════════════════════════════════════╗
║       QA WEBSHOP AUDIT REPORT (BROWSER)          ║
╠══════════════════════════════════════════════════╣
║  Target:  https://webshop-external-demo.xsolla.site/
║  Date:    2026-05-06
║  Browser: Chromium 1280×800 → 375×667 (mobile)
║  Mode:    Live (real browser, real interactions)
╚══════════════════════════════════════════════════╝

── Test Results ─────────────────────────────────────

  ✅ PASS  Homepage loads correctly
           Title: "Web Shop Demo | Xsolla" | Load: 1.7s
           �� screenshots/01-homepage.png

  ✅ PASS  Navigation menu works
           Found 6 nav links: Home, Shop, Cart, Account...
           �� screenshots/02-nav.png

  ✅ PASS  Product catalog displays items
           Rendered 12 product cards (post-hydration)
           �� screenshots/03-catalog.png

  ✅ PASS  Add to cart flow
           Clicked "Add to Cart" → cart count: 0 → 1 ✓
           �� screenshots/04a-before-cart.png
           �� screenshots/04b-after-cart.png

  ⚠️ WARN  Search functionality
           Search input found, but results took 2.4s
           (slow for "demo" query) — UX concern
           �� screenshots/05-search-results.png

  ✅ PASS  Responsive layout (mobile)
           375×667 viewport: nav collapses to hamburger ✓
           �� screenshots/06-mobile.png

── Summary ──────────────────────────────────────────

  Total:   6 tests
  Passed:  5  |  Warnings: 1  |  Failed: 0
  Score:   92% (Excellent)

── Bonus Findings ───────────────────────────────────

  Accessibility
   • 3 images missing alt attributes (rendered DOM)
  SEO
   • Title, description, OG, canonical all present ✓
  Console
   • 0 errors, 2 warnings (deprecated API)
  Network
   • 1 failed request (favicon.ico 404)

── Recommendations ──────────────────────────────────

  1. Add alt text to 3 product images (a11y)
  2. Investigate search latency (2.4s feels slow)
  3. Fix favicon 404
~~~

## Rules

- **Visible browser during live demo** — `headless: false`, `slowMo: 200-400ms` so the audience sees actions
- **Always capture screenshots** — they are the proof. Save them with numbered prefixes for ordering
- **Wait for hydration** — use `page.waitForLoadState('networkidle')` or wait for specific selectors before asserting
- **Use resilient selectors** — prefer `[data-testid=...]`, role-based selectors, or text-content matchers over brittle CSS classes
- **Handle failures gracefully** — wrap each test in try/catch; one broken selector should not abort the whole run
- **Close the browser cleanly** — `await browser.close()` in a `finally` block
- **Keep total runtime under 90 seconds** — tune `slowMo` and waits to stay snappy
- **Localize report timestamps** — use the user's local time, fall back to UTC

## Example Invocation

~~~bash
# In Claude Code
/qa-webshop-audit ./qa-spec.yaml

# Or as a one-shot Playwright run
node qa-audit.js ./qa-spec.yaml
~~~