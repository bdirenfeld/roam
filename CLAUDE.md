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

## Database schema — the live DB is the source of truth
- `supabase/migrations/001_schema.sql` is **stale**. Later schema changes (column drops, nullability) were applied directly to the live database and are **not** captured in `supabase/migrations/`.
- Before writing any insert/select, verify columns against `src/types/database.ts` **and** an existing working query for that table (e.g. `AddToTripSheet`'s `cards` insert) — never against `001_schema.sql`.
- Known divergences from `001_schema.sql`: `cards` no longer has `title`/`type`/`sub_type`/`lat`/`lng`/`address`/`cover_image_url` — world facts live on `places`, joined via `cards.place_id`. `cards.day_id` is nullable.

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

## Verification limits — READ BEFORE CHANGING MOBILE LAYOUT
- **Claude cannot see Roam at phone width.** Localhost bounces to login (the Supabase session cookie is scoped to the vercel.app domain) and Chrome's `resize_window` does not narrow the viewport — `innerWidth` stays 1920.
- Therefore: **a mobile-only layout change is proposed, never pushed.** Reasoning about `sticky`, `overflow`, and scroll containers from source is not verification. On 2026-08-29 three consecutive "fixes" for a scrolling issue were shipped blind; two rendered duplicated/ghosted entries on Brennan's phone and were reverted (`64e69a2`, `bea4276`).
- `.mobile-container` sets `overflow-x: hidden`, which per spec computes the other axis to `auto` and makes it a **scroll container** — so `position: sticky` inside resolves against that box, not the viewport. Swapping to `overflow-x: clip` is the textbook fix and it still broke the render. **Leave it alone.**
- Known, accepted, cosmetic: the day header scrolls away at the bottom of a long day.
- **A containment rule that exists only at `md:` is a mobile bug waiting to happen.** The day map box carried `md:overflow-hidden`, so it clipped on desktop and not on a phone. Mapbox forces every marker to `position: absolute; top: 0; left: 0` plus a translate; markers outside the visible extent got large offsets, escaped the 192px box, landed far down the page and inflated the document scroll height — a huge dead gap below the card list with duplicated card rows stranded in it. Fixed in `bc5f376` by clipping at every width. When a mobile-only visual bug appears, grep the component for `md:overflow`, `md:h-`, and `md:rounded` before theorising about anything else.

## Card faces (agenda rows) — what a row is allowed to say
- A row shows **facts, not prose**: category label + short address ("Restaurant · 235 Mulberry St, New York"); flights show `ORIGIN → DEST · time`. Notes are never surfaced on a card face — they read inconsistently and truncate mid-word. The writing lives inside the card.
- The left rail carries the bare category glyph above the time. **Numbered pins were tried and rejected** — as filled discs they shouted over the names, as bare numerals they read as debris. Matching a fork to a fork beats matching 3 to 3.
- Photographs come from `/api/places/photo?place_id=…&index=0` and hide themselves `onError`. Places without one get nothing rather than a grey placeholder — the asymmetry is honest.
- `places.cover_image_url` is null for every row; photos are fetched client-side. Do not treat a null there as a missing image.

## Estimate (trip budget)
- Table `trip_budgets` (trip_id PK, user_id, currency, fx_to_cad, `assumptions` jsonb, `basis` jsonb), own-rows RLS.
- Nine lines in two groups (`standard` / `additional`). Model in `src/lib/budget/model.ts`; `src/lib/budget/load.ts` is shared by the route and the overlay so the two can never drift.
- Defaults ship with **prices blank and counts real** — the app never invents a price. `suggest()` fills them from a great-circle flight band and per-card `details.budget`.
- **Sub-components must live at module scope.** Defining `Row`/`Shell` inside the component body gives them a new identity every render, which remounts the subtree and destroys the focused `<input>` — that was the "typing one digit kicks me out of the cell" bug.

## Ideas capture (share target)
- `public/manifest.json` declares a `share_target` at `/share`, so Roam appears in the Android share sheet from TikTok, Instagram, Reddit, Lonely Planet.
- Two things break this silently and both have bitten: `public/sw.js` caching `/manifest.json` as an immutable asset (**bump `VERSION` on every sw.js change**), and `src/middleware.ts` intercepting `manifest.json`/`sw.js` (the matcher must exclude both).
- Table `ideas` (id, user_id, url, title, note, source, status, `tags text[]`), own-rows RLS, GIN index on tags.
- **Unfinished:** nothing promotes an Idea to the wishlist — the capture → resolve → wishlist pipeline stops one step short, pending geocoding.

## Mobile reachability trap
- `DesktopMasthead` is `hidden md:flex`. Anything whose only entry point is added there is **invisible on a phone**. This has shipped twice (the estimate entry point, then ideas). Every new destination needs a mobile door.

## Overlay-hosted screens (Overlay.tsx)
- A screen mounted inside `Overlay` must make its root a **flex item of the card** — `flex-1 min-h-0 flex flex-col` — never `h-full`. The desktop card is `h-auto max-h-[86vh]`, so a percentage height resolves to auto, the card clips at 86vh and the `flex-1 min-h-0 overflow-y-auto` body inside never gets a bound. That was the "Estimate won't scroll on desktop" bug (fixed in `a967532`). Mobile hid it because the sheet is a fixed `h-[92dvh]`.

## Map pin popup (MapPinPopup.tsx)
- `details.notes` and `details.recommended_by` are edited in place on the popup via `DetailsField` (tap the line; dotted link when empty). Each save merges one key and calls `onCardUpdate` so the pin restyles. The type editor behind the pencil still carries its own recommended-by input.
- A scheduled copy of a place is a separate card: `recommended_by` set on the interested card does **not** carry to the in_itinerary card, and the map shows the scheduled (filled) pin first. `scheduleCardOnDay` should copy it; until it does, set both.

## Card sheet and save sheet — click-audit conventions (Sep 2026)
- `AddToTripSheet` pre-picks type/sub_type from `place.details.types` via `lib/places/inferType` (the bulk importer's table). A miss leaves the pills unselected; never make the pill mandatory again — it was the most-taxed tap in the app.
- `CardBottomSheet` delete has **no confirm**: every host (PlanBoard, DayViewClient, FullMapClient) offers a 6-second undo through `onCardDelete`. A new host that mounts the sheet must provide undo or it gets an unrecoverable delete.
- Notes and recommended-by are never gated behind "Add details" for the owner. The standalone notes row in the sheet hides itself when `showEmptyFields` is on so the detail component's own row doesn't duplicate it.
- The full tap-count audit and remaining batches live in memory (`roam-click-audit`).

## Unscheduling (lib/scheduleCard.ts → unscheduleCard)
- Scheduling COPIES, so "take off this day" = delete the scheduled row, after making sure an `interested` copy of the place exists on the journey (one is written if not). Callers then fire `onCardDelete(card.id)` so the host's existing 6-second undo applies. The map popup also fires `onCardCreated` for the copy it may have written, so the hollow pin appears without a reload.
- The shared `AppMenu` now carries Ideas (a plain link) and, on the phone only, Profile. Desktop keeps Profile/Sign out in the masthead avatar dropdown.

## Bottom sheets: the whole sheet swipes (hooks/useSheetDrag.ts)
- Bind `useSheetDrag` handlers on the sheet ROOT, never only the handle — Brennan has asked for this twice. Pass `{ mobileOnly: true }` for sheets that become centred modals at md+. The hook finds the nearest scrollable ancestor of the touch target, so a list inside the sheet still scrolls and a swipe only dismisses when that list is at the top; wire `onTouchCancel` too.
- Do not write another local `useSheetDrag`; GlobalSearch, JourneyNotes and YearView now delegate to the shared one. Seven older sheets (AddToTripSheet, BoardBgPicker, ConfirmationPreviewSheet, CreateCardSheet, DocumentsSheet, LinkPlaceSheet, NoteCardSheet) bind on their root with hand-rolled handlers and no scroll guard — migrate them when touched.

## Feedback: one toast, undo on every delete, Escape on every overlay (ui/Toast.tsx, hooks/useEscapeKey.ts)
- `useToast()` is the only way to tell the user something failed or was undone. No new
  toast pills, no per-host undo bars. `toast({ message })` for a notice (3 s);
  `toast({ message, undo })` for a delete (6 s, re-insert under the ORIGINAL id so
  attachments and links keep pointing at it). The Plan board still carries its own
  bar (card + list undo) — fold it in when you next touch it, don't add a third.
- Every Supabase write in a user action reads its `error`. On refusal: restore the local
  state, then `toast({ message: "Couldn't … Try again." })`. A `console.error` alone is
  a silent failure and the UX audit (Sep 2026) counted 32 of them; don't add a 33rd.
- Journey hard-delete goes through `lib/deleteJourney.ts`, which also detects the RLS
  "no error, zero rows" refusal a guest hits.
- Any overlay, sheet or confirm that is not on `Overlay.tsx` calls `useEscapeKey(onClose,
  active)`. Hooks stay unconditional: pass `active` for a confirm that is only sometimes open.

## The journey menu (ui/AppMenu.tsx) stays at six plain rows
Journey notes · Share journey · Estimate · Bookings (host-provided `extra`) · Journey settings ·
Ideas. No subtitles. Nothing app-level (Search, Plan a journey, Profile) goes in it: Search is a
glyph in the phone header and a button in the masthead, Plan a journey is the "+" on Journeys,
Profile is the avatar. Brennan's phone verdict, Sep 2026: "way too much in a menu". Before adding a
row, ask whether it is about *this journey*; if not, it belongs on the Journeys page or the header.
Same rule for sheets: two sheets doing one job in two styles get merged (the Add-to-this-day sheet
lists saved places first, Google after, in the house parchment).

## Colour ground: white is what you touch, warm near-white (#F5F4F1) is only the desktop table
Every sheet, overlay, popover, menu and phone page is white (`#FFFFFF`). Parchment (`#FAF7F2`)
is the ground BEHIND cards on desktop pages (Journeys grid, Plan board, Map sidebar) and nothing
else. Phone pages that share a component with desktop use `bg-white md:bg-parchment`. Brennan,
from his phone, Sep 2026: "a mix of parchment and white… should we just go to white?" Don't
reintroduce a cream sheet to "match" another; match white.

## `.mobile-container` uses `overflow-x: clip`, never `hidden`
`hidden` turns the phone column into a scroll container and silently kills every `position: sticky`
inside it (the Ideas filter row sat still for a day). `clip` trims the same overflow. If a sticky
element stops sticking on the phone, look for a new `overflow: hidden` ancestor before anything else.

## Excursions in the Estimate
Every activity card panel has a "Cost per person" row writing `details.cost_per_person` (a number,
in the currency you were quoted in). `lib/budget/load.ts` reads `details.budget` first, else
`cost_per_person` (converted like any non-CAD budget), else counts the card as uncosted; the
Excursions line's hint reads "from N cards · M uncosted". The planning skill writes `budget`;
the card sheet writes `cost_per_person`; both feed the same line.

## Text tones (contrast, Sep 2026)
Ink `#1A1A2E` over white: 0.62 alpha = 4.8:1 (AA for small text) — this is CAPTION; 0.5 = 3.3:1
— this is SOFT, for hints and placeholders only, never for something a person must read; 0.55
(3.85:1) and 0.42/0.35 were the old tiers and fail. The accent is `#B0541F` (5.1:1 on white,
4.75 on parchment); `#C4622D` was 4.09 and is gone. Don't reintroduce either.

## Offline writes: three helpers, not raw Supabase (lib/offline/queuedWrite.ts)
`queuedUpdate`, `queuedInsert`, `queuedDelete` return `{ queued, error }`. Offline or on a hung
request they enqueue and return `queued: true` — keep the optimistic UI, never roll back. A
`queuedDelete` of a row whose insert is still queued cancels the insert and sends nothing. The
caller gives inserts their id (`crypto.randomUUID()`), so the local row and the server row agree.
Routed through these: card delete (sheet, pin popup, map sidebar, board, unschedule), card
restore/undo, note cards, template cards, list create/rename/delete, schedule-to-day.
NOT queued, on purpose: anything that needs the network to be meaningful — saving a Google
place (needs the places upsert), bookings import (parse API), sharing (email), the estimate.
The indicator shows "You're offline…" whenever the browser is, and "N changes will sync" once
something is queued. Queued inserts are not overlaid on cached reads: after a reload while still
offline, a card created offline is absent until it syncs. Known and accepted.

## Exchange rate: two live sources, then a dated table — never "a guess" (lib/budget/currency.ts)
`fetchRateToHome` tries exchangerate-api's open feed, then Frankfurter on `api.frankfurter.dev`
(the old `api.frankfurter.app` host only redirects now, which is what broke the live rate on
2026-09-04). If both fail the Estimate uses `REFERENCE_RATES` and says "the <month> rate";
refresh that table and `REFERENCE_MONTH` now and then (`open.er-api.com/v6/latest/CAD` gives
every rate at once). The row's caption names its source: typed, today's, reference, or last saved.

## Estimate reads costs off attachments ("ticket" rows)
A scheduled activity card with no cost but a parsed attachment takes its cost from
`card_attachments.parsed_data` (`ticketCost` in lib/budget/load.ts): `cost_per_person` first, then
anything shaped like a whole bill (`cost_total`, `total_cost`, `amount_paid`…), then a per-adult
price. The parser names fields loosely, so match on shape, never a fixed key list. The row is
tagged "ticket"; typing over it writes the card and wins. Nothing is written to the card by the read.

## Ideas: links play in place (api/embed, trip/IdeaEmbed.tsx)
`/api/embed?url=` resolves short links (vt./vm.tiktok.com, youtu.be) and returns a player URL for
TikTok (`/embed/v2/<id>`), YouTube (`/embed/<id>`, Shorts portrait) and Instagram (`/<kind>/<code>/embed/`,
best effort — private posts stay blank). The row loads it only when opened. The row shows a 200px poster with a play button first (TikTok oEmbed / YouTube hqdefault; Instagram has none, so a plain tile); the tap that swaps in the player also asks for autoplay. Never auto-play in a list. There is no CSP in
next.config, so frames need no allow-list; if one is ever added, allow those three hosts in
`frame-src`.

## Estimate looks prices up for the blanks (api/estimate/find-prices)
"Estimate from this journey" also POSTs the journey to `/api/estimate/find-prices`: every
scheduled activity with no typed cost, no budget and no readable ticket goes to Claude Sonnet
with server-side web search (`web_search_20250305`), four at a time, and comes back per person
in the journey currency. The route writes `cost_per_person`, `budget` and
`cost_source{kind: found|guess, url, note}` to the card so nothing is looked up twice. Table tag
order: booked › ticket › found (links to the page) › guess › est. There is no separate button
— Brennan: "why can't this be part of the Estimate button itself?" — and it never runs unasked.

## Estimate defaults learned from the seven-journey audit (Sep 2026)
Unknown country → home currency (CAD), never euros. Within ~80 km of home → no fare, car hire
and dog boarding off (`defaultAssumptions(..., home)` and `suggest`). Countries where tourism
is priced in US dollars (Costa Rica, Panama, Ecuador, Belize, Cambodia…) map to USD in
`currency.ts`, not their local unit. The Excursions hint is "N of M without a cost" and may wrap.
Counts, rows and the table follow the `items` state, so a lookup updates them without a reload.
The price lookup writes each card as its answer lands, runs eight at once, starts no new batch
after 35 s and returns `remaining`; the client toasts "N still to look up — tap Estimate again".
The prompt carries the journey's other stops in day order so a park or venue fee is paid once.
Car hire starts off in metro cities (`isMetroCity`); meals out seed at every other night.

## Entry requirements (lib/entry, api/entry/check, trip/EntrySection.tsx, day/EntryLine.tsx)
One `trip_entry` row per journey (migration 009): `passports text[]` at journey level, `data` jsonb
(shape in lib/entry/types.ts), `changed`, `checked_at`. The lookup reads the Government of Canada
travel advice page with Claude + web search and returns lines (visa / before / onward / passport /
other-N); a "done" tick survives a recheck by key. EntrySection and EntryLine read their own row —
no page or overlay plumbing. EntryLine runs the first check in the background for the owner of a
future journey, rechecks inside 30 days if the answer is more than 7 days old, never checks a
past journey, and does nothing (spends nothing) when the select errors. `TripSettingsLink
section="entry"` scrolls to the block. It never applies for anything.
Settings order: cover → Name/Destination/Dates/Travellers → Travellers list → Entry (one row,
closed; `defaultOpen` from the Agenda line) → Share as flat rows (no card) → Archive/Delete.
Every section speaks the row language: `px-5 py-[14px] border-b border-black/5`, a `w-20`
uppercase label, the value, a quiet action on the right. The consent-letter line is standing on
any journey with a child (route adds it; the lookup's own wording is filtered out).
Advisory level rides the same lookup (`data.advisory` {level 1–4, label, reason}): silent at 1,
one fact line at 2+, leads the Agenda line at 3–4, a level change toasts like a rule change.
Never the full risk page.
The desktop masthead's menu lives in the layout, so any host-owned row (Bookings) is a
`window` event (`roam:open-bookings`) that Day, Plan and Map listen for — the six rows are
identical on both widths.

## One look (consistency sweep, Sep 2026)
`ui/JourneyHeader.tsx` is the phone header for Plan and Map (the Agenda keeps its own copy because
its subtitle is the weather): back, italic title + small line, search, menu, 44px glyphs, white
bar. `ui/AddPlaceRow.tsx` is the one "Add a place" (ringed plus, quiet row; `centered` for an
empty state). Primary buttons are `rounded-full` ink pills, one per screen. Bookings lives in the
menu only — no separate chip on any width.
Ground tokens (Sep 5 2026, Brennan chose "warm near-white" over the cream): `--background`
#F5F4F1; secondary tint #F0EFEB (was #F7F3EA); the "Add from saved" pill #EDECE8 (was #F2EDE3).
The cream #FAF7F2 is gone everywhere, including as off-white text on ink buttons.
The body ground is Tailwind's `bg-parchment` token (tailwind.config.ts), not only `--background`;
both now read #F5F4F1. Change the ground in both places or the body keeps the old colour.
