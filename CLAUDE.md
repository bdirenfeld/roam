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

## Guests (Sep 2026 walk-through)
The invite page (`journey/[token]`) names the journey, dates, host and cover before sign-in — the
token is the invitation, so its holder may see the title. Guests get Bookings read-only (menu row
on both Agenda and Map; `onImport` undefined hides Upload and the empty state says nothing has been
added). The entry line is plain text for guests; settings, estimate and the Plan tab stay owner-only.
Menu rows read Notes · Bookings · Ideas · Estimate · Share · Settings — never "Journey notes" or
"Journey settings": you are already inside the journey when the menu opens (Brennan, Sep 2026).
Bookings (plan/DocumentsSheet.tsx) lists two stores: `documents` (uploaded through the sheet) and
`card_attachments` (added on a card). New York had eight card attachments and an empty sheet before
this. Card files open in a new tab and delete from their card, not here.
`card-attachments` is a PRIVATE bucket: `file_url` (a /object/public/ URL) never resolves. Open a
file through `createSignedUrl(s)` on `file_path`, signed before the tap (iOS blocks a post-await
window.open). Every bottom sheet uses `useSheetDrag` — hand-rolled touch handlers dismiss on scroll.
Never nest interactive elements: CardSurface is a `<button>`, so anything tappable inside it is a
`<span role="button" tabIndex={0}>` with a keyboard handler. A `<button>` inside it made the HTML
parser close the card early — the rest of the day spilled out below the nav and hydration bailed.
Add sheet: the name opens the card (`onPreviewCard`), the pill adds, the row turns "Added ✓" and the
sheet stays open; the host lifts the last added card on close. Files open in `ui/FileViewer.tsx`
(× at top, "Open in browser" fallback) — never a bare `target="_blank"` from a sheet on the phone.
Add flow: "Added ✓" is the undo (queuedDelete + `onCardRemoved`); a previewed card returns to the
add sheet on close (`returnToAddRef`); untimed cards reorder by press-and-hold anywhere on the row
(listeners on the row, `touch-action: manipulation`, no grip); the untimed group is introduced by one
italic line, not a small-caps rule.
Agenda cards are `select-none` (a long press on a phone otherwise means "select text"), and an
untimed card drags only from its visible ≡ handle (`touch-none`); a whole-row drag cannot claim
the touch without killing scroll. Timed cards never drag. Press-and-hold cannot be tested by
script — say so and let Brennan's thumb decide.

## The time chip and the quick time sheet (Sep 2026)

- Every agenda card's time is a tappable chip in the rail (`CardSurface` `onTimeTap`,
  a `span role="button"` because the card itself is a `<button>`). Untimed cards
  read "No time". The rail is 62px on phones so "12:30 PM" fits; `GapRow`'s
  spacer must match.
- `TimeSheet.tsx` is the sheet: Start/End are TYPED text fields read by
  `parseTypedTime` ("230p", "14:30", "9", "noon"; a bare 1–6 is afternoon,
  7–11 morning), with the reading shown under the field and a sienna ring
  when it is not a time. A ±15-min length stepper, Morning/Lunch/Afternoon/
  Evening, No time, Done. An end at or before the start is dropped, not saved.
  An untimed card opens with `suggestedStart` = the end of the day's last
  timed card (DayViewClient), so the common case is chip → Done.
- `DayViewClient.handleTimeSave` writes `start_time`/`end_time` via
  `queuedUpdate`, re-sorts with `agendaOrder`, lifts the card, and the toast
  carries Undo. Drag-reorder stays for untimed cards only: ordering timed
  cards is done by changing the time, never by dragging (the old time would
  ride along and put the card back).
- The Agenda entry line's × stores the exact headline in
  `trip_entry.hidden_headline` for the owner (RLS: owner updates, members
  read), so it holds on every device and for guests. A guest's × falls back
  to `localStorage["roam:entry-line-hidden:<tripId>"]`. New words (a rules
  change, a tick) bring the line back either way.
- Phone headers carry no subtitle on Map or Plan ("Map · 90 places", "Plan"
  said nothing); the Agenda keeps its weather line.

## A Supabase query builder does nothing until something awaits it

`void supabase.from("t").update(...).eq(...)` sends NO request — the builder
is lazy and only runs on `await` / `.then`. Three "changed = false" writes
and the entry-line × were silently dead this way (found Sep 5 2026). Fire
and forget must be `.then(({ error }) => …)`, never `void`.

## Sept 5 2026 afternoon: the rules these changes set

- **No drag on the Agenda.** Order is the clock; an untimed card gets its place
  by being given a time (the chip). Do not bring dnd-kit back to CardTimeline.
- **One time control.** The agenda chip and the card sheet both open
  `day/TimeSheet.tsx`. Never add a second time editor.
- **One label table.** `lib/subTypeLabel.ts` names every place kind; a new
  `sub_type` goes there or it renders humanised from the key.
- **Ideas is an overlay** from every ··· menu (`IdeasLink` / `useIdeas` in
  AppOverlays), like Estimate and Settings; `/ideas` stays for the masthead
  tab and links. Screens hosted in `Overlay` take `variant="overlay"` +
  `onDismiss` and render × instead of ‹.
- **Install banner** is `ui/InstallBanner.tsx`, mounted once in (app)/layout.
  Android gets the browser's own prompt behind a button; iPhone gets the
  two-step text; a website cannot install itself, so do not promise that.
- **Plan a journey** takes invite emails and posts each to
  `/api/share/send-invite` right after the trip and days are inserted.
- Map filters read **Saved · Scheduled**.

## Day map stacking and the passport picker (Sept 5 2026, evening)

- `DayMap` never nudges a pin. Pins within `STACK_PX` (30) on screen collapse
  into the lowest-numbered one, whose badge lists every number ("2 · 3",
  "2 – 4"); `restack()` runs on `moveend`. Tapping a stacked pin fills the
  screen on a phone (`expanded` / `onToggleExpand` from DayViewClient) and
  fits the group at maxZoom 17. The badge is 18px / 11px bold ink.
- Held: edge chips (open on where the day mostly happens) and count clusters
  on the big map — both mocked up, his call after real use.
- Passports in Entry are chosen from `lib/countries.ts` (name + demonym);
  the demonym is what is stored and what the check reads. Free text is never
  saved.
- Full-screen day map: `DayMap` takes `dock` (the day's `CardTimeline`) and
  `focus` ({cardId, nonce}); DayViewClient swaps `onPinTap` for a scroll-and-
  lift handler while expanded, and a card tap flies the map (same card twice
  opens it). Stacking measures the drawn pin (`PIN_FALLBACK_PX` only before
  first layout).
- `lib/countries.ts` carries aliases (UK, USA, Holland…) and every ISO
  territory; `isKnownPassport` decides the sienna "not on our list" chip.
  Free text IS kept now, but always marked.
- The hotel is a `PinItem` with `index: -1` and no z-index lift, so it stacks
  like any pin ("2 – 4 · ★"). The full-screen map is `z-[55]` (above the
  BottomNav's z-50, below the z-60 sheets). A card tap in the dock never
  changes zoom: on-screen pin jumps, off-screen pin slides in at current zoom.

## The big Map has NO rings (Sept 5 2026, reverted)

Count rings on the Map tab shipped as 961000c and Brennan reverted them the
same evening: "It's terrible. Please revert back. I like the way it was
before." The Map draws every pin at full size, as it always did. Do not
bring clustering back to FullMapClient without him asking for it by name.

## Spending routes: sign-in and quotas (scale audit, Sept 2026)

Every API route that calls Claude, Google, Mapbox or Unsplash goes through
`lib/api/guard.ts`: `requireUser()` (401) then `underQuota(supabase, key,
QUOTA.key)` (429). Counts live in `public.api_usage` per user/route/UTC day
behind the SECURITY DEFINER `bump_api_usage` (authenticated only). A new
spending route MUST use both; a new limit goes in `QUOTA`. The counter fails
open on a DB error and logs. Five routes had no sign-in check before this.
- `/privacy` and `/terms` are public (middleware publicPaths) and must stay
  so: Google's OAuth review links to them. Delete account = Profile → two
  taps → `POST /api/account/delete` → `delete_my_account()` (definer, deletes
  cards/days explicitly since they don't cascade), storage cleanup, admin
  deleteUser. Sign-in by email = `signInWithEmail` (signInWithOtp) landing on
  the same `/auth/callback` as Google.
- Place photos are cached: `/api/places/photo` serves `places.photo_cache`
  (public `place-photos` bucket) and only calls Google when the entry is
  missing or past its 30 days. THIRTY DAYS IS DELIBERATE — the Google Maps
  terms allow temporary caching, not permanent copies. Never remove the
  expiry. The quota is counted only on a real Google fetch.
- No Sentry (it needs an account). Failures the app can't handle go to
  `public.client_errors` via `/api/errors`, posted by `ui/ErrorReporter.tsx`
  in (app)/layout. RLS is on with no policies: only the service role writes,
  and only SQL reads. Deduped per session, 5 per page load, 60 per user/day.
- Photos come in two sizes: `&size=thumb` (320px, cache key `t{index}`) for card
  rows and plan tiles, full 800px for the gallery and card sheet. A row drawing
  52px used to pull the 800px original.
- `/api/embed` follows short links outbound, so it is signed-in + quota'd.
- THERE IS NO PAYWALL. `has_paid` is written by the Stripe webhook and read only
  by `/checkout`; the middleware gates on sign-in alone. Older comments claimed
  a gate that never existed. Do not add one without Brennan asking.

## What renders must never depend on `window`

Journey settings failed hydration on EVERY load (React #425 then #422) because
the share URL was built as `typeof window !== "undefined" ? origin/... : null`.
The server rendered "Make a link", the browser's first render said "Copy link",
React threw the server HTML away and re-rendered the subtree. Caught by the
error log on its first night (Sept 2026).

The rule: a value that decides what is DRAWN must be identical on the server and
in the browser's first render. Anything needing `window`, `localStorage`,
`Date.now()` or a random value belongs in an event handler or a `useEffect`,
never in the render path or a `useState` initialiser.

Still carrying the pattern, latent (only bites once a board background is
saved): `PlanBoard`'s `boardBg` useState initialiser reads localStorage.
`MapPinPopup` reads `window.innerWidth` during render but only ever renders
after a tap, so it is never in server HTML.

## A share link opens the itinerary, not a sign-in wall (Sept 2026)

`/journey/[token]` for a signed-OUT visitor renders `SharedItinerary`: the
days, the times, the places, and nothing else. The link is the secret and
holding it is the permission. Signed-in visitors still claim membership and
redirect into the app exactly as before.

NEVER add to that page: attachments (passport and payment details live in
flight confirmations), entry requirements, the budget, journey notes,
travellers' names or ages. The link is forwardable.

`force-dynamic`, so every open shows the current plan; `RefreshOnFocus`
re-fetches when the tab comes back, at most once a minute. Photos come from
`places.photo_cache` only — `/api/places/photo` needs a session and this page
has none. New tokens are 24 characters; the old 12-character ones still work.

## The Plan board's "Add another list" pane lives in the HEADER row

The desktop board is three sibling rows in one X-scroller — week bars, day
headers, columns — and every row carries the same leading slots at the same
widths so they cannot drift apart.

`AddListColumn` sits in the **day-header row** (`listHeaderCells`), positioned
`absolute top-0` inside a `relative` slot, with a plain spacer holding its place
in the columns row. Two reasons, both learned the hard way on 2026-09-06:

- **In the columns row it aligned with the first card, not with Day 1** — about
  100px too low — and it jumped 154px up the board every time a week folded,
  because the header row's height vanished with it.
- **It has to be out of flow.** In flow, opening the composer makes the pane
  110px tall, which stretches the header row and shoves every single column down
  the moment you tap it. `WeekFoldedCard` is out of flow in the week-bar row for
  exactly the same reason.

The pane's top now equals the day-header cell top (both 185px on a 12-day trip),
and when every week is folded it shares a top edge with the folded week cards.

The composer field is **15px DM Sans**, not `LIST_TIER2`. `LIST_TIER2` is 22px
Playfair italic — the style list *titles* render in — and setting an empty input
in it produced a huge box with a giant placeholder. The auto-grow cap is 63px,
which is three lines at 15px; it was 76px when the field was 22px.

The phone is untouched by all of this: there the pane is `fullWidth` and is a
swipe pane of its own, rendered from a separate `<AddListColumn fullWidth />`.

## A folded week is the same height as an open one

`WeekFoldedCard` and `WeekBar` must render at the same height. They share the
box exactly — `rounded-[9px]`, `px-[13px] py-2`, the same border, and the range
in 15px `font-display italic` — and differ only in width (`FOLDED_W` 140px vs the
full week span), background (white + `shadow-card`, so folded still reads as
closed), and the sign (`+` vs `−`). Measured live: both 41px tall, both at the
same top.

**Why it matters:** folded cards are `absolute` inside their slot, so they add no
height to the week-bar row. A folded card taller than a bar therefore does not
push anything down — it *hangs over* the day-header band below, and every top
edge on the board stops lining up. That is what a three-line folded card (~76px
against a 41px bar) did until 2026-09-06.

The face carries only the range and the `+`; 140px has no room for "Week N" or
the day count, and both live in the `title` and the `aria-label` instead.

There is **no `topOffset`**. An earlier version pushed folded cards down 12px when
every week was folded, to meet an "Add a list" rail that had 12px of its own top
padding. Both are gone: at bar height the chip already lands on the right line,
and with every week folded it shares a top edge with "Add another list".

## A trip gets ONE list, and it is called Logistics

Do not rebuild many-lists. The numbers that killed it (2026-09-06): three lists
had ever been created across thirteen trips, all Brennan's, no tester ever made
one, and both real ones were named **Logistics**. All seven cards in them were
**note cards** — packing, grocery list, travel confirmations, a house guide —
and two already carried checklists. Meanwhile the saved pile held 268 cards.

A list card and a saved card are the same row in the same table with the same
`interested` status; the only difference is whether `list_id` is set. **Ideas is
the unnamed list.** That is why a second named bucket earned nothing.

The cap lives in `handleCreateList`, not in the UI — `if (listsRef.current.length
> 0) return;` — so it holds on the phone pane too, which cannot be verified from
here. The desktop has no list composer at all: the `+ Logistics` chip in the
control row creates the column and then hides itself, since it has nothing left
to offer.

Rename and delete on the header still work. One column was the decision; a
frozen name was not.

**Why this mattered beyond tidiness:** the leading columns were the only part of
the board whose geometry varied, and they carry no week bar and no day header,
so the add-list pane belonged to no row. Level with Day 1 it looked sunken
against the weeks; level with the weeks it left a permanent gutter beside Day 1.
Capping at one column is what makes the board's left edge a fixed, solvable
shape. If a future change reintroduces variable leading columns, that whole
argument reopens.

## A height class is a promise the parent has to keep

Three separate bugs in one evening (2026-09-06), all the same mistake:

- **The day map** was `h-48` with the default `flex-shrink: 1`. 192px was a
  BASIS, not a floor, so as the list beside it grew the map was the thing that
  gave — scrolling to the bottom of a day squeezed it. Fixed with `flex-shrink-0`.
- **The journey-notes scroller** was `h-full` inside a flex item with no resolved
  height, so `height: 100%` had nothing to resolve against and fell back to auto:
  39 grocery items grew the list to 1948px inside a 561px box, which never
  scrolled and painted the add row over its own last lines. Fixed with
  `flex-1 min-h-0` in a real flex column.
- **The guide overlay's iframe** was `h-full` inside `Overlay`, which is
  `h-[92dvh]` on a phone but **`md:h-auto`** on a computer. A child asking for
  100% of an auto-height parent got nothing, and the sheet rendered as a stub
  with a squashed iframe. Fixed with an explicit `h-[72dvh] max-h-full`.

Before writing `h-full`, `h-[N]` or `flex-1`, check what the PARENT actually
guarantees. `h-full` needs an ancestor with a resolved height; `h-[N]` on a flex
item is only a starting size unless `flex-shrink-0` says otherwise; `flex-1`
inside an `h-auto` box collapses. Every one of these renders fine at the size
the developer happened to test and wrong at another — all three were found by
Brennan on his phone, not by me at desktop width.

## A card's time has one source: `cardTimes`

`src/lib/cardTime.ts` answers "when does this card actually happen". Everything
that shows or sorts a card time goes through it — the agenda's `agendaOrder`,
`CardSurface`'s `rail` chip and `timeRange`, the board's card face.

This exists because a flight that takes you somewhere is stored as when you
LEFT. Rome day 1 holds 19:45 (leaving Toronto) → 10:20 (landing in Rome) and
read "7:45 PM" at the bottom of the arrival day.

Two traps, both paid for on 2026-09-07:

- **"For an arriving flight, use end_time" is wrong on this data.** Rome, New
  York and Palm Springs store departure → arrival, but Australia and Costa Rica
  store the LANDING → the hotel arrival, and already read correctly. The test is
  card-local: a `departure_time` detail equal to `start_time` means start_time
  is a departure. It is deliberately strict about 24-hour format, because "4:00"
  on the New York flight home means 4 PM.
- **The chip and the subtitle read from different places.** The first fix routed
  `timeRange` and the sort through `cardTimes` but left `rail` on
  `card.start_time`, and shipped a card showing two different times. If you
  change what time a card reports, grep for every read of `start_time` on that
  surface before building.

## `places.photo_count` is a generated column

Four bytes saying how many photos `details.photos` holds, so a board can know a
card has a second photo without shipping the references — they average 6.4 KB
per place, about 375 KB of unused text on a twelve-day board. Select it
alongside the other place fields; never select `details` just to count.

## Check `document.visibilityState` before believing anything about the map

Mapbox paints nothing and adds no markers in a hidden tab. A Chrome MCP tab is
hidden whenever its window is behind another app — which is most of the time.

On 2026-09-07 this produced "0 markers" from DOM queries and a blank grey pane
in a screenshot. I first reported a shipped regression, then talked myself out
of it, and BOTH readings were guesses off a hidden tab. The revert settled it:
Rome day 1 came back, so passing `bounds` + `fitBoundsOptions` into the Map
constructor really was breaking days whose pins span a long way — Rome day 1
runs from Fiumicino at 12.25 to the centre at 12.50, and Mapbox throws "cannot
fit within canvas" when the padding will not fit the container it has at
construction time. If the day framing is attempted again, set a plain centre
and zoom and fit AFTER load; never fit in the constructor.

So: before concluding a map is broken, read `document.visibilityState`. If it is
`"hidden"`, the observation is worth nothing. Note that page SCREENSHOTS are
still valid for ordinary DOM and CSS — only WebGL needs the tab visible, so the
Plan board can be checked this way and the map cannot.

## Every push is checked by GitHub Actions

`.github/workflows/ci.yml` runs `tsc --noEmit`, `npm run lint` and `npm run
build` on every push to main. It takes under two minutes — quicker than the
local build, because the runner caches npm.

**It deliberately has no secrets.** The twelve environment variables are
placeholders (`https://placeholder.supabase.co` and friends). The build needs
them to exist, not to be real: every route touching Supabase, Google or Stripe
is server-rendered on demand, so none is called at build time. Verified by
building locally with placeholders — 36/36 pages, exit 0. Keep it that way. A
rotated key can then never turn the checks red, and anything genuinely needing
a live key is caught by Vercel's own build immediately after.

Do not treat this as a substitute for the local build gate before pushing —
it runs after the push, so a red run means bad code is already on main.

What it catches: unused imports, type errors, lint errors. What it does NOT
catch: layout and behaviour regressions, which build perfectly cleanly. The
three reverts of 2026-09-07 were all that second kind.

## The day template is gone — do not bring it back

Removed 2026-09-07 (058879f). It never scaffolded *a* day; it bulk-inserted
"Arrival / Check-in / Morning Coffee / Lunch / Aperitivo / Dinner" onto every
day of the journey at once. One person outside the family ever used it: a
five-day London trip, 23 blank timed rows in a single second, none filled in,
never returned.

An empty day now falls through to the dashed drop target and the `AddPlaceRow`
that were always underneath it.

**Place-less timed cards are NOT template leftovers** and must keep working —
33 of them across five journeys carry plans with no address ("Pool, pack, early
bath", "Finn: drop-off before the airport"). `FullMapClient`'s `isSkeletonCard`
title filter also stays: London's 23 rows are still in the database and are
someone else's data.

## ErrorReporter's IGNORED list

`ui/ErrorReporter.tsx` drops matching messages in the browser so they never
reach `/api/errors`. It holds one pattern: supabase-js's "Lock broken by
another request with the 'steal' option", which was four of the twelve rows in
`client_errors` and has never corresponded to a real fault.

Add to it only after seeing a pattern in the table AND establishing it is
benign. A real fault silenced there is invisible, and this log has already paid
for itself once — it is what found the settings hydration failure.
