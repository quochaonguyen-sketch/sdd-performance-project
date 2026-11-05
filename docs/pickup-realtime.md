# Pickup Realtime

`/pickup-realtime` reads `/api/pickup-realtime`, which requires a signed-in user with pickup-management permission. The primary source is the service-only singleton `pickup_realtime_current`, published atomically by `C:/code/sdd-web-data/sdd_data/pickup_realtime.py`. The legacy tables remain a fallback only when no full-fleet snapshot exists. A failed refresh or midnight never discards full-fleet coverage; the UI marks snapshots from an earlier day or older than 20 minutes as stale.

## Source and quantities

- Read all web rider profiles with deterministic 500-row pagination. Display KV/COT from the roster.
- Fetch every SPX task accepted today in UTC+7. Sum actual `pickup_quantity` by driver ID and pickup point; exclude task IDs outside the web roster from attributed totals.
- Fetch live pickup orders in status 0/2. Effective Onhold includes pickup attempts for status 0 and Onhold flags for status 2. Assign orders through today's pickup-point tasks; new COT2 orders from 12:00 through 15:00 prefer COT2 tasks. Other orders can have multiple assignees.
- Pending inventory provides geography only, never old pending/Onhold counts. Zone identities come from SPX pickup-point groups. Unknown geography remains unknown.
- Group quantities reconcile exactly to each rider's assigned/picked/Onhold quantities. Complete source coverage permits idle active profiles to have actual zero quantities. Incomplete/missing/duplicate source pages never publish; mutable pagination is recovered by splitting time windows.

The source stores one JSON row with rider/group arrays and timestamps. Single-row upsert is atomic and avoids PostgREST's row cap. RLS is enabled; anon/authenticated have no table privileges. Service-role access is behind the API. The old KV5 publisher cannot overwrite this table.

## Display and refresh

Worker optimization (26/10/2026): read SPX tasks, live orders, routes, and database reference data concurrently. The shared live reader uses verified 500-row pages and cached time boundaries, splits mutable lists into single-page windows, reuses page connections, and caps all nested requests at 12 concurrent HTTP requests per client. Tasks and order statuses are fetched fresh every run. Geography can reuse a local cache only when the project/station and inventory snapshot match; the snapshot head is rechecked after either cache or database reads. A changed snapshot forces a fresh read. `python -m sdd_data.pickup_realtime --once --dry-run` validates and writes a local artifact without database publication. Timings, request counts and geography cache hits are included in artifact stats.

Five colored area cards, rider/zone tabs, COT/coverage/name/zone filters and 50 riders per page. Rider KPIs use the exact same rider filters and roster KV; geography KPIs on the zone tab use geography scope. Shared assignments can make the sum of rider assigned quantities exceed distinct order totals. Zone/ward filtering uses exact detail groups; incomplete legacy groups never imply full-rider quantities for one zone.

When a legacy rider has no zone data, current Assigned/Onhold inventory RPC results supply zone/ward identities by exact rider code, without supplying quantities. Realtime routes take precedence. Source timestamps are shown separately.

The website polls the authenticated API every minute while visible. The data worker runs 08:00–23:59 with a 300-second delay after each attempt. Unified worker startup includes the realtime thread; a process lock prevents duplicate publishers. Standalone entry: `C:/code/sdd-web-data/run_pickup_realtime.cmd`; `--once` runs one attempt. Cookies and automatic cookie refresh belong to sdd-web-data.

## Setup and validation

## Daily OH cutoff snapshots

Apply `prisma/pickup-cot-snapshots.sql`. A database trigger on the existing atomic full-fleet publication captures COT1 at **13:00** and COT2 at **17:00**, Asia/Ho_Chi_Minh, without depending on an open browser or a new worker process. It stores the first complete collection that **starts after the cutoff** and publishes within 15 minutes. The existing five-minute worker cadence means this is an observed post-cutoff snapshot, not an exact-to-the-second 13:00/17:00 measurement. UI shows both collection start and publication time. A stale/replayed source, wrong source date, pre-cutoff collection, malformed quantities or duplicate rider IDs cannot create a snapshot. Missing windows remain missing; no later backfill from current values.

`pickup_cot_oh_snapshots` holds immutable daily COT rows with rider identity, COT membership, KV and Onhold quantities frozen at capture. Later publications/roster edits do not overwrite history. Quantities are **rider-attributed OH**, so shared orders may appear for multiple riders. Genuine zero is distinct from an absent snapshot. RLS and explicit grants restrict access to the authenticated, pickup-authorized server API (`/api/pickup-realtime/cot-snapshots?date=YYYY-MM-DD`); browser database roles have no table privileges. The daily OH panel is collapsed by default and loads/polls its history only while expanded; automatic database capture remains active. The UI supports date and KV selection, area subtotals, and expanding the complete frozen rider list (name, code, KV, COT and OH), including riders with zero OH. Other live rider/zone filters do not affect frozen totals. History begins when capture is installed, not retroactively.

Database integration assertions: combine the schema SQL and `tests/pickup-cot-snapshots.integration.sql` in a temporary file and run `scripts/admin-audit-db.cjs <file> --test`. The test transaction rolls back all fixtures and clock stubs; includes real `service_role` trigger execution, cutoff windows, first-write preservation, genuine zero, frozen roster identity and access restrictions. API tests: `tests/pickup-cot-snapshots-route.test.ts`.

## Existing source setup

Apply `prisma/pickup-realtime-current.sql`. Python regression tests: `tests/test_pickup_realtime.py` in sdd-web-data. Web tests: `node --experimental-strip-types --test tests/pickup-realtime.test.ts`, TypeScript, ESLint and production build. Live verification reconciles every rider/group quantity and verifies data in each KV. UI previews anonymize rider names and IDs.
