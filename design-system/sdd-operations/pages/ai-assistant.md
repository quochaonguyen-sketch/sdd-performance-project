# AI assistant workspace

Extends the SDD Operations master system. Implementation is scoped to `components/ai/ai-workspace.module.css`; the assistant remains lazy loaded from the shared toolbar.

- Desktop: an 820px workspace, up to 770px high, with a 158px contextual navigation rail. Header identifies the assistant; new conversation, options and close controls stay separate from content.
- At 680px and below: navigation becomes four horizontal controls with stacked icon/label. At widths below 1024px, reserve space above the application bottom navigation, including safe-area insets.
- Reuse semantic paper, ink, accent, success, warning and rule tokens in both themes. Keep IBM Plex Sans; use existing Lucide icons. Area markers retain the five area colors.
- Report: four key metrics, completion indicators for available nonzero denominators, a KV table, copy action, expandable full text and source details. Missing values stay as a dash; Pickup and shared FTE coverage retain their explanatory notes.
- Priorities: count summary, numbered cards, explicit urgency badges and links to the source. Existing scoped URLs and permission checks remain unchanged.
- Chat: clear conversation hierarchy, optional starter questions, compact source metadata and a composer with visible data toggle/scope. Memory controls live inside the options menu. No decorative online indicator or provider branding in the heading.
- Keep focus indicators, accessible control names, Escape behavior, disabled/loading feedback and reduced-motion support. The empty conversation starts at the top; populated conversations follow the latest message.

Checked on the signed-in application at desktop and 375px viewport sizes, in light and dark themes. No new UI library, image asset or external font is required.

- Analysis: bounded date/KV/checkpoint filters, four fact cards, accessible backlog bars, daily numeric table with contained horizontal scroll, OH KV rates and ward hotspots, overnight cohorts, FC scope notes and current Return aging. All source timestamps, partial/unknown states and formula definitions are explicit. Latest complete OH date is labeled; current partial days stay visible in the table.
