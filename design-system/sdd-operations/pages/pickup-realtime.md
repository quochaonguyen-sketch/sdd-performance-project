# Pickup Realtime

Use MASTER.md's shared tokens and font. Preserve existing source permissions and snapshot warnings.

- Plain page header with refresh action, freshness status and collapsible source timestamps.
- Six area cards show completion rate, rider coverage and pending workload. Cards describe the full roster for their KV; selecting one scopes both rider and zone views.
- Five KPI cards reflect the current tab and filters: assigned, picked, pending, Onhold and completion rate. Pending quantities clamp each rider/group at zero before summing. Missing metrics and zero denominators display a dash.
- Keep the separate rider and geographic totals; rider assigned counts can overlap. Do not add the two sources together.
- Quick rider filters: all, pending, Onhold and missing metrics. Sorting supports assigned, pending, Onhold and ascending completion rate, with unknown denominators last.
- Keep COT, ward, zone, search, pagination and route provenance. Unknown data stays separate from real zero. Render ratios to one decimal and clamp only visual bar lengths.
- Use container queries for six/three/two area columns and five/three/two KPI columns. Wide tables scroll inside the workspace. All warnings use semantic colors in both themes.
