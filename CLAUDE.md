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
