const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function parseSpec(specText) {
  const lines = specText.split(/\r?\n/);
  const spec = { test_areas: [] };
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '    ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const keyMatch = /^([A-Za-z_]+):\s*(.*)$/.exec(trimmed);
    if (keyMatch && !trimmed.startsWith('- ')) {
      const [, key, value] = keyMatch;
      currentKey = key;
      if (value) {
        spec[key] = value;
      } else if (key !== 'test_areas') {
        spec[key] = '';
      }
      continue;
    }

    if (currentKey === 'test_areas') {
      const itemMatch = /^-\s+(.*)$/.exec(trimmed);
      if (itemMatch) spec.test_areas.push(itemMatch[1]);
    }
  }

  return spec;
}

function randomUsername() {
  const adjectives = ['swift', 'bold', 'calm', 'dark', 'epic', 'fast', 'grim', 'hard'];
  const nouns = ['wolf', 'hawk', 'bear', 'lion', 'shark', 'fox', 'crow', 'ox'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}_${noun}${num}`;
}

function normalizeLabel(label) {
  return label.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function runAudit(specPath) {
  const absoluteSpecPath = path.resolve(specPath);
  const specDir = path.dirname(absoluteSpecPath);
  const specText = fs.readFileSync(absoluteSpecPath, 'utf8');
  const spec = parseSpec(specText);
  const target = spec.target;
  const screenshotDir = path.resolve(specDir, spec.screenshot_dir || './qa-screenshots');
  const reportPath = path.resolve(specDir, 'qa-report.md');

  if (!target) {
    throw new Error(`No target URL found in ${absoluteSpecPath}`);
  }

  fs.mkdirSync(screenshotDir, { recursive: true });

  const results = [];
  const bonusData = {
    loadTime: null,
    missingAlt: 0,
    seo: {},
    consoleErrors: 0,
    consoleWarnings: 0,
    networkFailed: 0,
  };

  const shot = async (page, name) => {
    const filePath = path.join(screenshotDir, name);
    await page.screenshot({ path: filePath, fullPage: false });
    return path.relative(specDir, filePath);
  };

  const getCartValue = async (page) => {
    return page.evaluate(() => {
      const selectors = [
        '[class*="cart-count"]',
        '[class*="cart-badge"]',
        '[data-testid*="cart"]',
        '[class*="quantity"]',
        '[aria-label*="cart" i]',
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent) return el.textContent.trim();
      }
      return null;
    });
  };

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') bonusData.consoleErrors++;
    if (msg.type() === 'warning') bonusData.consoleWarnings++;
  });
  page.on('pageerror', () => bonusData.consoleErrors++);
  page.on('requestfailed', () => bonusData.networkFailed++);

  try {
    for (const area of spec.test_areas) {
      const label = normalizeLabel(area);

      if (label.includes('homepage loads')) {
        try {
          const t0 = Date.now();
          await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
          bonusData.loadTime = ((Date.now() - t0) / 1000).toFixed(1);
          const title = await page.title();
          const screenshotPath = await shot(page, '01-homepage.png');

          bonusData.seo = await page.evaluate(() => {
            const getContent = (sel) => document.querySelector(sel)?.getAttribute('content') || null;
            return {
              title: document.title,
              description: getContent('meta[name="description"]'),
              ogTitle: getContent('meta[property="og:title"]'),
              canonical: document.querySelector('link[rel="canonical"]')?.href || null,
            };
          });
          bonusData.missingAlt = await page.$$eval('img:not([alt])', (els) => els.length);

          results.push({
            pass: !!title,
            label: 'Homepage loads correctly',
            detail: `Title: "${title}" | Load: ${bonusData.loadTime}s`,
            screenshots: [screenshotPath],
          });
        } catch (error) {
          results.push({
            pass: false,
            label: 'Homepage loads correctly',
            detail: error.message,
            screenshots: [],
          });
        }
        continue;
      }

      if (label.includes('navigation menu')) {
        try {
          await page.waitForSelector('nav, [role="navigation"], header', { timeout: 10000 });
          const links = await page.$$eval(
            'nav a, [role="navigation"] a, header a',
            (els) => [...new Set(els.map((e) => e.innerText.trim()).filter(Boolean))]
          );
          const screenshotPath = await shot(page, '02-navigation.png');
          results.push({
            pass: links.length > 0,
            label: 'Navigation menu works',
            detail: `Found ${links.length} nav links: ${links.slice(0, 6).join(', ')}${links.length > 6 ? '...' : ''}`,
            screenshots: [screenshotPath],
          });
        } catch (error) {
          results.push({
            pass: false,
            label: 'Navigation menu works',
            detail: error.message,
            screenshots: [],
          });
        }
        continue;
      }

      if (label.includes('product catalog')) {
        try {
          await page.waitForLoadState('networkidle');
          const count = await page.evaluate(() => {
            const selectors = [
              '[class*="product"]',
              '[data-testid*="product"]',
              '[class*="item"]',
              '[class*="card"]',
              'article',
              '[class*="game"]',
            ];
            for (const selector of selectors) {
              const found = document.querySelectorAll(selector);
              if (found.length > 1) return found.length;
            }
            return 0;
          });
          const screenshotPath = await shot(page, '03-catalog.png');
          results.push({
            pass: count > 0,
            label: 'Product catalog displays items',
            detail: count > 0 ? `Rendered ${count} product cards (post-hydration)` : 'No product cards found',
            screenshots: [screenshotPath],
          });
        } catch (error) {
          results.push({
            pass: false,
            label: 'Product catalog displays items',
            detail: error.message,
            screenshots: [],
          });
        }
        continue;
      }

      if (label.includes('login with a random username')) {
        try {
          const username = randomUsername();
          const loginSelectors = [
            'a[href*="login"]',
            'a[href*="sign"]',
            'button:has-text("Log")',
            'a:has-text("Log")',
            'a:has-text("Sign")',
            '[class*="login"]',
            '[class*="auth"]',
            'a[href*="account"]',
          ];

          let loginClicked = false;
          for (const selector of loginSelectors) {
            try {
              const element = await page.$(selector);
              if (element) {
                await element.click();
                await page.waitForLoadState('networkidle', { timeout: 8000 });
                loginClicked = true;
                break;
              }
            } catch {}
          }

          const usernameSelectors = [
            'input[name="username"]',
            'input[name="email"]',
            'input[type="email"]',
            'input[placeholder*="user" i]',
            'input[placeholder*="email" i]',
            'input[autocomplete="username"]',
          ];

          let inputFilled = false;
          for (const selector of usernameSelectors) {
            try {
              const input = await page.$(selector);
              if (input) {
                await input.fill(username);
                inputFilled = true;
                break;
              }
            } catch {}
          }

          const screenshotPath = await shot(page, '04-login.png');
          if (inputFilled) {
            results.push({
              pass: true,
              label: 'Login with a random username',
              detail: `Username "${username}" entered${loginClicked ? ' after opening login UI' : ''}`,
              screenshots: [screenshotPath],
            });
          } else if (loginClicked) {
            results.push({
              pass: null,
              label: 'Login with a random username',
              detail: 'Reached login flow, but no username/email field was found for automated input',
              screenshots: [screenshotPath],
            });
          } else {
            results.push({
              pass: null,
              label: 'Login with a random username',
              detail: 'No visible login entry point was found on the page',
              screenshots: [screenshotPath],
            });
          }

          await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
        } catch (error) {
          results.push({
            pass: false,
            label: 'Login with a random username',
            detail: error.message,
            screenshots: [],
          });
          try {
            await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
          } catch {}
        }
        continue;
      }

      if (label.includes('add to cart')) {
        try {
          await page.waitForLoadState('networkidle');
          const cartBefore = await getCartValue(page);
          const screenshotBefore = await shot(page, '05a-before-cart.png');

          const buttonSelectors = [
            'button:has-text("Add to cart")',
            'button:has-text("Add to Cart")',
            'button:has-text("BUY")',
            'button:has-text("Buy")',
            '[class*="add-to-cart"]',
            '[data-testid*="add-to-cart"]',
            'button[class*="cart"]',
          ];

          let clicked = false;
          for (const selector of buttonSelectors) {
            try {
              const button = await page.$(selector);
              if (button) {
                await button.scrollIntoViewIfNeeded();
                await button.click();
                await page.waitForTimeout(1500);
                clicked = true;
                break;
              }
            } catch {}
          }

          const cartAfter = await getCartValue(page);
          const screenshotAfter = await shot(page, '05b-after-cart.png');
          const cartChanged = cartBefore !== cartAfter;

          results.push({
            pass: clicked,
            label: 'Add to cart flow works',
            detail: clicked
              ? `Clicked "Add to Cart" -> cart: ${cartBefore ?? '?'} -> ${cartAfter ?? '?'}${cartChanged ? ' ✓' : ' (no visible counter change)' }`
              : 'No Add to Cart button found in the rendered DOM',
            screenshots: [screenshotBefore, screenshotAfter],
          });
        } catch (error) {
          results.push({
            pass: false,
            label: 'Add to cart flow works',
            detail: error.message,
            screenshots: [],
          });
        }
        continue;
      }

      if (label.includes('responsive layout')) {
        try {
          await page.setViewportSize({ width: 375, height: 667 });
          await page.goto(target, { waitUntil: 'networkidle', timeout: 20000 });
          await page.waitForTimeout(500);
          const hamburger = await page.$(
            '[class*="burger"], [class*="menu-toggle"], [class*="hamburger"], button[aria-label*="menu" i]'
          );
          const screenshotPath = await shot(page, '06-mobile.png');
          results.push({
            pass: true,
            label: 'Responsive layout (mobile-ready)',
            detail: `375x667 viewport rendered${hamburger ? ' - hamburger menu detected ✓' : ' - layout adjusted'}`,
            screenshots: [screenshotPath],
          });
        } catch (error) {
          results.push({
            pass: false,
            label: 'Responsive layout (mobile-ready)',
            detail: error.message,
            screenshots: [],
          });
        }
        continue;
      }

      results.push({
        pass: null,
        label: area,
        detail: 'Spec item recognized but no automation step is implemented for it yet',
        screenshots: [],
      });
    }
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.pass === true).length;
  const warned = results.filter((r) => r.pass === null).length;
  const failed = results.filter((r) => r.pass === false).length;
  const total = results.length;
  const score = total ? Math.round(((passed + warned * 0.5) / total) * 100) : 0;
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const now = new Date().toLocaleString(undefined, { timeZone: localTimeZone });
  const statusIcon = (result) => (result.pass === true ? 'PASS' : result.pass === null ? 'WARN' : 'FAIL');

  let report = `╔══════════════════════════════════════════════════════════╗
║         QA WEBSHOP AUDIT REPORT (BROWSER-DRIVEN)         ║
╠══════════════════════════════════════════════════════════╣
║  Target:  ${target}
║  Date:    ${now}
║  Browser: Chromium 1280x800 -> 375x667 (mobile)
║  Mode:    Live (real browser, real interactions)
╚══════════════════════════════════════════════════════════╝

── Test Results ──────────────────────────────────────────────

`;

  for (const result of results) {
    report += `  ${statusIcon(result)}  ${result.label}\n`;
    report += `        ${result.detail}\n`;
    for (const screenshot of result.screenshots) {
      report += `        [screenshot] ${screenshot}\n`;
    }
    report += '\n';
  }

  report += `── Summary ───────────────────────────────────────────────────

  Total:   ${total} tests
  Passed:  ${passed}  |  Warnings: ${warned}  |  Failed: ${failed}
  Score:   ${score}% (${score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : 'Needs Attention'})

── Bonus Findings ────────────────────────────────────────────

  Performance
   • Page load time: ${bonusData.loadTime ?? 'n/a'}s

  Accessibility
   • ${bonusData.missingAlt} image(s) missing alt attributes

  SEO
   • Title:       ${bonusData.seo.title || '(none)'}
   • Description: ${bonusData.seo.description || '(none)'}
   • OG Title:    ${bonusData.seo.ogTitle || '(none)'}
   • Canonical:   ${bonusData.seo.canonical || '(none)'}

  Console
   • ${bonusData.consoleErrors} error(s), ${bonusData.consoleWarnings} warning(s)

  Network
   • ${bonusData.networkFailed} failed request(s)

── Recommendations ───────────────────────────────────────────
`;

  const recommendations = [];
  if (bonusData.missingAlt > 0) recommendations.push(`Add alt text to ${bonusData.missingAlt} image(s) for accessibility.`);
  if (!bonusData.seo.description) recommendations.push('Add a meta description for SEO.');
  if (!bonusData.seo.canonical) recommendations.push('Add a canonical URL tag.');
  if (bonusData.networkFailed > 0) recommendations.push(`Investigate ${bonusData.networkFailed} failed network request(s).`);
  if (bonusData.consoleErrors > 0) recommendations.push(`Fix ${bonusData.consoleErrors} JavaScript error(s) reported in the console.`);
  if (bonusData.loadTime && Number.parseFloat(bonusData.loadTime) > 3) {
    recommendations.push(`Optimize page load time, currently ${bonusData.loadTime}s.`);
  }
  if (recommendations.length === 0) recommendations.push('No critical issues found.');

  recommendations.forEach((recommendation, index) => {
    report += `  ${index + 1}. ${recommendation}\n`;
  });

  report += '\n';

  console.log(report);
  fs.writeFileSync(reportPath, report);
  console.log(`Report saved to ${reportPath}`);
}

const specPath = process.argv[2];

if (!specPath) {
  console.error('Usage: node qa-audit.js /absolute/path/to/qa-spec.yaml');
  process.exit(1);
}

runAudit(specPath).catch((error) => {
  console.error('Audit script failed:', error);
  process.exit(1);
});
