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

Five colored area cards, rider/zone tabs, COT/coverage/name/zone filters and 50 riders per page. Rider KPIs use the exact same rider filters and roster KV; geography KPIs on the zone tab use geography scope. Shared assignments can make the sum of rider assigned quantities exceed distinct order totals. Zone/ward filtering uses exact detail groups; incomplete legacy groups never imply full-rider quantities for one zone.

When a legacy rider has no zone data, current Assigned/Onhold inventory RPC results supply zone/ward identities by exact rider code, without supplying quantities. Realtime routes take precedence. Source timestamps are shown separately.

The website polls the authenticated API every minute while visible. The data worker runs 08:00–23:59 with a 300-second delay after each attempt. Unified worker startup includes the realtime thread; a process lock prevents duplicate publishers. Standalone entry: `C:/code/sdd-web-data/run_pickup_realtime.cmd`; `--once` runs one attempt. Cookies and automatic cookie refresh belong to sdd-web-data.

## Setup and validation

Apply `prisma/pickup-realtime-current.sql`. Python regression tests: `tests/test_pickup_realtime.py` in sdd-web-data. Web tests: `node --experimental-strip-types --test tests/pickup-realtime.test.ts`, TypeScript, ESLint and production build. Live verification reconciles every rider/group quantity and verifies data in each KV. UI previews anonymize rider names and IDs.
