# WH / High Value Dashboard

Inherits MASTER.md and shared light/dark semantic tokens from `tokens.css`.

- **Orders by area**:
  - Restrained section header with `MapPin` icon, scope badge, and operational subtitle.
  - Distinct column hierarchy: text columns left-aligned, numeric metric columns right-aligned with `tabular-nums`.
  - Area identifiers styled with semantic area indicators (`--color-chart-1` to `--color-chart-5`).
  - Contextual operational pills for active bottlenecks: warning pills for Backlog and On-Hold, attention pills for Unassigned, alert badges with `AlertTriangle` for Late 4H breaches, and compact progress bar for Success Rate.
  - Sticky header with fixed row alignment and aggregate `Tổng cộng` footer when viewing all areas.
  - Explanatory footnote callout explaining Sheet backlog formulas without cluttering the main layout.

- **Chờ xuất giao (Dispatch Queue)**:
  - Header with warning-toned clock icon, real-time counter pill, and clear queue definition banner.
  - Monospaced shipment code tags, area mini-pills, and urgency-tiered aging indicators (>=12h critical alert, >=4h warning).
  - Attempt tags, status pills, and SLA countdowns with 4H overdue warnings.
  - Sticky table headers inside a 420px max-height scroll region with custom scrollbar.
  - Informative empty state with checkmark when queue is cleared.

- **SOC pending receive**:
  - Balanced split layout counterpart with info-toned truck icon and counter badge.
  - Monospaced shipment codes, area mini-pills, and formatted arrival timestamps.
  - Overdue warning pill for packages exceeding the 60-minute SOC transfer limit.
  - Sticky table headers matching the dispatch queue height for visual harmony.

- **Chi tiết đơn & rider Toolbar**:
  - Unified operational toolbar: integrates Search (Mã đơn / rider / địa bàn), Area filter (Khu vực), Status filter (Trạng thái), Sorting (Sắp xếp), and CSV Export into a cohesive 2-tier header.
  - Removes disconnected top filter bar, keeping the upper dashboard focused on high-level volume metrics and area breakdowns.

