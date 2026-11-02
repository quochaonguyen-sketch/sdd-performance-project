# Web performance — 2026-11-02

## Changes

- Pickup's five related tables use one Realtime channel and one 1.5-second debounce window. A simultaneous change to all five tables triggers one refresh instead of five. Single-table subscribers retain their existing behavior.
- Pickup uses the existing visible poller: reads never overlap, changes during a read queue one fresh read, hidden tabs stop fetching, and returning to the tab refreshes the data. Authenticated API access and private/no-store responses remain unchanged.
- Team calendar shift pagination starts concurrently with staff, planning, workload and date-bound queries. Page ordering, expanded overnight date range, error handling and all returned rows remain unchanged.
- Zone map bounds are computed directly from coordinates and cached by immutable geometry identity instead of constructing Leaflet layers for bounds queries. Overview outlines are memoized and shared by both strokes instead of recreated on hover.

## Measurement

Read-only `loadTeam('2026-10-01', '2026-10-31')`, three consecutive runs per version against the configured database:

| | Before | After |
|---|---:|---:|
| Run 1 | 2,638 ms | 1,419 ms |
| Run 2 | 1,361 ms | 1,258 ms |
| Run 3 | 1,542 ms | 1,218 ms |
| Median | 1,542 ms | 1,258 ms |
| Staff / shifts returned | 89 / 1,618 | 89 / 1,618 |

Median loader time improved by approximately 18%. This is a small sequential network sample, not a whole-page browser benchmark or a production latency guarantee. Reproduce from the repository root:

```powershell
node --env-file=.env --env-file=.env.local scripts/benchmark-team-loader.cjs
```

The benchmark only reads data and prints timings and counts.

## Validation

- Production build (Next.js 16.2.7), TypeScript and ESLint for changed files passed.
- Nine focused tests cover shared realtime batching/cleanup, individual row updates, hidden polling, queued refreshes, complete paginated team reads and failures, all shipped map geometries, and outlines.
- Broader native Node test run: 235 passed; one existing test file could not resolve its extensionless TypeScript import (`pickup-warning.ts` → `cot-allocation`). Both tests in that file passed when run with a TypeScript CommonJS transpilation hook. No application import conventions were changed for the test runner.
- Authenticated browser rendering, Core Web Vitals and production load/concurrency tests were not measured in the first pass. See the follow-up below.

## Follow-up: authenticated production browser measurements

Used the existing signed-in Comet session, normal application authorization and the production build on `http://localhost:3001`. Port 3000 remains the development server. Measurements came from DevTools Network with no network throttling, cache enabled, browser zoom 80%, and DevTools docked at the right. These are individual real browser observations, not statistical percentiles. No session cookies were copied and no application authentication was bypassed.

| Authenticated request / observation | Before | After |
|---|---:|---:|
| Dashboard `/api/dashboard/operations` | 23.13 s | 8.75 s |
| Dashboard `/api/dashboard/volume`, first uncached read | 14.50 s | 5.88 s |
| Standalone `/api/pickup-realtime` | 4.20 s | 2.88 s |
| Team page total initial requests | 58 | 43 |
| Team DOMContentLoaded | 1.62 s | 1.43 s |
| Team `/api/team` | 1.54 s | 1.48 s |

Other baseline observations: rider directory DOMContentLoaded 2.95 s; Zone DOMContentLoaded 1.48 s and its cold Google Plan read 2.76 s. Dashboard loaded Pickup simultaneously with other expensive reads; its Pickup request varied from 4.09 s before to 4.60 s after, even though the standalone Pickup request improved. Shared database/network contention still affects timings.

### Follow-up changes

- Do not mount the mobile More menu until opened. This removes speculative prefetching of routes inside the closed menu while retaining Next's normal prefetching for visible navigation. Opening, closing and the links were checked in the signed-in browser.
- Dashboard operations and volume use 1,000-row pages with at most four concurrent pages per reader. Small datasets still request only their first page. Results retain page order; a failed required page rejects; reads beyond an already completed final page cannot discard valid data. Caller-session RLS, source filters, permissions, snapshot consistency checks and refresh/cache behavior remain intact.
- Pickup starts inventory RPCs, profiles and summary/current snapshots concurrently. It avoids legacy head queries when a current full-fleet snapshot exists and reduces paginated profile/summary round trips.

Isolated, read-only comparisons against real data verified identical complete response hashes before/after for operations, volume and Pickup. These VM benchmarks use an admin data client and a fixture auth context; they measure loader work, separately from the authenticated browser results above:

| Loader | Before | After | Same response |
|---|---:|---:|---|
| Operations | 15,413 ms | 6,783 ms | Yes |
| Volume | 13,796 ms | 2,907 ms | Yes |
| Pickup | 2,720 ms | 1,703 ms | Yes |

During an uncommitted change, compare the working tree route against `HEAD`:

```powershell
node --env-file=.env --env-file=.env.local scripts/benchmark-pickup-loader.cjs operations --compare
node --env-file=.env --env-file=.env.local scripts/benchmark-pickup-loader.cjs volume --compare
node --env-file=.env --env-file=.env.local scripts/benchmark-pickup-loader.cjs pickup --compare
```

Production build and changed-file ESLint passed. The runnable native Node suite passed, including seven new pagination/route tests covering concurrency bounds, completeness, errors, permission denial and both current/legacy snapshots. The two existing extensionless-import tests also passed using the transpilation hook described above. No database schema or permission changes were needed.

Remaining limits: a cold Dashboard operations read still takes several seconds to scan the full backlog. Sustained multi-user load, mobile hardware, production hosting and Core Web Vitals percentiles need a separate measurement window; these local API timings do not establish those results.
