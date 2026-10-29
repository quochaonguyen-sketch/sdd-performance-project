# Rider source: Data Web dashboard SDD

Source: `1gsUhZMc5jLvFizy804gtAan3vtzxmmjKwOvycrj4xZU`, tab `Sheet1` (gid 0). The existing service account has Viewer access. The synchronizer only reads Sheets; no Sheet content is modified.

The background process checks once per minute, matches `Driver ID`, and atomically inserts/updates only changed valid riders. Rider Directory shows the source, last check and skipped-row details, and refreshes visible data every minute. Its existing server cache can add up to one minute of display delay.

Mapped rider fields: name, KV, COT, home district, pickup district/ward, delivery district/ward. Optional mapped cells cleared on the Sheet become null on the web. Duplicate Driver IDs (all occurrences), invalid/missing KV/COT/ID/name are skipped. Missing rows never delete riders. Employment status, phone, avatar, zone assignment and pickup point names are not inferred from route labels or replaced.

Pickup FMS route, notes, new ward, BSX, rider contract label and original start-date text are preserved under `riders.raw_data.rider_plan`; they are not new Rider Directory table columns. No date format is guessed. Other raw-data keys are preserved.

Run from the website directory:

```powershell
node --env-file=.env --env-file=.env.local scripts/sync-rider-sheet.cjs --preview
node --env-file=.env --env-file=.env.local scripts/sync-rider-sheet.cjs
node --env-file=.env --env-file=.env.local scripts/sync-rider-sheet.cjs --watch
```

The watch process runs independently of browser tabs, while its Windows host is running. Automatic startup after reboot is not installed. Status, errors and the single-instance lock are in `%LOCALAPPDATA%/SDD/rider-sheet-sync/`. If the process is confirmed stopped after a crash, remove only its stale `process.lock` before restarting. Google/DB failures preserve rider data and retry on the next polling cycle. A changed Sheet remains the authority over the mapped fields; edit those fields on the Sheet to keep changes.

Initial sync: 1,160 valid rows, 31 inserts, 1,129 updates, 19 skipped rows. A following read produced zero inserts/updates. Unit tests cover header detection, COT normalization, duplicates, missing KV and malformed/empty snapshots.
