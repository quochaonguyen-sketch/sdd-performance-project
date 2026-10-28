# SDD Operations — shared UI specification

An operations dashboard with compact data tables, clear hierarchy and persistent navigation. Based on UI/UX Pro Max's Data-Dense Dashboard guidance; landing-page patterns are not applicable to this internal workspace.

## Source of truth

- `tokens.css`: light/dark semantic colors, spacing, radii, motion and elevation.
- `app/design-system.css`: shared workspace presentation, legacy utility aliases, keyboard focus and mobile defaults.
- Feature CSS: page-specific layout and data density; colors reference semantic tokens instead of separate palettes.
- Shared controls: `components/ui/button.tsx`, cards and existing accessible dialogs. Keep IBM Plex Sans for Vietnamese support; no additional font downloads.

## Palette and meaning

| Role | Light | Dark | Usage |
| --- | --- | --- | --- |
| Primary | `#2459D3` | `#8AB4FF` | Main action, selected filter, navigation emphasis |
| Surface | `#FFFFFF` | `#152338` | Cards, inputs, table bodies |
| Canvas | `#F4F7FB` | `#101D2F` | Workspace background |
| Text | `#172B43` | `#E7EDF6` | Headings and body |
| Muted | `#52657D` | `#A7B7CC` | Supporting text, never disabled opacity for live data |
| Success | `#087B61` | `#6BD7B2` | Completed/successful |
| Warning | `#9A5B00` | `#F4C168` | Waiting, stale GPS, needs attention |
| Error | `#BD3344` | `#FF9CA9` | Failed/destructive |

Area/chart colors consistently follow blue, green, purple, amber, rose. Labels/icons accompany status colors. Map tiles and exported images retain their own rendering requirements.

## Components and responsive rules

- Page title: 26px desktop / 23px mobile, weight 650. Section titles: 18px; dense table labels: 12–13px.
- One workspace gutter: 24px desktop / 16px horizontally on mobile. Feature roots do not add a second canvas.
- Cards: 12px radius and subtle border. Controls: 8px radius. Rounded pills are reserved for status/count badges.
- Inputs: 40px minimum height, 16px font on mobile. Primary/normal buttons: 40px, 44px mobile; compact table actions remain compact.
- Wide tables scroll in their own container. Grid children use `min-width:0`. Headers and filter actions wrap on narrow screens.
- Sidebar stays mounted during navigation. Page loading remains inside the workspace.
- Pickup and Delivery Backlog share the area → district → ward board, an eight-row ward viewport, and modal order drill-down. Pickup's geographic dashboard and rider totals share one database snapshot; district modals retain the visible ward/COT filters. Apply `prisma/pickup-inventory-geography.sql` for the server-only geographic functions.
- Text pairs target 4.5:1; control borders/focus target 3:1. Preserve keyboard focus, native disabled semantics, reduced motion and dialog behavior.

## Validation

`node --test tests/design-system.test.cjs` checks CSS parsing, semantic references, contrast in both themes and responsive rules at 375/768/1440px. These are source checks, not screenshot or device-browser validation. Run TypeScript, relevant component checks and `next build` before release.
