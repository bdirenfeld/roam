# Roam — Project Brief for Claude Code

## What this app is
Roam is a luxury travel planning app for high-net-worth individuals — investment bankers, executives, and cultural tastemakers. It is the tool a boutique travel concierge firm would use to plan bespoke trips for their clients.

## Design philosophy
The aesthetic reference is **Monocle magazine meets Condé Nast Traveller**. Every design decision must feel editorial, restrained, and premium. Never SaaS, never consumer-grade.

The benchmark: someone opens Roam in a Centurion Lounge and the person next to them asks "what app is that?"

## Visual system
- Background: `#FAF7F2` (warm parchment)
- Primary / buttons / active states: `#1A1A2E` (deep ink)
- Single accent, used sparingly: `#C4622D` (burnt sienna)
- Card surfaces: `#FFFFFF` white
- Secondary text / icons: `#6B7280` warm slate
- Display font: Playfair Display italic (headings, trip names, screen titles)
- Body font: DM Sans (all UI text, labels, buttons)
- Icons: Phosphor Icons at `weight="light"` — never Heroicons or Lucide

## Language and tone
- "Journey" not "trip"
- "Plan a journey" not "new trip"
- "Archive this journey" not "delete"
- "In preparation" not "planning"
- "Add to this day" not "add card"
- Editorial, cultured, and specific — never CRM-like or SaaS-like
- Copy should read like a well-edited travel magazine, not a productivity tool

## What to never do
- Never use Inter or system fonts for display text
- Never use aggressive red for soft or reversible actions
- Never use "Danger zone" section labels — use "Manage journey" instead
- Never introduce multiple competing accent colors
- Never use checkbox-heavy filter panels — use opacity and toggles
- Never use bold Playfair — always light or regular weight
- Never push to a feature branch — always push directly to main
- Never batch more than 2-3 related changes in a single prompt

## Tech stack
- Next.js 14, Supabase (Postgres + auth), Mapbox GL JS, Tailwind CSS
- Google OAuth for authentication
- Google Places API for card photos and place data
- Deployed on Vercel, pushes go directly to main

## Git rules (critical)
- Always start by running `git branch` and confirming you are on main
- Always run `npm run build` before pushing
- Always push directly to main — never create feature branches
- Always end by running `git log origin/main -1` and `git log origin/HEAD -1` — both must show the same commit

## Supplemental data pattern (weather, etc.)
- Fetched once per trip using a **module-level `Map` keyed by `tripId`** in the client component — survives `router.push()` navigations without a Context provider or Zustand
- Fails silently: `console.error` once, no retry, no error UI — the feature degrades gracefully
- Loading state: reserve layout space (empty placeholder div at fixed height) so data arrival causes zero layout shift
- Weather provider: **Open-Meteo** — no API key, 16-day forecast horizon, always include `timezone=auto`
- Endpoint: `https://api.open-meteo.com/v1/forecast` with `daily` + `hourly` params; parse into a `Record<string, DayWeather>` keyed by `"YYYY-MM-DD"`

## Gap cards (timeline connectors)
- Gap cards are tappable timeline connectors, not content. Visual style: dotted vertical spine + italic duration label + quiet add affordance. Pressed state wakes up Sienna (`#C4622D`).
- The dotted line aligns with the activity icon column: 33px from the card's left edge (3px border + 12px `p-3` + 18px half of `w-9`). Use a `w-[33px] flex justify-end` column so the 1px line sits flush-right at the icon axis.
- Line height scales with duration: 36px for gaps < 2 hours, 56px for 2+ hours.
- Pressed state managed with `useState` + `onPointerDown/Up/Leave/Cancel` — not CSS `active:` — because background-image can't be toggled via Tailwind pseudo-variants cleanly.
- Gap handler signature: `onGapTap(startTime: string, endTime: string)` — both times carried even if downstream only uses start for now.

## Color token conventions
- Neutral muted text: **`text-activity/50`** (warm Ink at 50% opacity, `rgba(26,26,46,0.5)`) — warmer than `text-gray-500` on parchment. A named semantic alias (`text-ink-muted`) is a future cleanup.
- Condition/weather icons: inline hex is intentional — these are semantic accents (`#D18A2E` amber, `#3A7CA5` rain blue, `#8B8680` grey) not neutral tokens
- Icons within SVG-heavy UI (weather): use inline Lucide SVG paths at 13×13, `strokeWidth=2`, rather than icon components, to avoid wrapper divs in tight layouts
