# Filter memory, private feedback updates and performance measurements

- Workspace filters are stored in sessionStorage under the signed-in user's ID. Area/date/status choices survive route changes and reloads in the same browser tab. Closing the tab ends this memory. A different account uses a separate namespace. If storage is unavailable, in-memory retention still works during navigation.
- URL-based filter pages retain their query when reopened from workspace navigation. Explicit query parameters take priority. Invalid saved filter shapes fall back to defaults.
- Admin updates to feedback status or reply create a notification for its owner in the same database transaction. Saving unchanged values creates no duplicate. General announcements remain separate. Read APIs constrain both the notification ID and current recipient.
- Install the tables, trigger and report function with `node scripts/apply-feedback.cjs`. Add `--test` to run transactional database checks and roll back fixtures.

## Real-user measurements

The root `WebVitalsReporter` collects LCP, INP, CLS, FCP and TTFB only in production builds. Its batched endpoint accepts authenticated sessions. Metrics exclude query strings and normalize UUID route segments. The compiled Next.js web-vitals library is reused; no new runtime dependency is installed.

Admins can open `/site-health` under Administration. It aggregates the last 7 days by original document path, device and metric, with P75 and sample counts. These metrics describe full document visits, not each client-side route transition. Missing INP is not treated as zero. Samples below 20 are labeled as a small sample.

Core Web Vitals targets are LCP ≤ 2500 ms, INP ≤ 200 ms and CLS ≤ 0.1. See [Google's Web Vitals guidance](https://web.dev/articles/vitals).

## Local baseline

`local-baseline.json` contains three cold-context runs each at desktop and mobile viewport sizes, against a local production build. CPU/network are not throttled. The interaction clicks the login heading; it does not perform OAuth or exercise authenticated dashboard work. This is a lab baseline, not real-user P75 or a claim about dashboard performance.

Run a production server on port 3002, then run `node scripts/measure-web-vitals.cjs`. Playwright must be available through `NODE_PATH`; the bundled Codex workspace runtime supplies it. Set `PERFORMANCE_BASE_URL` to another localhost production URL if needed. The script intercepts metric submissions and writes the lab report locally without inserting artificial measurements into the database.

With a dev server on port 3000, `node scripts/verify-followups-ui.cjs` checks filter retention/account separation, private-notification navigation/read, and the admin report using controlled API fixtures. It creates a temporary preview route and removes it in `finally`.
