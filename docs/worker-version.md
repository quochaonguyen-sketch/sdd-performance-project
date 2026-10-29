# Worker capability version preservation

The heartbeat previously stored only 30 characters of `p_version`. A worker advertising `1.5-lh-dashboard-lh-unseal-pick13-overnight-status` was stored as `1.5-lh-dashboard-lh-unseal-pic`. The existing Performance capability gate (`%pick13%`) then rejected the otherwise compatible worker, leaving jobs queued indefinitely.

The heartbeat now preserves up to 100 characters. Capability gates, schedules and queued jobs are unchanged. The next heartbeat repairs the saved version without restarting the worker; eligible queued Performance jobs can then be claimed normally.

```powershell
node --env-file=.env --env-file=.env.local scripts/apply-worker-version.cjs --test
node --env-file=.env --env-file=.env.local scripts/apply-worker-version.cjs
```

The integration test reproduces a capability token past character 30, verifies unsupported workers remain blocked, and confirms a supported worker claims Performance. Its temporary queue isolation and fixture changes are always rolled back.
