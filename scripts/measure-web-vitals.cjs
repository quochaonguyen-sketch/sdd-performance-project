// Requires Playwright in NODE_PATH; measures a public production route without signing in.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const target = process.env.PERFORMANCE_BASE_URL || 'http://localhost:3002';
if (!['localhost', '127.0.0.1'].includes(new URL(target).hostname)) throw Error('Use a local production server for this measurement.');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const runs = [];
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
      for (let run = 1; run <= 3; run++) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage(), samples = new Map();
        await context.route('**/api/web-vitals', route => {
          for (const sample of route.request().postDataJSON().samples) samples.set(sample.name, sample);
          return route.fulfill({ status: 204 });
        });
        const start = Date.now();
        await page.goto(`${target}/login`, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'Vào ca làm việc', exact: true }).click();
        await page.waitForTimeout(2400);
        const timing = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0];
          return { ttfb: navigation.responseStart - navigation.startTime, domContentLoaded: navigation.domContentLoadedEventEnd - navigation.startTime };
        });
        await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
        await page.waitForTimeout(300);
        await page.goto('about:blank');
        await new Promise(resolve => setTimeout(resolve, 200));
        runs.push({ device: viewport.width <= 768 ? 'mobile' : 'desktop', run, journeyElapsedMs: Date.now() - start, timing, metrics: Object.fromEntries(Array.from(samples, ([name, sample]) => [name, { value: sample.value, rating: sample.rating }])) });
        await context.close();
      }
    }
  } finally { await browser.close(); }
  const report = { measuredAt: new Date().toISOString(), route: '/login', mode: 'local production, unthrottled CPU/network, cold browser context per run', interaction: 'click login heading; no OAuth or authenticated workflow', limitation: 'Lab measurements, not real-user P75. Authenticated dashboards need production usage samples in /site-health.', runs };
  if (runs.some(run => !run.metrics.LCP || !run.metrics.CLS)) throw Error(`Missing LCP or CLS: ${JSON.stringify(runs.map(run => ({ device: run.device, metrics: Object.keys(run.metrics) })))}`);
  fs.mkdirSync(path.join('docs', 'performance'), { recursive: true });
  fs.writeFileSync(path.join('docs', 'performance', 'local-baseline.json'), JSON.stringify(report, null, 2));
  for (const device of ['desktop', 'mobile']) {
    const rows = runs.filter(run => run.device === device);
    const median = name => { const values = rows.map(row => row.metrics[name]?.value).filter(value => value !== undefined).sort((a,b) => a-b); return values.length ? values[Math.floor(values.length / 2)] : null; };
    console.log(JSON.stringify({ device, LCP: median('LCP'), INP: median('INP'), CLS: median('CLS') }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
