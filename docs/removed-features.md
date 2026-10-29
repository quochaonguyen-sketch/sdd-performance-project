# Removed Time Off, Tasks and Violations

Removed at the user's request on 29 October 2026: the three workspace pages, public OFF registration/lookup, feature APIs, OFF notifications, violation dashboard API/card, and OFF mutation proposals in the AI chat. Role permission options and stored page keys are removed too.

Database removal drops only `rider_off_requests`, `member_tasks`, `rider_violations`, and the feature-exclusive `ai_pending_actions` table, using RESTRICT rather than CASCADE. The shared `delete_rider_with_history` function no longer references violations. All four removed tables were empty at inspection. No related cron or evidence bucket was present.

Shared rider, attendance/schedule, Google Sheets authentication/sync, AI conversations and Performance data are retained. Staffing and Pickup still use attendance and the shared Sheets helpers. Historical Prisma migrations remain as migration history; the active Prisma schema and standalone feature installers no longer create these features.

```powershell
node --env-file=.env --env-file=.env.local scripts/remove-timeoff-tasks-violations.cjs --test
node --env-file=.env --env-file=.env.local scripts/remove-timeoff-tasks-violations.cjs
```

The test mode runs the removal and dependency assertions inside a rollback transaction. Production application is irreversible for any rows present at execution.
