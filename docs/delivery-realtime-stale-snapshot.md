# Delivery Realtime: overlapping writers

The central worker publishes SPX's `update_at_timestamp` as `snapshot_at`. The legacy launcher in `spx_py_laucher/jobs/dashboard_realtime_delivery.py` uses its local write time instead. Both can write `realtime_delivery_riders`; a central read can therefore reach publication after a newer timestamp has already been stored.

The publisher keeps the existing newer snapshot and returns 0 without writing rider rows. It records an explicit event and message: “Đã có snapshot mới hơn; giữ nguyên dữ liệu hiện tại”. Successful acknowledgement preserves that message. Invalid rows, missing ownership, expired leases and stale source data still fail validation. Historical failed jobs and source schedules remain unchanged.

Apply only the publisher and acknowledgement functions, without replaying source settings:

```powershell
node --env-file=.env --env-file=.env.local scripts/apply-delivery-realtime-stale.cjs --test
node --env-file=.env --env-file=.env.local scripts/apply-delivery-realtime-stale.cjs
```

The integration test runs in a rollback transaction, covering old/new snapshots, preserved skip reason, invalid rows and worker ownership. No worker restart is required. The legacy launcher can still write directly; this change handles the resulting publication conflict rather than disabling that launcher.
