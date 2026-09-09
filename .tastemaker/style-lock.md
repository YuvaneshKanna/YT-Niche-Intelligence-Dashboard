# Niche Performance design direction

Scope: /niche only. User brief and supplied screenshot, 2026-09-08.
An operational research dashboard for a YouTube strategist, with plain-language
decisions before statistical evidence. Existing Radix, Lucide, Panel and Geist
stack retained; real tracked thumbnails supply the imagery.

First viewport: niche identity, compact totals, Research desk, reference videos
and topic adoption. Detailed statistics and the matrix are expandable.
One bordered panel layer; internal content uses spacing and dividers.

Colors reuse app background/card/foreground. Page-local readable lavender accent
is oklch(0.76 0.12 290), with dark button text oklch(0.16 0.02 290).
Muted text is oklch(0.75 0 0). No global palette changes.
Research controls: 44px minimum height. Visible focus, native select behavior,
reduced-motion support. No entrance motion. Scope and sample caveats stay visible.

Status: implementation reviewed in Chromium; awaiting user design review.
