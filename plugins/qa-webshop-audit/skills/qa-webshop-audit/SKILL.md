---
name: qa-webshop-audit
description: Reads a QA spec file (YAML), drives a real browser to audit a target website (works on SPAs), captures screenshots as visual evidence, and generates a structured QA report. Designed for live demos.
---

# QA Webshop Audit Skill

Run a browser-based QA audit from a YAML spec, take screenshots as evidence, and return a concise markdown report.

## Input

Read the provided spec file (for example `qa-spec.yaml`) and extract:
- `target` (required)
- `test_areas` (required list)
- `screenshot_dir` (optional, default `./qa-screenshots`)

Example:

~~~yaml
target: https://webshop-external-demo.xsolla.site/
screenshot_dir: ./qa-screenshots
test_areas:
  - area 1
  - area 2
  - area 3
~~~

## How to Run

Use real browser automation (Playwright/browser-use). Prefer visible mode for demos.

If Playwright is missing, install it on demand:
~~~bash
npm init -y && npm install playwright && npx playwright install chromium
~~~

## Required Behavior

1. Open `target` and wait for hydration (`networkidle` or stable selectors).
2. Derive and execute a reasonable check for each requested `test_area` using real interactions (not static HTML checks).
3. Capture at least one screenshot per test area into `screenshot_dir`.
4. Continue on failures (per-test isolation with try/catch).
5. Close browser cleanly in `finally`.

## Output

Produce a markdown report and save it to `./qa-report.md` (also print to stdout).

Report must include:
- target URL and timestamp
- one result per test area: `PASS`, `WARN`, or `FAIL`
- short evidence note + screenshot path(s) for each test
- totals summary (pass/warn/fail)
- top recommendations (only actionable items)

## Screenshot Evidence Protocol

Before every screenshot:
1. **Scroll to the evidence** — if the test targets a specific element, scroll it into view (`element.scrollIntoView({ behavior: 'instant', block: 'center' })`). For load/layout tests use `fullPage: true` instead.
2. **Annotate failures visually** — inject a DOM overlay before shooting, then remove it after:
   - Failing elements → `outline: 4px solid red; outline-offset: 2px`
   - Absent features → fixed red banner: `"⚠ <feature> not found in DOM"`
3. **One screenshot = one story** — a reviewer must be able to understand the result from the screenshot alone, without reading the report.

## Operational Rules

- Keep runtime practical (target under ~90s for demo runs).
- Treat screenshots as mandatory evidence.
- Prefer resilient selectors (`data-testid`, roles, text) before brittle class names.
- If a selector fails, record it as `WARN`/`FAIL` and move to the next test.
- Use local timezone if available, otherwise UTC.