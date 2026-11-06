# Backlog History

Inherits SDD Operations MASTER.md, semantic tokens and IBM Plex Sans.

- Default workflow: date/area/COT and Pickup/Delivery selection, one summary band, the daily trend and latest area totals.
- Do not render remaining-ward cutoff panels, 24 hourly cards, A/B comparison, a baseline-day picker or delta analysis. Do not request snapshot details for this page.
- Read both hourly sources independently; a failed source must not hide the available source. Only poll today's report while the page is visible.
- Preserve real zero versus missing data, source times, COT calculations and provisional/final line styles. Charts inspect one hour without comparing snapshot identities.
- Keep checkpoint status collapsed. Mount the enlarged chart only when opened; support Escape and keyboard controls.
- Stack the chart and area table below 1100px; keep chart overflow inside its panel and mobile controls at 44px with 16px input text.
