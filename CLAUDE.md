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
- One typeface: DM Sans (`font-display` = DM Sans 500, -0.01em). Since 24 Sep 2026.
- Playfair Display is not loaded any more. Before that date every `font-display` was italic
  because the app only loaded Playfair's italic faces — an accident, not a choice. The journey
  name on the cover was already DM Sans. `globals.css` neutralises the `italic` utility on
  `.font-display`; do not add `italic` to display text and do not bring Playfair back.
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
- Never use Inter or a system font for display text; DM Sans is the one face
- Never use aggressive red for soft or reversible actions
- Never use "Danger zone" section labels — use "Manage journey" instead
- Never introduce multiple competing accent colors
- Never use checkbox-heavy filter panels — use opacity and toggles
- Never reintroduce a serif display face without Brennan asking for it by name
- Never push to a feature branch — always push directly to main
- Never batch more than 2-3 related changes in a single prompt

## Tech stack
- Next.js 14, Supabase (Postgres + auth), Mapbox GL JS, Tailwind CSS
- Google OAuth for authentication
- Google Places API for card photos and place data
- Deployed on Vercel, pushes go directly to main
- **Server-side "who is signed in" = `getAuthUser(supabase)` (lib/supabase/authUser.ts), never `auth.getUser()`.**
  getUser is a round trip to Supabase Auth; on 27 Sep 2026 Auth slowed to 4–13 s and middleware read the
  timeout as "signed out", bouncing day taps to /login (phone showed "Application error"). getClaims checks
  the token locally; day pages went from 4–9 s to ~0.3–0.5 s. getUser stays only where user_metadata or a
  verified email is needed (profile, send-invite, checkout).
  The same goes for the browser and the API routes (every photo request used to ask). The masthead
  reads the avatar from `getSession()`. `authUser.test.ts` fails if anything else calls getUser.

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
- **Row E (24 Sep 2026):** the left rail is the time in its pill and nothing else. The pin
  number is not drawn on the row (the map pins keep it; a pin tap lifts the row). The category
  glyph leads the subtitle in place of the category word ("🍴 Via Rosina"). Read left to right:
  time · title · picture. Brennan's test: squint and every row must keep the same silhouette.
- **Two lines, no exceptions (24 Sep 2026):** title on line one, ONE meta line on line two,
  truncated, nothing below. Hours warning replaces the address; rating and price follow;
  then the badges (Booked, checklist, attachments) inline. Recommended-by is not on the face.
  A note shows its lead line, cut at the edge. Every row is the same height; that is the
  point ("visually it just looks off" when a row runs to three).
- The day map box is `h-48 min-h-[12rem] flex-shrink-0` and the list scroller is
  `overscroll-y-contain`: on Android the address bar changes the viewport height
  mid-scroll and the map must not squish with it.
- Every row carries a 52px tile. A place shows its photo; a place with none, and a note, show
  a quiet tile (edit_note glyph on #F3EFE4). The old "no placeholder, the asymmetry is honest"
  rule is gone: he asked for a default picture so notes don't "look weird".
- `places.cover_image_url` is null for every row; photos are fetched client-side. Do not treat a null there as a missing image.

## Estimate (trip budget)
- Table `trip_budgets` (trip_id PK, user_id, currency, fx_to_cad, `assumptions` jsonb, `basis` jsonb), own-rows RLS.
- Nine lines in two groups (`standard` / `additional`). Model in `src/lib/budget/model.ts`; `src/lib/budget/load.ts` is shared by the route and the overlay so the two can never drift.
- Defaults ship with **prices blank and counts real** — the app never invents a price. `suggest()` fills them from a great-circle flight band and per-card `details.budget`.
- **Sub-components must live at module scope.** Defining `Row`/`Shell` inside the component body gives them a new identity every render, which remounts the subtree and destroys the focused `<input>` — that was the "typing one digit kicks me out of the cell" bug.

## Share target: straight to the map (26 Sep 2026)
- `public/manifest.json` declares a `share_target` at `/share`, so Roam appears in the **Android** share sheet (TikTok → Share → More → Roam; Instagram → paper plane → Share to → Roam). iPhones cannot share into a web app.
- Two things break this silently and both have bitten: `public/sw.js` caching `/manifest.json` as an immutable asset (**bump `VERSION` on every sw.js change**), and `src/middleware.ts` intercepting `manifest.json`/`sw.js` (the matcher must exclude both).
- **Ideas is retired.** Brennan: "cut out all the middle steps". `/share` shows the shared video first (poster from TikTok oEmbed via `/api/share/preview`, tap to play the embed; Instagram gets the player only), then "Which place is this?", the caption guess, and the map's search. No autofocus; the video shrinks to a small tile while typing. His correction the same day: a bare search box made you forget what you were saving. Pick a place → `nearbyJourney` (`lib/share/journeys.ts`: within 150 km of the destination point OR any pin; archived journeys count, live ones win) → `pinPlaceToJourney` → `/trips/{id}/map?pin={cardId}`, which flies to the pin and opens its card (Put on a day lives there) + a toast with Undo. No journey near → one list: journeys, Wishlist (household owner only — it lives inside Your year), "A different place". Undo deletes the card and returns to `/share?choose={googlePlaceId}`, i.e. that list. Wishlist saves land on `/trips?year=1`, which opens Your year.
- Nothing is written until a place is picked (the old screen saved an `ideas` row on arrival). Accepted: an interrupted share is lost.
- TikTok only: `/api/share/suggest` follows the short link to the full URL (oEmbed answers far more often for it), reads the caption, asks Claude Haiku for the one place (`lib/share/caption.ts` parses), finds it with Google Find Place, and the screen shows it as the first row. Never saves on a guess. Instagram gives no caption. Quota `shareSuggest` 60/day.
- The `ideas` table stays for the record; `/ideas` redirects to `/trips`. Its screens, `PromoteToWishlistSheet`, `IdeaEmbed`, `SetLocationSheet` and `/api/embed` were deleted with it.
- Prototype agreed before the build: https://claude.ai/artifact/LbU5wJTRTRyppJimMNbtXh

## Mobile reachability trap
- `DesktopMasthead` is `hidden md:flex`. Anything whose only entry point is added there is **invisible on a phone**. This has shipped twice (the estimate entry point, then ideas). Every new destination needs a mobile door.

## Overlay-hosted screens (Overlay.tsx)
- A screen mounted inside `Overlay` must make its root a **flex item of the card** — `flex-1 min-h-0 flex flex-col` — never `h-full`. The desktop card is `h-auto max-h-[86vh]`, so a percentage height resolves to auto, the card clips at 86vh and the `flex-1 min-h-0 overflow-y-auto` body inside never gets a bound. That was the "Estimate won't scroll on desktop" bug (fixed in `a967532`). Mobile hid it because the sheet is a fixed `h-[92dvh]`.

## Map pin popup (MapPinPopup.tsx)
- **The pin card, shortened (24 Sep 2026):** no type chip; the stars row carries the category
  (tap the word to change the type) on the left and three 28px glyph discs on the right —
  directions, website, call — the card sheet's disc style. The old worded pills are gone. The
  source link is NOT a fourth disc (four wrapped the 300px card): it rides on the fold line.
  Note and recommender fold to one line + "more · from TikTok · ★ recommended by"; open, both
  are tap-to-edit as before, then "less". Mock: https://claude.ai/artifact/QJDdayfWXwDyEoDyjvPSTc
- **Half the size (24 Sep 2026, later):** no hero. A 64px photo tile beside the name opens the
  swipeable gallery above the card (`photosOpen`); ✕ folds it. Heart at the end of the name.
  "Put on a day" is a quiet 36px chip on the action row with the three 36px discs to its
  right. The empty state is one line ("Add a note"); "more" only when there is something to
  unfold. ~150px closed. **Remove (26 Sep 2026; superseded 6 Oct — now a "Remove from map" link at the bottom, see batch B below):** a 24px bin beside the ✕, always visible when
  `onCardDelete` is passed; the old "remove from map" link in the open note state is gone (he could not
  find it). Not on the action row: a restaurant already fills that 280px row with four discs.
- **Condensed on the phone, hero on desktop (24 Sep 2026, latest):** `desktop` is a
  matchMedia(min-width 768) state. Desktop always shows the swipeable photo at the top and
  no tile ("leave the big picture at the top to scroll through"); ✕ closes. Phone: 44px tile
  (no badge) matching the two text lines, `p-2.5`, action row `mt-2`, and no "Add a note"
  line on the face — a pencil disc leads the action-row discs when there is no note and
  opens the note straight into the editor (`DetailsField startEditing`). A saved note still
  shows as one line. Mock: https://claude.ai/artifact/HSbDNXLPEPcKx4RiRYV3MY
- `details.notes` and `details.recommended_by` are edited in place on the popup via `DetailsField` (tap the line; dotted link when empty). Each save merges one key and calls `onCardUpdate` so the pin restyles. The type editor behind the pencil still carries its own recommended-by input.
- A scheduled copy of a place is a separate card: `recommended_by` set on the interested card does **not** carry to the in_itinerary card, and the map shows the scheduled (filled) pin first. `scheduleCardOnDay` should copy it; until it does, set both.

## Budget (Estimate) screen
- Contingency and Paid with points are the last two rows INSIDE the Additional group
  (Brennan, 25 Sep 2026). Folded, the Additional bar carries `extraAmount` = contingency −
  points and `extraItems`, so Standard + Additional = Total on the folded screen. Tests open
  the group first (`openAdditional()`).
- The split rows are a third group, **Sharing** (25 Sep 2026): folded, `caption` = "3 of 8 are
  theirs" / "just you" and `amountText` = their share. Rows inside are "Other travellers" and
  "Their share" — the old labels were cut off at 360px. Keep row labels under ~16 characters.

## Card sheet and save sheet — click-audit conventions (Sep 2026)
- `AddToTripSheet` pre-picks type/sub_type from `place.details.types` via `lib/places/inferType` (the bulk importer's table). A miss leaves the pills unselected; never make the pill mandatory again — it was the most-taxed tap in the app.
- `CardBottomSheet` delete has **no confirm**: every host (PlanBoard, DayViewClient, FullMapClient) offers a 6-second undo through `onCardDelete`. A new host that mounts the sheet must provide undo or it gets an unrecoverable delete.
- The empty "Add a checklist" row IS gated behind "Add details" (24 Sep 2026): a card with no
  checklist shows nothing at the top; open Add details to start one. A checklist with items
  always shows first, as before.
- Notes and recommended-by are never gated behind "Add details" for the owner. The standalone notes row in the sheet hides itself when `showEmptyFields` is on so the detail component's own row doesn't duplicate it.
- The full tap-count audit and remaining batches live in memory (`roam-click-audit`).

## Unscheduling (lib/scheduleCard.ts → unscheduleCard)
- Scheduling COPIES, so "take off this day" = delete the scheduled row, after making sure an `interested` copy of the place exists on the journey (one is written if not). Callers then fire `onCardDelete(card.id)` so the host's existing 6-second undo applies. The map popup also fires `onCardCreated` for the copy it may have written, so the hollow pin appears without a reload.
- The shared `AppMenu` carried Ideas until 26 Sep 2026 (retired); on the phone only, Profile. Desktop keeps Profile/Sign out in the masthead avatar dropdown.

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
**Home currency (6 Oct 2026):** a person's money is in `homeCurrencyFor(users.home_country, passport_country)`, else CAD —
the Estimate (loadEstimate reads the viewer's row; `fx_to_cad` is really "to home"), Bookings' "What did it cost?" default,
and stay prices (SerpApi `currency`). Rates and the reference table convert to that home. Local prices keep the destination's currency.
**7 Oct 2026:** the Budget's suggested prices are CAD priors scaled by `cadToHome` (live, else the table) and written with
`homeSymbol`; distances start at `homeOriginFor(home_airport, home_country, passport)` (lib/budget/homeOrigin; YYZ/Canada = the old
Toronto point, blank = Toronto). A typed rate saves `assumptions.fxBase` (the typist's home); a row without one is CAD-based and is
carried into the viewer's home on load (`typedRateToHome`). WhereToStaySheet writes each price with its row's `currency`; the search's "Over your Estimate" flag and the accommodation basis line take `homeSymbol` too.
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

## Ideas: links play in place (RETIRED 26 Sep 2026 with Ideas; kept for history)
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
**The phone ··· menu's own z-index is inert.** It always sits inside a host that is its own
stacking context: JourneyHeader (z-30 in flow on Plan; pinned at 65 over the Map for guests) or,
for an owner on the Map, FullMapClient's `MAP_DISC` (65). The Map ladder is sheet 60 → host 65 → full-screen card 70. If the menu
hides behind something, raise the HOST, never the menu. The menu was raised to 80 twice (11 and
24 Sept) and fixed nothing either time; `lib/ui/layers.test.ts` now fails on it for both hosts.
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
- Screens hosted in `Overlay` take `variant="overlay"` +
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
- **A gallery is copied in on its first open (5 Oct 2026, speed).** `PlacePhotoGallery`
  reads `photo_cache` with the photo list and points each `<img>` straight at our
  storage copy (no `/api/places/photo` hop). If slides 1..n lack a copy it POSTs
  `/api/places/photo/warm` once: the server copies them all in parallel, writes them
  plus a `warmed` marker in ONE write, and returns the URLs. The marker makes it at
  most once per place per 30 days; the cover (index 0) is never warmed, the card's
  own request stores it. Rules in `lib/places/photoWarm.ts` (tested). While a warm is
  out, uncopied slides wait unless in view, so Google is not paid twice.
- **`photo_cache` writes are compare-and-swap** (`recordPhotos`): update only where
  the column still equals what was read, else re-read. It was read-merge-write, and
  three gallery requests at once lost each other's entries: 35 copies in the bucket
  (32 places) that the column had forgotten and that were paid for again. PostgREST
  compares jsonb by value, so `.eq("photo_cache", JSON.stringify(old))` works.
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

Do not treat this as a substitute for the local gate before pushing — it runs
after the push, so a red run means bad code is already on main. That gate is
`npm run checks`, and `.githooks/pre-push` runs it for you.

What it catches: unused imports, type errors, lint errors. What it does NOT
catch: layout and behaviour regressions, which build perfectly cleanly. The
three reverts of 2026-09-07 were all that second kind.

## A Free Supabase project pauses after seven quiet days

`.github/workflows/supabase-keepalive.yml` runs a `select ... limit 1` against
every Free project once a day, so the inactivity clock never reaches seven.

Ant Wilson's scan flagged `elevate-map` on 2026-09-02 and again on 2026-09-09.
That project is not Roam — it is the Elevate map, 16,353 customer locations and
125 technicians — and it is the one with no daily traffic to keep it warm. Roam
is in the same matrix because a travel app whose owner goes travelling is
exactly the app that stops being used for a week.

It has to be a **query**, not a ping of the domain. PostgREST reaches Postgres
to answer a select; nothing that stops at the edge counts as activity. RLS is
left alone — an empty `[]` is a good answer, because the point is that the
query ran.

The keys are **repository secrets, not inline**, and this is the one decision
worth not undoing: bdirenfeld/roam is a PUBLIC repository. Roam's own anon key
is already in the browser bundle and would cost nothing to commit, but
elevate-map's is not Roam's to publish. `SUPABASE_KEEPALIVE_KEY_ELEVATE_MAP`
and `SUPABASE_KEEPALIVE_KEY_ROAM` under Settings → Secrets and variables.

**A missing or rotated key fails the job on purpose.** The failure this guards
against is silence: a keep-alive that quietly stopped working months ago is
worse than none, because you believe you have one.

Two things end it without a word: GitHub disables scheduled workflows in a repo
with no commits for 60 days (Roam is pushed to constantly, so this is theory),
and a paused project is only recoverable from the dashboard for 90 days —
after that the data is download-only. The real fix is Pro on the org; this is
the free one.

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

## Tests: `npm test` (vitest)

`vitest.config.ts`, tests colocated as `src/**/*.test.ts`. `npm test` runs them
in about two seconds; the checks workflow runs them between lint and build.
`npm run test:watch` while working.

Four conventions, all of which have a reason:

**Write the test that would have failed before the fix.** Taken from Don's
quality-gate doc (`Downloads/codex-pre-pr-high-recall-quality-gate-v2.md` §9,
the same doc roam-ship §8's lenses came from). A test asserting a page loads
proves nothing here. The first two suites cover the two pieces of logic with
the worst history: `resolveDefaultDay` and `cardTimes`.

**Prove it fails.** Break the function on purpose, watch the test go red,
restore, watch it go green. A test that has never failed is a test you have no
reason to trust. Both suites were confirmed this way.

**Fixtures are copied out of the live database, not imagined.** The flight
fixtures are real rows. This matters more than it sounds: the flight bug
existed *because* all flights were assumed to be stored the same way, and they
are not — Australia and Costa Rica hold the landing in `start_time`, Rome and
New York hold the departure. Invented fixtures would have agreed with the
broken code. Query the table, then write the test.

**Awkward rows earn their own test.** New York's flight home stores 16:00 with
`departure_time: "4:00"`; Palm Springs stores `"TBD, around midday"`. Those are
where the loose-matching bugs live.

`describe`/`it`/`expect` are imported explicitly rather than enabled as
globals, so `next lint` needs no extra configuration. Tests run at
`TZ=America/Toronto`, pinned in the config: GitHub's runners are UTC, where
local and UTC agree and the late-at-night date case would pass either way.

No jsdom, no React testing library, deliberately. Everything covered so far is
a pure function over a row shape, and the failures worth catching are ordering,
time and column-name failures, which are cheapest to pin at that layer.


## One ordering rule: `lib/agendaOrder.ts`

A day has two readers — the owner's agenda and the read-only itinerary a guest
opens from a share link — and they must order cards identically. They did not
until 2026-09-07: the guest page had its own copy that read `start_time`
directly, so an arriving flight sat at its takeoff time. Rome day 1 showed
"Flight to Rome" fourth, between the aperitivo and dinner. New York's shared
link had it wrong too, and that one is genuinely shared.

Both now call the exported `agendaOrder`. **Never write a second copy of this
rule** — two copies is exactly how they came to disagree.

`cardTimes` takes `TimedCard`, a structural shape, not a full `Card` row: the
guest page selects a narrower projection, and casting it to `Card` would hide
precisely the sort of mismatch this is meant to catch.

**Sorting and labelling must come from the same source.** The first fix changed
only the sort, so the flight jumped correctly to the top of the day and was
then labelled with its takeoff time — sorted by landing, labelled by
departure, which reads worse than the bug it replaced. It was caught on the
live page, not in review. If a time decides an order, it must also be the time
shown.

## The schema snapshot, and refreshing it

`lib/schemaSnapshot.ts` holds the live public schema, the storage buckets, and
the foreign keys pointing at `trips`. `schemaContract.test.ts` checks every
`.select()` and `.from()` in the app against it; `deleteJourney.test.ts` checks
that nothing is orphaned when a journey goes.

**Refresh the snapshot in the same change as any migration**, not afterwards —
the SQL to regenerate each block is in the file's comments. A stale snapshot
makes the tests lie in both directions.

Why it exists: PostgREST does not throw on a wrong column name. It returns
`{ data: null, error }`, and a caller reading `data` without checking `error`
renders an empty screen rather than a failure. The guest itinerary once asked
`days` for `title` and showed a journey with no days at all.

On its first run it found two faults that had been live for weeks —
`trips.kanban_background_url` (a column that never existed) and the
`trip-covers` bucket (never created). Both are fixed; the point is that neither
had ever failed loudly.

## Storage buckets

Three: `card-attachments` (private, 10 MB, PDF + images), `place-photos`
(public, 5 MB — 30-day cache expiry is a Google terms requirement, never make
it permanent) and `trip-covers` (public, 10 MB, images incl. HEIC/HEIF because
iPhones hand those over unconverted).

Write policies on `trip-covers` are **owner or cohost**, matching the two
`trips` UPDATE policies exactly. Nothing in the app writes to it any more:
**changing a journey's cover was removed on 6 Oct 2026** (Brennan: "changing the
cover isn't needed; covers are picked from the destination" — 16 of 20 journeys
used the automatic photo and nobody had ever uploaded one). The card ⋯ menu,
the Settings hero (now a plain picture) and the dead paste-a-URL sheet in
NewJourneyForm went with `TripCoverEditModal`. Covers come only from
`/api/trips/fetch-cover` (Unsplash, lib/coverQueries); existing
`cover_image_url` values are untouched. Do not bring an editor back unless he asks.

**Deleting a journey does not delete its files.** `card_attachments` rows go by
CASCADE, but the objects stay in the bucket, and the same now applies to a
cover. 2 orphaned files, 114 bytes, as of 2026-09-07 — real but not yet worth
code. Worth revisiting if attachments get used in earnest.

## The shared page is the product, not a fallback

`/journey/[token]` renders for a visitor with no account. Brennan has almost
never seen it, because he is always signed in — and it is the page that gets
forwarded into a family group chat, so it is the one that has to work.

**Why Roam exists** (his words, Sept 2026): Costa Rica in March, everyone asking
the same questions every day, nobody with a central place to get answers. The
audience is the passenger who wants to show up and be told where to be — not a
collaborator. Do not build reciprocity into this page. It is deliberately
one-way. Guests read; they do not react, reply or edit.

He does want people to sign in eventually, so the free page answers **today's**
questions and no more: the plan, the notes, where you're staying, what you need
to enter the country. The map, Bookings, Ideas, editing and having the journey
without the link all stay behind signing in.

What it shows and why:
- **Card notes** — `details.notes`, 262 cards, ~85k characters. The answer to
  "what is this and why are we going". Markdown syntax is stripped, not
  rendered (`plainNote`): bold, headings, bullets, checkboxes are the four
  things actually typed.
- **Opens on today** via `DayHeading`, a client component. Today is decided in
  the BROWSER — a Vercel server is UTC and calls it tomorrow from 8pm Eastern —
  and the badge renders only after mount so the server and first client render
  agree. Do not move this to the server.
- **"Good to know"** — accommodation, then entry rules folded behind a
  `<details>`. Folded because measurement: open, Tuscany's seven lines ran 416px
  and pushed the first card to 902px, past the fold on a phone. Entry rules are
  read once; the plan is read daily.

**Still withheld, deliberately:** attachments (flight confirmations carry
passport and payment details), the budget, travellers' names and ages. **Booking
numbers too (7 Oct 2026, re-audit):** a hotel note carried "Expedia For TD itinerary:
7354…", which with a surname opens the booking. `lib/share/bookingNumbers`
`guestCardText` is the only door from `details` to the page — title, notes, named,
nothing else (never `details.confirmation`) — and strips confirmation / itinerary /
booking / reservation / PNR / record-locator numbers and 8+ digit runs on the server.
Its test fails if `page.tsx` reads `details` any other way. Notes and
entry rules were withheld under the same blanket rule until Sept 2026 and should
not have been — checked first: all 262 notes carry no secrets (the habit is
already "code stored separately"), and `trip_entry` holds public government
rules whose only personal column is nationality.

**To see it: Settings → "Copy link · Preview".** Preview opens `?preview=1`,
which renders the guest page for a signed-in caller and deliberately does not
claim — no `trip_members` row is written. Before this existed the only way was
an incognito window, which is why the page went unlooked-at for months.

**Measure this page before and after any change to it.** It has no session, so
the phone-popup trick does not apply — use the Claude Browser pane, which is
session-less, with `resize_window` to mobile.

## The test ratchet

`src/lib/libCoverage.test.ts`: every module under `src/lib` that exports a
function needs a sibling `.test.ts`. The 44 that predate it are listed as
GRANDFATHERED. A new module cannot join that list by accident — you have to open
the file and type its name, which makes it a decision rather than an oversight.
Writing a test for something on the list fails a second check until you delete
its line, so the list only shrinks.

**Its companion rule: pure logic goes in `src/lib`, not inside a component.**
`plainNote` was written inside `SharedItinerary.tsx`, where the ratchet could
never have seen it. Extracting it is what makes the guard reachable.

Why it exists: the suite was written on 2026-09-07 on the rule "write the test
that would have failed before the fix", and four changes shipped the same
afternoon with no tests, including two new pure functions. The rule was fine;
nothing was enforcing it. Also in roam-ship §4b.

## Where to stay (Sept 2026)

The menu row (owner only) links to `/trips/[id]/map?stays=1`; `FullMapClient` reads the
query, opens `WhereToStaySheet` (a half sheet, `z-[60]`, 46dvh / 88dvh on the handle) and
draws the candidates as lettered pins with `makePinElement(…, { label })` beside the
journey's own pins. No rings, no shading — the cluster is the recommendation.

**Data:** `stay_briefs` (one per journey, the last run: `brief` jsonb + `area_text` +
`split_text`) and `stay_candidates` (lettered rows; `status` candidate | saved | chosen |
rejected; `reject_reason` too_far | too_dear | not_our_look | doesnt_fit; `drive` jsonb
`{ hours, line, minutes }`). Both CASCADE on trips and are in `schemaSnapshot`.

**Pure logic in `lib/stays`** (all tested against the Tuscany journey's real pins):
- `brief.ts` — evening pins (≥17:00) set the radius (15 min); day-trip pins set the side;
  the airport is its own anchor; stay days = days with nothing placed before 16:00; fit is
  a floor from `party_ages` (bedrooms = ⌈adults/2⌉ + ⌈kids/2⌉, baths = ⌈total/3⌉); a
  day-trip cluster on 2+ days ≥50 km from the evening centre is a split candidate.
- `drive.ts` — return hours × days visited; `driveLine`; `driveDelta` (≥1 h only).
- `price.ts` — nightly from a total; scores carry the site's scale (Vrbo /10, Airbnb /5).
- `text.ts` — the three sentences and the review tells. No label introduces a line.

**Routes** (`app/api/stays`, all behind `requireUser` + quota): `search` (saved stays +
Google lodging near the evening centre + Distance Matrix + review tells; re-runs carry
saved/chosen rows forward and never re-propose a rejected place; `too_far` tightens the
radius); `choose` (check-in 15:00 on day 1, check-out 10:00 on the last day, other stays
on those days set to `cut`, `trips.accommodation_*`, the Estimate's `nightlyRate` when a
price exists; `DELETE` with the returned payload undoes all of it, including a place it
created); `mark` (save → an ordinary interested card; reject → status + reason).

**Every journey, not one.** `lib/stays/journeys.test.ts` runs the brief over
`lib/stays/fixtures/journeys.json` — every journey's placed pins, archived ones too —
and asserts what a person would laugh at (an anchor in another country, a street name
as a town, an airport that is the home airport). The first tap on Japan after a
Tuscany-only verification read "Kagoshima 21 h 44 · adds 13 hours of driving"; the
fixture pull also found Australia's and Costa Rica's airports stored as
`flight_arrival`. Refresh the fixture when journeys change (roam-ship §3 has the pull).

**Limits, by design:** no sign-in to any listing site (Brennan). Google candidates have
rating, reviews, drives and review tells but no beds/baths/pool/AC/price — the sheet
shows the party's floor ("Needs 4 bedrooms and 3 baths") instead. A candidate with a
`total` (from a listing) is what the price line and the Estimate hook wait for.

**The phone map filter stays pills (10 Sept 2026).** A short Filter sheet with
sub-type rows and counts was built and reverted the same morning (80b90c5 →
0184ffc). Brennan: "I like the filter the way it is right now, on top of the map
and not taking up any space… that level of detail is the kind of thing you do on
your desktop." What was actually wrong was the tap: pressing Food removed the
food instead of showing it. The pills now NARROW — everything showing → tap Food
→ only food; tap Activity too → both; tap the last one selected → everything
back — and the collapsed button carries a sienna count when the map is narrowed.
Do not rebuild the sheet, or put sub-type filtering on the phone, unless he asks
for it by name. Sub-types stay on the desktop sidebar.

### Links out of a stay card (Sept 2026)

`src/lib/stays/bookingUrl.ts` fills the journey's dates and party into a
listing link before it opens. Two traps behind it, both found by loading the
URL rather than reasoning about it:

- **Google Travel ignores dates.** `google.com/travel/search?q=…&checkin=…&checkout=…`
  loads, looks right, and shows *tonight for two people*. It is the obvious
  choice and it is wrong. The price fallback is Booking.com's
  `searchresults.html`, which honours `checkin`/`checkout`/`group_adults`/
  `group_children` and one repeated `age` per child.
- **A host we do not recognise keeps its URL untouched.** A wrong parameter is
  worse than none: it silently changes what the page shows.

A stay row can have no price for two different reasons, and the card says
which — a place that was never on a booking list (his saved villas, anything
off the map) versus a listing with no rate for those nights. Never show a
blank where a price would go.

### Must-haves on a stay search (Sept 2026)

One optional free-text line next to Run again, never a gate before the first
search. `src/lib/stays/wants.ts` reads it: words a listing can actually answer
(`pool`, `ac`) become must-haves, and the whole line is folded into the search
text so the results lean the right way.

**Three states, not two.** A pool is confirmed present, confirmed absent, or
not listed. Only *confirmed absent* is dropped. "Not listed" keeps its place
and the row carries a "Pool not listed" flag — treating it as a failure would
empty a list like Tuscany's, where no row carries amenity data at all. Amenities
come from SerpApi only; rows from Google Places or his own saved stays have none.

The line is stored on `stay_briefs.brief.wants` (JSON, no migration) so Run
again never makes him retype it.

### Rendering tests (Sept 2026)

`vitest.config.ts` once said "no jsdom and no React testing library ... the
bugs this suite exists to catch were never rendering bugs". That was wrong.
On 11 Sept Brennan found four faults in a row by opening the app while 228
green tests said nothing: a render loop that fought the map's pinch, a touch
and a click both firing so the sheet would not pull down, a blank white list
while a base searched, and one base showing another's copy.

**Every test lived in `src/lib` and called a pure function.** The suite could
not render, click, or run a route. Two things came out of it:

- **Logic that decides what the user sees belongs in `src/lib`, not inside a
  route handler.** "Which offers become rows" sat as a filter chain inside a
  450-line route and nothing could call it — which is how a villa sleeping six
  reached a list for seven. It is `lib/stays/pickOffers.ts` now, and its
  `dropReason()` names the rule that fired so a test can assert *why*.
- **A `*.test.tsx` with `// @vitest-environment jsdom` renders for real.**
  `src/components/map/WhereToStaySheet.test.tsx` is the pattern: mock
  `@/lib/supabase/client`, `useToast` and any child sheet, then drive it with
  `userEvent`.

Two traps. Testing Library only auto-cleans when the framework's globals are
on, and this repo imports `describe`/`it`/`expect` explicitly — without the
`afterEach(cleanup)` in `src/test/setup.ts` every test leaves its render
mounted and the next one fails with "found multiple elements" on a component
that is fine. And jsdom costs ~65s of startup on the first rendering file.

**Still uncovered: the map.** Mapbox does not run in jsdom.

### Tests that go looking (Sept 2026)

Two suites invent the case instead of waiting to be shown one. Add to them
rather than only writing a regression test after Brennan finds something.

- **`src/lib/stays/invariants.test.ts`** generates 2,000 journeys from a seeded
  PRNG — parties of 1–9, trips of one night to two months, pins from one street
  to a continent, scheduled and not — and asserts what can never be false: base
  nights sum to the journey's, no anchor weighted zero, no label starting with a
  digit, a price window exactly as long as the trip, and no sentence containing
  `undefined`, `NaN` or "0 days". **It also asserts what it explored** (how many
  multi-base, how many big parties, how many long trips) so weakening the
  generator fails the test rather than quietly making it decoration. A seed
  replays a failure exactly.
- **`src/components/map/WhereToStaySheet.sweep.test.tsx`** renders the sheet in
  twelve states and checks four screen-level rules: nothing reads `undefined`,
  no two visible rows share a letter, every button has an accessible name, and a
  price always matches the nights beside it.

The sweep earned its place immediately: it found that a SINGLE-base journey took
its night count from the trip's dates rather than the base's. Identical in
normal use, divergent the moment a journey's dates are edited after a search —
"for 13 nights" beside a price quoted for 11.

## Rules that are prose here and a test there (`lib/houseRules.test.ts`)

A rule written only in this file is remembered when somebody happens to read
that paragraph, which is not the same as always. Three of the rules above are
also assertions now, each naming the failure that bought it:

- **`void` on a Supabase builder** — no `void` in front of a chain containing
  `.from(` or `.rpc(`, because that sends no request at all.
- **One ordering rule** — exactly one `agendaOrder`, and no other comparator
  that reads `start_time`.
- **Overlay-hosted screens** — a screen that takes `variant="overlay"` never
  puts `h-full` in a className that also carries `flex-col` or `min-h-0`.

The third one was not decoration: it found **four live violations** the day it
was written — `ProfileForm`, `NewJourneyForm`, `TripSettingsClient` and the
settings loading frame all sized their overlay root `flex flex-col h-full
min-h-0`, the exact spelling the Estimate was fixed away from in `a967532`.
Latent on a phone (the card's 92dvh is a real height, so both spellings
resolve the same) and live on a desktop.

**When you would add a rule to this file, ask first whether it can be an
assertion.** Ship the guard; leave one sentence here pointing at it. This file
went from 1,381 words to 10,368 in a month, and a rule nobody can run is the
cheapest kind to write and the most expensive kind to rely on.

Discovery is by token, not by a hand-kept list — any file mentioning
`variant="overlay"` is an overlay-hosted screen — so a new screen is covered
the day it is written. A guard that needs a list to be updated is a guard that
goes stale in the same way the prose did.

## `npm test` is green and `tsc --noEmit` is not the same question

`src/lib/ui/layers.test.ts` shipped on 11 Sept spreading `matchAll`, which this
project cannot compile: no `target` is set, so TypeScript uses ES5 and refuses
to iterate the iterator `matchAll` returns. Vitest transpiles with esbuild,
which does not care, so all 375 tests passed while the Checks workflow went red
on `tsc --noEmit` and stayed red for a day.

Run **all three** before pushing — `npx tsc --noEmit`, `npm test`, `npm run
build`. Any one of them passing says nothing about the other two.

## Looking at the phone without the phone (`npm run shot`)

`scripts/shot.mjs` opens a real Chromium at **390×844 with touch** and writes a
PNG, so a mobile layout can be looked at before it is pushed rather than after
Brennan finds it.

```
npm run shot -- /trips/<id>/days/<dayId>        # phone, the default
npm run shot -- /trips/<id>/plan --wide         # 1280, the same question again
npm run shot -- https://…/journey/<token>       # no session needed
npm run shot -- /trips --full                   # whole document, not the fold
```

It prints the three numbers that catch what this repo actually ships: viewport
width, document width × height, and HTTP status. **A document wider than the
viewport at 390px is always a bug**, and a document far taller than its content
is the escaped-Mapbox-marker signature from `bc5f376`.

**The session.** Most of the app is behind Google sign-in and a script cannot
do an OAuth dance, so sign in once: `npm run shot:login` opens a headed browser,
waits for you to land inside the app, and saves the cookies to `.auth/roam.json`
(git-ignored). Every later shot reuses it. A remote container has no browser to
sign in with — public pages still work there, the signed-in app does not.

**Playwright is deliberately not in `package.json`.** `npm ci` in the checks
workflow would pull a browser on every run, and that workflow's value is that it
finishes in under two minutes. It is a local tool: `npm i -D playwright &&
npx playwright install chromium`. Claude Code's containers ship one globally and
the script finds it.

**Two things it cannot do**, and saying so is the point of writing it down:
press-and-hold is still Brennan's thumb, and a container that blocks
fonts.googleapis.com renders in fallback faces — the script detects that and
says the type is not the real type, because otherwise the hydration error it
causes gets diagnosed as a bug in the page. It also does not replace `document.
visibilityState`: Mapbox paints nothing in a hidden tab, and a headless shot is
not a hidden tab, but a screenshot of a map still deserves the same suspicion.

This does not make a mobile change verified. It makes it *looked at*, which is
the step that was missing.

## The enrichment call needs a session, not a key (`npm run import:places`)

`/api/places/bulk-import` authenticates with the cookie-based SSR client, so
the trip-import skill's standing instruction is to have Brennan paste a `fetch`
into his browser console. That is where the pipeline stops — on 3 Sept a Palm
Springs import reached "42 places need enrichment via app endpoint; awaiting
user console paste" and never finished. It was not blocked on a decision. It
was blocked on a person being at a desktop with the right tab open.

```
npm run import:places -- ChIJaaa ChIJbbb
npm run import:places -- --file=ids.txt --type=activity --subtype=guided
```

It opens the app with the session `npm run shot:login` already saved and makes
the same fetch the console would have, from the app's own origin: same cookies,
same RLS, same quota, same 401 when it expires. It batches at the route's hard
cap of 50, prints each row as `+` (new) or `=` (already had a row), names the
reason for every failure, and writes the `place_id`s to
`.shots/imported-places.json` because that is what the SQL step needs next.
Re-running is safe — an existing row costs no Google lookup.

**A shared secret was the other way to do this, and it is the wrong way.** An
env-var API key mapped to a user id would work headlessly in a container, which
is genuinely more than this can do. It would also be a second authentication
path into a spending route, in a public repository, that no other part of the
app has — permanently, to save a login that lasts weeks. The session was always
the right credential; it just needed something other than a human to carry it.

The skill still says "there is no service-key path — do not try to fake one",
which remains true, and should now add: **there is a session path, and it is
`npm run import:places`.** That text lives in the account's synced skills, not
in this repo, so it has to be edited there.

## The checks are a gate now, and a red main says so (`npm run checks`)

Two changes, both bought by the same episode: main went red on 11 Sept and
stayed red for **nine commits**, and nobody noticed.

**`npm run checks` runs all four steps and does not stop at the first
failure.** Type check, lint, tests, build — about 90 seconds, or
`npm run checks -- --fast` for the first three in thirty. GitHub stops a job at
its first failing step, which is what hid the real picture: the type check
failed on one line of `layers.test.ts`, so lint, tests and build never ran, on
that push or the eight after it. The app was building perfectly the whole time
and nothing said so. **Which steps PASSED is the useful half of a red run** — a
lone type-check failure in a test file is a small fix, not an outage.

`.githooks/pre-push` runs it before the push rather than after. It is versioned
in the repo and `npm install` points git at it (the `prepare` script sets
`core.hooksPath`), so a fresh clone has it. `git push --no-verify` skips it, and
that should feel deliberate.

**The workflow now reports every step and gates at the end** (`Verdict`), so one
red run names everything that is wrong at once.

**A red main opens an issue, and a green main closes it.** One issue, labelled
`ci-red`, assigned to the owner; a run that is still red comments on it rather
than opening a second. An issue sends an email and shows on the repo, neither
of which needs anyone to think of opening the Actions tab. The step is
`continue-on-error` on purpose — **a notifier that cannot post must never turn a
green run red**, which is the disease, not the cure. If the token cannot reach
issues it says so in the job summary instead.

**The alarm's own first version failed silently**, which is the lesson twice
over: its heredoc terminator sat indented, and a heredoc terminator has to be
at column 0 — inside a YAML block scalar it cannot be. The script died on a
syntax error, and because the step is `continue-on-error` the job reported
SUCCESS. Caught by reading the log, not the tick. Two things came out of it: a
second step raises a `::warning::` annotation when the notifier does not
succeed, and `houseRules.test.ts` now runs `bash -n` over every `run:` block in
every workflow. Nothing else runs a workflow's shell until it is pushed, so
that one second of parsing is the only check it ever gets.

The deeper point, worth keeping: **a check that is red every time is not a
check.** A real breakage then looks identical to the noise you have already
learned to scroll past. Red-after-green is a signal; red-after-red means the
alarm itself needs fixing first.

### The journey already knows where you sleep (15 Sept 2026)

`lib/stays/ownStays.ts` holds two decisions the search route used to get wrong
about places Brennan saved himself, both found by reading the live rows rather
than the code:

- **`bookedStay()`** — a stay-type place scheduled on a day (`in_itinerary`),
  or the one `trips.accommodation_name` names, is the journey's stay. The
  search writes it `chosen`, exempts it from every cull and never marks it
  seen. Five of nine journeys had their real stay sitting as an unpriced
  candidate, and two (Montecito Inn, Villa Bottino) had been pushed to
  "seen". A saved idea that merely holds a `day_id` is NOT booked — Japan's
  31 pins all hold day one.
- **`pickSaved()`** — his own places take at most `MAX_SAVED_ROWS` (2) rows:
  chosen and hearted always, then the nearest to the base. Tokyo had four
  saved hotels, which left the search one slot forever and none of the four
  priced. And a place merely *saved* now goes through the drive rules like
  any other; only chosen and hearted are exempt.

`lib/stays/stayRows.test.ts` runs both over `fixtures/stayRows.json` — every
journey's `stay_candidates` plus the stay-type places on its itinerary, pulled
from the live database. Pull it again when journeys change; the query is in
the `roam-stay-audit-2` memory. Same lesson as roam-ship §10: the list, not
the rule.

**Windows checkout trap:** `scripts/import-places.mjs` starts with a shebang,
and git converts it to CRLF on Windows; esbuild then cannot strip it and
`importIds.test.ts` fails with "Invalid or unexpected token" here while the
Linux CI is green. Fixed 26 Sept 2026: `.gitattributes` now has `*.mjs text
eol=lf`. An old checkout keeps its CRLF copy until the file is checked out
again (`rm` it, `git checkout -- <file>`); `git ls-files --eol '*.mjs'` should
say `w/lf` for every one.

### Paste a listing, and how wide the search looks (15 Sept 2026)

Brennan: "how do we get the API to search all the listings" — he thought it
was built. What is built: SerpApi Google Hotels, both inventories (hotels and
vacation rentals, which is where Vrbo / Booking homes come from). What no API
reaches: Airbnb (no API, not on Google), anything outside Google's top results
for the place, and any calendar a host has not opened. Two answers shipped:

- **Pages.** Google returns ~18 a page; the search read one. `inventoriesFor()`
  now says how many pages each inventory gets (`PAGES_WANTED` 3 for the kind
  the journey wants, `PAGES_OTHER` 1) — four SerpApi credits a run instead of
  two, deduped on the name. Probed on Lucca: 18 + 18 + 18, all priced.
- **`POST /api/stays/add`** — paste a link. `lib/stays/pasted.ts` cleans the
  URL, names the site, reads a name out of a page title and parses the price
  he typed. The page is fetched best-effort for `og:title` (4 s): **Vrbo
  answers with a title and a photo and no coordinates; Booking returns a bot
  wall; Airbnb a 3 KB shell** (probed 15 Sept 2026) — so Google Places
  `findplacefromtext`, biased 60 km around the base, is what locates it, and
  the price is whatever he saw on the site. The row arrives `feel: "up"` so
  every later run keeps it and no cull touches it. `DELETE` with the id is
  the undo. `freeLetter` lives in `_shared.ts` now (mark and add share it).

### Nights per base, and "seen" is history not a filter (15 Sept 2026)

- **`trips.stay_nights`** (migration 012) is his split by base label,
  `{"Tokyo": 5}`; `applyNightsByBase()` in `lib/stays/brief.ts` lays it over
  the pin-count guess so the nights always sum to the journey's. Set from the
  steppers under the base switcher (`PATCH /api/stays/nights`); the sheet then
  re-runs EVERY base, because the remainder moved too. **Any new column must
  also go in `lib/schemaSnapshot.ts`** or `schemaContract.test.ts` goes red.
- **A place shown before is no longer skipped.** Only `rejected` keeps a place
  off the list; `seen` rows survive as history under "N earlier" and any old
  seen row for a place back on the list is deleted so it is not listed twice.
  `fillOffers` ranks: priced first, then the wanted kind, then score × log
  reviews — novelty moves nothing. `spentByBase` is always false now; the
  "nothing new" confirm in the sheet is dead code awaiting removal.

### The stay card: one decision (15 Sept 2026)

Mock approved, copy his: **"Stay here"**, chosen reads **"Staying here ✓"**, the
way back is **"Not here"**. There is no Save button any more — the heart is
"keep it": `mark` action `heart` on a candidate row now also creates the place
and an `interested` card (what Save wrote) and sets the row `saved`; un-hearting
takes nothing off the map. `mark` action `unchoose` is the way back from Choose
however long ago it was chosen: deletes that place's `details.stay` cards,
clears `trips.accommodation_name` if this stay gave it, drops
`basis.accommodation` when no chosen row is left, keeps the row `saved` +
hearted. The list row is unchanged (heart and ✕ only); the decision lives on
the card. Do not re-add a Save button or a second Choose door.

### The Essentialism pass (15 Sept 2026)

Brennan's lens, from McKeown: what is the one thing a screen is for, and how
many things stand between the person and it? The Where-to-stay sheet had
ELEVEN before the first row and he called it cluttered in two seconds. Now
four: title, tabs, rows, one footer line. What went, and where:
- The area paragraph is gone. Only a sentence ending "your call" survives
  (`lib/stays/sheetCopy.ts` → `decisionLine`). The rest was said on the tab
  or the card's price line already. Do not bring the paragraph back.
- The nights line is gone; nights ride in the terms line and are set behind
  "Change" alongside the must-haves and the budget.
- The row has only the ✕. The heart lives on the card.
- Paste a listing · N earlier · Start over sit behind one "More ⋯".
- A saved row with no price reads "No price on hand." — general; the earlier
  ruling stands that we never claim a place is unlisted.
roam-ship §3b now carries this as lens 9, with the count as the score.

### Reverted 15 Sept 2026: the day-view fold, and the card sheet's ⋯ move

Built and reverted the same day. The day map folded to a pill on the strip
(numerals only while it showed) and the card sheet's Attachments / Link-place
icons moved under ⋯. Brennan on his phone: with the map folded "it's kind of
hard to know what's important… there's no contrast between anything"; the
menu mid-sheet was "very confusing"; and then: "I'm wondering if all these
changes are necessary at all… revert." The day map is always on; the card
sheet's glyph row is at the top with all its icons. **Do not re-propose a
folding day map, an Outlook-style day grid or bar, or moving the card
sheet's icons unless he names it.** What stayed from that afternoon: a tap
on a Plan card's photo opens the card; the board's hover trash is hidden on a
phone; photo dots cap at five, guarded by `PlacePhotoGallery.test.tsx`.

The lesson is in roam-ship §3b lens 9: a control is removable only if its
job has another door on the phone, and a component edit ships with a
rendering test. The Essential lens still stands for the stay screens, where
it worked.

## The Budget screen splits between two households (19 Sep 2026)

It is called **Budget** now, not Estimate — "estimate" reads as a guess and this
screen is the plan for the money. Only the user-facing strings changed; the route
is still `/trips/[tripId]/estimate` so existing links keep working. If you rename
the route later, redirect the old one.

**Every `EstimateLine` declares a `share` basis** — `person`, `shared` or `ours`.
It is a required field, so a tenth line cannot be added without classifying it,
which is deliberate. Current assignment: flights, groceries, restaurants,
excursions and tourist tax are `person`; accommodation and car hire are `shared`;
dog boarding and gifts are `ours`. Groceries and restaurants are modelled `× days`
and `× meals` rather than `× people`, so calling them per-person is a judgement —
it says the guests eat their headcount's worth. Say so if it is ever questioned.

**The invariant `split.us + split.guests === total` is the whole point** and is
tested over nine permutations in `src/lib/budget/model.test.ts`. Contingency and
points are apportioned by each household's share of the base, not evenly, which
is what keeps it exact. Two figures that do not add up to the number above them
are worse than no split at all — do not "simplify" this into even halves.

`guestPeople > 0` is the switch. There is no separate tick and `Estimate.split`
is `undefined` otherwise, so every solo journey renders the screen it always had.
`guestPeople` counts **within** `people` — a party of 7 with 2 guests means 5 of
your own — which is why the field's suffix reads "of 7".

A guard worth keeping: `splitTotals` forces the guests' percentage to zero when
`guestPeople` is zero. Without it a leftover 33% kept charging a household that
was not coming. The test caught it; it was not caught by reading the code.

**Archiving a card does not change `cards.status`.** It stays `in_itinerary`, so any query that
filters only on status still sees it. The Budget loader had this bug and kept charging for two
dropped days. If you write a query that sums or counts cards, filter `.not("archived","is",true)`
as well — and `archived` is null on older rows, so test for "not true", never `.eq(false)`.

## Who a journey was shared with (19 Sep 2026)

`trip_members` only records people who **joined** — `user_id` is NOT NULL, so someone emailed a link
who never signed in left no trace. That is why Brennan kept re-sending to the same people.

`trip_invites` (trip_id, email, invited_by, created_at, accepted_at, accepted_user_id) fills the gap.
Written by `/api/share/send-invite` **after** Resend accepts, never before — the list means "who I
emailed", not "who I typed". Unique on `(trip_id, lower(email))`, so re-sending touches one row.
Stamped `accepted_at` in the claim path on `/journey/[token]`, matched on email address.

**A link copied by hand is deliberately invisible.** Brennan's call: only sends from inside Roam are
tracked. If someone signs in with a different address than the one you wrote to, their invite stays
"Sent" — you cannot tell those apart, and a false "Joined" is worse than an unresolved row.

## Archiving a card does not change its status

`cards.archived = true` is the soft delete. It leaves `cards.status` at
`in_itinerary`, so **any read that filters on `status` alone will keep showing
cards the traveller has removed.** On 19 Sep 2026 Brennan deleted the Carrara
quarry day from Tuscany three times and it came back every time; the writes were
always correct, and the Agenda, Plan and Map queries simply never honoured them.

- Guard every display read with `.not("archived", "is", true)`.
- **Not `.eq("archived", false)`** — cards created before the column existed have
  `archived = null`, and PostgREST's `eq` drops nulls, which silently hides real
  cards instead.
- `src/lib/data/archivedReads.test.ts` enforces this: it asserts each display
  file has as many archived guards as it has `from("cards")` reads, and names the
  offending file when it fails. Add new display surfaces to its list.
- Still unguarded on purpose: the ~40 `from("cards")` calls in `src/app/api/*`,
  the assistant and the stays logic. Those are writes and id lookups, not display
  reads. If you make one of them render something, guard it.

**A place he saved and a place he scheduled are two different rows.** The save is
`status = 'interested'`, `ai_generated = false`, `day_id = null`; the scheduled
copy is `status = 'in_itinerary'`, `ai_generated = true`. Archiving the schedule
is meant to leave the save alone, so a pin correctly stays on the Map after the
card disappears from the Agenda. Do not "fix" that.

**Testing the Map in a driven Chrome tab:** a blank grey pane usually is not a
regression. `document.visibilityState` is `hidden` in a backgrounded tab, which
throttles rAF so Mapbox never paints, and `.mapboxgl-marker` count reads 0.
Check `canvas.mapboxgl-canvas` exists with a non-zero width first — if it does,
the component mounted and you are looking at throttling, not a broken map.

## The adoption audit fixes (23 Sep 2026)

- **Your year is Brennan's alone.** `lib/household.ts` → `isHouseholdOwner(userId)`. The family
  birthdays (`lib/yearView/familyDates.ts`) are imported ONLY by the server page and passed to
  `YearView` as a prop — a client component ships whatever it imports to every browser.
  `household.test.ts` fails if YearView value-imports them again. The date picker's school chips
  are owner-only too. When this becomes per-person, replace the one switch.
- **Revoke is not "everyone loses access".** It nulls the link; joined guests keep the journey
  (membership is access). Settings keeps showing them after a revoke so they can be removed.
  Copy lives in `lib/shareCopy.ts`.
- **Never `upsert(..., { onConflict: "trip_id,email" })` on `trip_invites`.** Its unique index is on
  `lower(email)`, which a column list can't name → 42P10 on every write, swallowed; the table was
  empty 19–23 Sep. The route now selects, then updates or inserts, and reads the error.
- **The shared page stays "super, super simple"** (Brennan, same day): day, start time, place,
  address, the card note. Meeting-point / bring / prep lines and end times were shipped and CUT the
  same day — do not re-add them; anything that matters goes in the card note. It keeps
  "Tonight: <hotel>" per day from
  hotel cards (`tonightByDay`: carried forward, none on the last day, trip accommodation only as a
  fallback), opens today (before the trip: day 1), shows empty days as free days, allows zoom, and
  unfurls with the journey's title and dates. A dead token → `InvitationUnavailable`.
- **No saved count on the day** ("· 12 saved" was shipped and cut: "what if you have 50?"). A number
  says a pile exists, not what is in it. The answer he is weighing is the Left to place list.
- **One verb: "Put on a day"** (pin, card sheet, save sheet). Don't reintroduce Add to day / Assign.
- **The journey menu is five rows for the owner**: Budget, Notes, Bookings, Where to stay,
  Share & settings (Ideas retired 26 Sep 2026). Guests: Notes, Bookings. `AppMenu.test.tsx` pins both lists.
- The Map has one search for owners (the place search); the header glyph stays for guests only.
- Render tests that load `@phosphor-icons/react` under jsdom hang for minutes — mock the icons.
- **Budget and Settings save as you go** (no Save button, 23 Sep 2026). A debounced effect
  (700 ms) writes after edits stop; the × / back path flushes what is pending first; an unmount
  cleanup sends anything still waiting when the overlay is closed from outside (Escape, swipe).
  Don't bring a Save button back — × used to discard every edit silently. Settings' day
  writes are now checked; a refused shortening puts the dates back. Tests:
  `EstimateClient.test.tsx`, `TripSettingsClient.test.tsx`.

## The phone has NO bottom bar; the Map has no day strip (24 Sep 2026)

- `BottomNav` is deleted. Inside a journey the phone has two screens, Agenda
  and Map. The door from Agenda to Map is the map-glyph disc top-right of the
  day map (`DayMap`, `mapHref`) — it REPLACED the ⤢. The full-screen day map is
  reached only by tapping a stacked pin; the disc collapses it while expanded;
  the door back is the Map's ‹ arrow. Rule for map chrome: right edge = discs
  and Mapbox marks (⤢, map, zoom, locate, ⓘ, wordmark); left edge = labelled
  chips (Filter). Glyph-only means disc, labelled means chip, and a control
  never crosses to the other edge. Nothing is pinned to the bottom of the
  viewport any more, so no `pb-20` allowances either. The Plan board is a
  desktop screen; `/plan` still resolves on a phone but has no door there.
- The Map has NO day strip. One shipped on 24 Sep 2026 (tap a day, its pins
  in ink, the rest faded) and Brennan had it removed the same day: "they're
  unnecessary and don't solve a problem." Do not re-propose a day filter on
  the Map unless he names it.
- Mapbox rewrites the marker WRAPPER's `style.opacity` on every move (its
  occlusion feature). Fade or tint the inner disc, never the wrapper.
- The two mockups behind this: v1 (map panel beside the board)
  https://claude.ai/artifact/DE5bmYwsecEX2JKED1yiDv and v2 (map as the board,
  routes with drive time) https://claude.ai/artifact/9AMo3rmPwd9toZbHG65d5h —
  both held; he chose the smallest change first.

## Phone Agenda, quieted (24 Sep 2026)
- No day name under the date on the phone header; that line is the weather. The desktop day
  header keeps the name (it has no weather line). `shownTitle` still feeds the desktop.
- No "1h free · add" rows on the phone (`GapRow` is `hidden md:flex`); the desktop keeps them
  as its add-at-this-time door. Adding on the phone is "Add a place" and the map.
- Header, date strip and day map are all pinned on the phone; the list scrolls under them.
  Checked live at 375px on 24 Sep 2026 — do not "fix" the map scrolling away, it doesn't.
- Mock this was built from: https://claude.ai/artifact/YEkKdrg5in6CxA1S46waju

## The desktop Plan is a week (24 Sep 2026, phase 1)
- `/plan` renders `PlanSwitch`: `WeekBoard` at md+, the old `PlanBoard` below md (only one is
  mounted; PlanBoard is 2,500 lines with its own effects). Days across, hours 7am–11pm down,
  48px an hour, every timed card a block; untimed cards in the Anytime lane above the grid.
- Geometry is `lib/week/layout.ts` (lanes for overlaps, 15-min snap, no-end = 45px dashed,
  30-min minimum on resize) and is tested against Rome's real times. Keep rules there.
- Drag sideways = day, up/down = time (duration kept), bottom edge = end time, drop in the
  lane = time removed, click = the card sheet. Every write is `queuedUpdate` on `cards`
  {day_id, start_time, end_time} with the app's one toast and Undo. Flights: the block reads
  through `cardTimes` (arrivals swap start/end) but a move writes raw `start_time`; leave
  flights where they are or fix that first.
- Phase 2 (24 Sep 2026): `WeekMap` sits to the right from lg (380px, 440px at xl), one
  Mapbox map with the Map tab's pins (filled = on a day, hollow = saved). The plan page also
  loads the saved pile (status interested, no day, has a place). Hover a block → its pin
  scales up (on the INNER disc; Mapbox rewrites the wrapper's opacity/transform); click a day
  header → the other days' pins fade to 0.22 and the header tints; click a pin → the Map
  tab's `MapPinPopup` with the same callbacks. "Put on a day" from a pin inserts a new
  scheduled card and leaves the saved one, exactly as on the Map tab. WeekMap iterates its
  Map with forEach: for-of over a Map fails the build (no downlevelIteration).
- Drags (24 Sep 2026): press a pin and move → `onPinDragStart` hands the card to the board's
  drag machinery as kind `fromMap` (the map parks `dragPan` until pointerup; no
  preventDefault or the pin's click dies). Drop on the grid = `scheduleCardOnDay` with an
  hour-long block (Anytime lane = no times); the saved pin stays; Undo deletes the new card.
  Drag a block over the map panel → `hot` tint; drop = `unscheduleCard` (Map tab's), Undo
  re-inserts the scheduled card and deletes the created saved one. The ghost lookups
  (`byId`, the untimed source) include the saved pile or a map card's ghost renders nothing.
- The disc top-left of the map (`onToggleWide`) widens the map to the page and folds the
  week away; a ResizeObserver calls `map.resize()` so the canvas follows its box.
- The Map tab is folded into Plan on desktop (25 Sep 2026): `DesktopMasthead` hides it for
  owners (guests keep it; they have no Plan). The week's map carries the search pill
  (`PlaceSearch positionClassName`), the add-a-place sheet through `lookupPlace` (shared with
  FullMapClient, which is now a thin wrapper around it) and the phone-style Filter pill. The
  widen disc sits top-right; the zoom stack moved to the bottom-right to free the top row.
- Seven days at a time (25 Sep 2026): `shown = days.slice(weekStart, +7)`; the drag maths
  and layout run over `shown`, the sheets and the map still get every day. Two arrows sit in
  the cell above the hours only when the journey has more than seven days. Mock (the
  rejected stepper row and mini month): https://claude.ai/artifact/RJPUY24bUs9CcWLn3ikaVc
- The seam drags (25 Sep 2026): `mapWidth` state, MAP_MIN 300, the week keeps COL_FLOOR
  120 a column; remembered in localStorage `roam.week.mapWidth`. A 10px grip, ink while held.
- Arranging (25 Sep 2026): `lib/week/arrange.ts` (tested) gives places times by rules —
  meals into slots (coffee 9, lunch 12:30, dinner 19:30, bar 20:45, second of a kind takes
  the next slot), sights in nearest-neighbour order from an anchor with walking time
  (80 m/min, 5–30), existing timed blocks as obstacles, 15-min snaps. Two doors: on the
  WIDE map a Select disc (box-drag or tap; pins ring, others fade; a tray of day chips), and
  a "…" on a day header's hover with "Arrange this day" (only timeless blocks get times).
  Anchor = the day's first timed place, else its first place, else the destination; a
  stay with a pin should go first when there is one. Undo reverses every write.
- A day header click also fits the map to that day (fitBounds, or a zoom for one pin) and
  the second click fits the journey back (25 Sep 2026).
- A chip with the name rides with the pointer while a pin heads for the week or a block
  heads for the map (`dragChip`); it hands over to the ghost block on the grid. Without it
  the drag was invisible between the two (Brennan, 25 Sep 2026).
- Blocks resize from both edges: the top edge is `resizedStart` (never within 30 min of
  the end, never before 7am).
- The masthead's Agenda / Plan is one segmented control with a measured sliding thumb, not
  two pills (25 Sep 2026).
- Filter's sub-type row (25 Sep 2026): once ONE category is chosen, that group's rows from
  `MapSidebar.GROUPS` (now exported) appear as pills with counts; `rowsOff` hides a row's
  sub-types. Rows with no pins are not shown.
- Plan first (25 Sep 2026): a click on an empty hour (the column itself or an hour line,
  `data-hourline`) opens a dashed draft block with "What's the plan?"; Enter creates a
  place-less card there (`scheduleCardOnDay placeId null, details.title`), an hour long, with
  Undo. A finished drag sets `justDraggedRef` so its click does not open a draft. The
  place is linked later from the card sheet's link-a-place.
- Where to stay on the Plan (25 Sep 2026): the desktop menu links to `/plan?stays=1`; WeekBoard
  opens `showStays` + wide, WeekMap mounts `WhereToStaySheet panel` over its map and draws
  the lettered candidate pins (`makePinElement`), framing once per set with 440px of right
  padding for the panel. The phone still goes to `/map?stays=1`.
- ONE scroller for the week (25 Sep 2026): the outer div scrolls both ways; the header +
  Anytime lane are a `sticky top-0` block, the hours gutter, Anytime label and arrows cell
  are `sticky left-0`. Two nested scrollers (sideways outside, down inside) broke both the
  sticky gutter (sticky only knows its nearest scrolling ancestor) and the header/column
  alignment (the inner scrollbar stole width from the columns, not the header). The pointer
  maths read `colsRef`'s rect, which moves with the scroll, so no scrollTop arithmetic.
- Filter sub-type pills follow the type pills' rule (tap = only that, again = all;
  `rowsOn`, null = all), never a strike-through.
- Blocks carry the pin's category colour on the left edge (`PIN_COLORS`) and the sub-type
  glyph before the name; notes stay grey-edged and glyphless.
- Card sheet: on a note card the ⋯ keeps `mr-10` clear of the ✕; the checklist renders
  BELOW the notes (was first), both 25 Sep 2026. The desktop masthead is sticky, and has
  no Search and no "?" (the map searches; the guide will return as short recordings).
- Drags snap to 30 minutes (`SNAP_MIN`); the card sheet still takes exact times.
  `select-none` sits on the grid scroller only — on the root it blocked the sheet's and
  the pin card's note editors (25 Sep 2026).
- Week day names: `days.theme` if set, else `autoDayTitle` from the cards. The header's
  "…" is two items, Rename this day (inline input; empty = back to automatic) and Arrange
  this day. "Show only on the map" went: the header click does it.
- Selecting pins (25 Sep 2026): the Select disc works at panel width too; Shift/Ctrl-click a
  pin selects without the disc (first one turns select mode on; Esc leaves). Dragging a
  selected pin carries the whole selection as one chip ("4 places", `fromMapMany`); a drop on
  a day column runs `putMany`, and the board bumps `selectionEpoch` so the map clears.
- The header "…" is three items: Rename this day, Give these times (timeless blocks
  only; named "Give these times" by the owner 7 Oct 2026, superseding 26 Sep's "Fill in
  missing times" — one name for the action everywhere, the phone link under the untimed
  group included), Rearrange the whole day (every block re-timed by the engine; confirmed cards stay as
  fixed points; anything that no longer fits goes anytime; Undo restores every time).
- A batch drop skips places already on that day (dedupe by place_id, and within the batch)
  and the toast says how many were already there. It happened: the same six places went on
  a Tuscany day twice, tray then drag, three seconds apart (25 Sep 2026).
- Bulk actions on the week: Shift/Ctrl-click blocks (`pickedBlocks`, ring-2 ink), a tray at
  the bottom of the week with Move to a day, Take off the day, Delete; Esc or ✕ clears;
  every action has Undo.
- `lib/week/dayPlan.ts` (tested) is the bridge from cards to the engine: `planExisting`
  (rest | all) and `planBatch` (dedupe, times keyed by picked id). The phone uses it; the
  desktop board still carries its own copy of the same logic.
- Phone pick-and-arrange (25 Sep 2026, mock https://claude.ai/artifact/YZAUNZQhqBBwpmWweLPeeV):
  long-press a pin (500ms, ≤8px drift, vibrate) enters pick mode; taps toggle; the rest
  fade; an empty-map tap or ✕ leaves. Both pin-creation paths in FullMapClient wire
  `attachLongPress` and the click guard. The pin card's day list ends with "Pick more pins
  first" (`onPickMore`). The tray above the Filter lists the days; a tap runs
  `putPickedOnDay` (planBatch → scheduleCardOnDay per card → registerNewCard) and then
  `router.push` to that day; Undo deletes the new cards.
- Agenda: long-press a day in `DayStrip` (`onDayLongPress`) → a phone menu: Rename this day
  (current day only; inline input under the strip → `commitDayTitle`), Give these
  times, Rearrange the whole day (`arrangeDayCards`: fetches that day's cards, planExisting,
  queuedUpdate each, local list patched when it is the open day, router.refresh, Undo).
- The phone Map's Filter has the same sub-type row (once one category is chosen), driving
  `activeSubTypes` — the set the desktop sidebar used — with the type pills' tap rule.
- The desktop AppMenu is the same 3-across tiles as the phone (25 Sep 2026). Mocks:
  https://claude.ai/artifact/Re8LgyCtx1jWw3PRZYMo7W, https://claude.ai/artifact/Mc6jFQTci62sEV4KbeHtCJ.
- The phone AppMenu is a 3-across grid of 64px tiles under the disc (25 Sep 2026), titles
  "Stay" and "Settings" there; desktop keeps rows. A bottom sheet was mocked and rejected:
  the trigger is top-right, so the menu opens where the thumb already is.
- Tailwind opacity trap: `bg-white/97` is not a step Tailwind generates, so the class did not
  exist and the phone AppMenu had no background over the Map until 24 Sep 2026. Use a real
  step (`/95`) or brackets (`/[0.97]`), and check the compiled CSS when something is see-through.

## One screen on desktop (26 Sep 2026)
- The owner's Agenda / Plan switch is gone from `DesktopMasthead`. The week is home: a day
  header on `WeekBoard` pushes `/trips/{id}/days/{dayId}` (the Agenda, with its own map fitted to
  the day) and a "‹ Week" pill in the masthead goes back. It replaced the header click that faded
  the other days' pins (`activeDayId` is still used by `tintDay` after drops). Guests keep
  `TripTabs` (Agenda / Map). The phone is untouched (masthead is `hidden md:flex`).
- "Tuscany ▾": the journey name is `TripSwitcher` — upcoming soonest first, then past, archived
  left out (`lib/tripSwitcher.ts`, tested on his real trips). A row goes to `/trips/{id}`.
- Bookings: the masthead row fires `roam:open-bookings`; every desktop screen must listen.
  `WeekBoard` did not, so the row did nothing on Plan. `lib/ui/bookingsListeners.test.ts` now
  asserts every screen in its SCREENS list listens — add a new desktop screen there.
- `houseRules.test.ts > every workflow's shell parses` fails on this Windows machine with and
  without these changes (bash -n on ci.yml); not caused here.

## Reverted: opening Roam straight into the next journey (26 Sep 2026)
- `49540a3` sent a signed-in desktop visit to `/` straight into the next journey. Reverted the
  same day: Brennan wants the Journeys page as the landing page — "it's perfectly fine the way it
  is. No notes." Do not re-propose skipping it. Also ruled: "Your year" stays folded by default
  ("too much information"). Switching journeys from inside one is the "Tuscany ▾" dropdown.

## Day ⇄ week on one screen (26 Sep 2026)
- A desktop day header no longer navigates: `WeekBoard` keeps `focusDayId`; that day's column
  widens (`lib/week/focus.ts`, tested — every track written out so `grid-template-columns`
  animates) and the rest become 34px strips of coloured bars. The header again, a strip, or Esc
  (not while typing) goes back; the week arrows clear it. `mapDayId` (focus, else a drop's tint)
  feeds `WeekMap.activeDayId`, so the map fits and fades to the focused day. `dayAtX` measures
  each `[data-daycol]` because columns are no longer equal. The wide day shows address · rating and
  a note's first sentence (`noteLine`).
- Journeys open on the week on a computer: `trips/page.tsx` leaves `openDayByTrip` empty unless
  `isPhone` (`lib/device.ts`), so cards link to `/trips/{id}`, which sends an OWNER on a computer to
  `/plan` and everyone else to the day. The phone is unchanged.

## The phone's door to any day (27 Sep 2026)
- The date in the phone Agenda header is a button with ▾: it opens `day/PhoneDayCalendar`, the
  journey's months dropping from under the header (measured, `data-day-header`). Two states and
  no key: dot = planned, pale tile = nothing on it. A → for travel days shipped and was cut the
  same day — he asked what it meant, and the stay layout already shows where you move. The weather line under the date keeps its own panel; opening one shuts
  the other. Before this the phone's only calendar was the "Day N of M" chip on the phone Plan
  board, which a phone cannot reach.
- With 2+ stays it is laid out BY STAY, not by month (step 2, same day): a bar of the whole
  journey to scale (tap = scroll to that stay, sienna tick = the open day), then each stay's
  days under its town. `lib/week/journeyStays.ts`, tested on every live journey's hotel
  cards: runs of the same `tonightByDay` hotel; the last day and days before the first
  check-in join their neighbour; two stays in a row in one town are named by hotel (Rome,
  not "Roma · Roma"); one hotel or none → null → the plain months. Only `in_itinerary`
  hotel cards count — a saved idea can hold a day_id. The stays come from the page's
  `hotelCards`, so the layout is right on the first frame. Mock:
  https://claude.ai/artifact/9waoTGRDYveVmi5Kj51HgA. Not done: town names on the date
  strip, and the desktop calendar still goes by month.
- Both calendars' mark reads are in `archivedReads.test.ts`; the desktop one had no archived
  guard until this change.

## Plan my trip (28–29 Sep 2026)
- A chip beside Filter (the week's map at lg+, the phone Map) opens `PlanMyTripSheet`: the saved
  places not on any day become the PLAN — ordinary scheduled cards, no draft stage, nothing to
  confirm (29 Sep 2026, Brennan chose this over Keep/Clear per day and over Keep all). Each card
  carries `ai_generated` and `details.plan = { day, start }` (where it was put). Undo: the week's
  tray right after ("Planned N places · Where to stay · Undo") and the toast. Later: the sheet's
  "Remove what Plan my trip added" deletes only cards still where it put them (`untouchedPlan`);
  anything moved or re-timed stays. Guests see the plan like any other card. Nothing already on a
  day is touched. `lib/ui/draftGuests.test.ts` keeps the draft stage gone.
- The engine is `lib/plan`, all rules, all tested on his real pins (`fixtures/trips.json`):
  `dayGroups` (places → day-sized groups; a region = a BASE, the same `REGION_KM` 100 km as
  `lib/stays/brief`), `draftTrip` (groups → days: shortest loop home via `roundTrip`, first and
  last days half, travel day half, never a closed weekday, fewest-open-days first, spare days
  spread), `retime` (real lengths — whole day ~7 h, half 2.5 h, shop 1 h — and opening hours;
  what cannot fit its hours is left untimed), `draftRows` (composes them; `hasChildren` from
  ages, then birthdates, then party ≥ 3).
- **No place names in rules.** Brennan, 29 Sep: "we can't just make these one-offs." Types from
  Google first (`types:details->types` is selected on the plan and map pages), then general words
  only; theme-park chains are the one list allowed. Japan/Rome/Costa Rica/Australia are TEST
  CASES, never special cases.
- Where to stay agrees: a region with a planned day is a base whatever its size, and when every
  base's places sit on days in order, its nights run from its first planned day to the next
  base's (`byPlan`, after check-in dates). The draft tray and the day's bar link to it.
- The saved pile on the week loads saved cards whatever `day_id` they carry (31 of Japan's hold a
  stale day one); they read as dayless.
- Bars (his call, 29 Sep): with children on the trip a bar is a late evening, from 9 pm (`LATE_BAR`), one a day; without, the usual evening slot. Google types were backfilled for his 183 older places the same day (merged into `details.types`); new saves already store them.
- The phone day map no longer expands (29 Sep 2026): a tap on stacked pins zooms the small map;
  the Map screen is the full-screen map. DayMap still supports `expanded` for other hosts.
- The phone day stays a LIST (29 Sep 2026). An Outlook-style hours view, a List/Hours toggle and
  "2 h free" gap lines were mocked (https://claude.ai/artifact/ScNmgyHjoptUFd3qvMbDuN) and
  declined: "no need to change". Do not re-propose unless he names it.

## Find (29 Sep 2026)
- A "Find" chip beside Filter (week's map at lg+, phone Map; owners only) opens `FindSheet`:
  places for what a BASE is short of, so nobody has to go to Instagram, Reddit or TikTok.
- Categories are Roam's own sub-types, never new slices (his call: "our database is pretty
  MECE"): `FIND_CATEGORIES` in `lib/find/gaps.ts` is EXACTLY the map Filter's food and activity
  rows (MapSidebar `GROUPS`), labelled by `subTypeLabel` (Tour, Race, Beach, Camp...); a test
  fails if they drift. No Shopping: the app has none (bookshops are Explore). NO targets: "7 of 14" was a guess he questioned
  ("how are you getting the numbers"), and Tamarindo has ~8 restaurants worth listing while a
  family with a kitchen eats in. Chips show no number at all ("Explore · 7" read as a recommendation). Do not re-add
  targets; Plan my trip is what says a day is thin.
- Find's chips are TWO levels like the Filter: an Activity | Food switch (the Where-to-stay switch
  style), then that group's kinds. Bases and kinds WRAP, never scroll: a hidden-scrollbar row cut
  Kagoshima and Dessert off at the edge and could not be scrolled (his note, 29 Sep 2026).
- A tap on a result opens `FindPlace` in the sheet (his words: "if you click on any of them, it
  doesn't open"): photos, rating, the traveller's reason and page, the journey's days it is shut
  (`closedOnTrip`), Google Maps and website, hours, and Save. Details and photos load on open only.
- Bases come from `findBases` (the same regions as Plan my trip and Where to stay). An empty map
  searches the destination as one base, so it works for a new journey; with no destination
  coordinates the sheet says to set one in Settings.
- `api/find`: Claude + web search reads Reddit and blogs (travellers' picks, each with a reason
  and its source link), every name checked on Google near the base (a name Google cannot place
  never shows); in parallel Google textsearch. `lib/find/merge` puts travellers first, drops
  what is already on the journey and anything over 60 km out. Quota `find: 40` a day.
- The Rome test (29 Sep 2026: an empty Rome built only with Find + Plan my trip, set beside his
  real Rome) set these rules: the Explore prompt asks for the must-sees first, then the ones first-timers skip
  (no Vatican or Pantheon came back when it asked for "not the obvious"); `fitsCategory` keeps
  a bakery out of Explore by Google types; and the sheet asks `mode: "google"` and
  `mode: "travellers"` separately, showing Google's in about a second. Both halves are cached
  30 days in `public.find_cache` (service role only, shared by everyone, keyed by
  `cacheKey`: rounded base, category, question, kids or not); only misses count to quota.
- Rome test 2 (same day) added: `NOT_A_PLACE` types (a traveller's "Colosseo" came back as the
  metro station); `samePlace` merges a traveller's pick into Google's listing of the same place
  (close by + a shared name stem: Colosseo/Colosseum, Pantheon/its piazza) and, strict (same name,
  500 m), keeps what is already on the journey from coming back under another listing; the list
  shows up to 12 (`MAX_SHOWN`) so two sights a day is reachable without typing.
- Plan my trip spreads a light trip (`spreadGroups` in draftRows): when full days leave more
  free days than one rest day a week, places are regrouped lighter (`loadCap` 0.75, then 0.5)
  while they still fit. Rome's eight sights were three packed days and four empty ones.
- When no area fits the journey whole, Plan my trip ticks the biggest and plans it as far as the
  days go (New York test: one city, 13 places, 3 free days; nothing was ticked and nothing written).
- `bulkImport` is 300 a day: Find saves one place per tap, and one tester hit 100 in an afternoon.
- New York / Costa Rica tests (29 Sep 2026): Explore never takes a `travel_agency` (tour
  companies are Guided) or a shop that is not also a sight (Shopping). A museum-like place with
  no hours on file keeps daytime hours in Plan my trip (`assumedWindow` in lib/plan/retime): the
  Museum of Natural History, reused from his real New York with no hours, was planned at 7:30 pm.
- Result thumbnails: the route resolves Google's photo for what the list could show and keeps the
  URL in `find_cache` (paid once a month per place, not per open); the tile shows if it fails.
- Speed: on open (and on a new base) the sheet fetches every category's Google half and the
  travellers' half for Explore/Restaurant/Coffee/Dessert/Bar (`WARM_TRAVELLERS`), so tapping
  across the chips never waits. Only cache misses count to quota.
- Save = bulk-import one place with the category's type + an `interested` card carrying
  `details.find {why, source}`. Plan my trip then fits it into a day.

## Map pins keep one stacking order (29 Sep 2026)
- Mapbox's `Marker.addTo` appends a returning pin to the end of the canvas container (on top) and
  does nothing for one already shown, so the stacking followed whatever was toggled last: Food
  off and on laid food over activities, and a place's pale saved pin could cover its planned one
  (Brennan: "it kind of puts the icons behind it"). `lib/map/pinStack` `restack(stackOrder(...))`
  runs after every filter change, pin add and the first build on the full Map, and after the
  week's map follows its cards: saved under planned, otherwise card order. `pinStack.test.ts`
  reads both map files and fails if either stops restacking.
- Find's thumbnails are resolved for every kept result (Rome's Explore showed photos on 5 of 12
  when only the top 12 were done: a journey with many places saved sees further down the list).

## Find and Plan my trip: fixes from the three test trips (29 Sep 2026, evening)
- Coffee and dessert near the day (`lib/find/near`): with sights saved at a base, the sheet sends
  up to 4 cluster centres (`nearCentres`) and the sights' names; Google uses Nearby Search around
  each (1.2 km), travellers are told the sights, and everything beyond a walk is dropped
  (`withinWalk`). An empty base still searches the city. New York's cafés were in Brooklyn/Queens.
- Events, Races, Camps are DATED (`DATED` in lib/find/ask): no Google (it can only name venues,
  his point: "it's just bringing up venues"), and the travellers' search asks what is on in the
  city between the journey's start and end dates; "why" starts with the date. Cache key has the dates.
- Plan my trip: with children, no walkable bonus (three places a day, load 1) — Tamarindo came
  out at four sights and four meals. Tour companies (`travel_agency`) never shape a day: they go
  on the lightest planned day of their region, untimed (`Grouping.tours`), not as a 2.5-hour stop
  at their office (Rome: Carpe Diem Tours, Crown Tours).

## Speed and links (29 Sep 2026, late)
- Maps are flat and fog-free (`projection: "mercator"`, `setFog(null)` on style.load) in the full Map,
  the week's map and the day map: Mapbox 3 draws streets-v12 as a globe with fog, and every HTML
  pin then re-checks its fog opacity as the map moves ("zoom is choppy"). `lib/map/mapSetup.test.ts`
  reads all three. Pins are still HTML markers; a WebGL symbol layer is the next step if it still drags.
- Find and Plan my trip sheets load with `next/dynamic` when first opened, not with the page.
- Journey links go where they open in one step (`lib/tripHref`): an owner on a computer straight
  to /plan; a phone or a guest to the day. The card used to hit the front door or the day, whose
  day-shaped loading screen flashed before the week ("takes me to the old day view for a second").
- Find's place view has ‹ › arrows on its photos: with a mouse the strip could not be moved.
- Plan my trip writes each new card's note in his house format (`lib/plan/notes`): `**Intent**`
  one sentence, then `**Know before you go**` bullets, plus that day's hours from the place's saved
  hours (`dayHoursLine`). `api/plan/notes` runs after the insert, in the background: one Claude call
  for the places not yet written, cached per place (and kids/adults) in `find_cache` under
  `note|<google id>|…`, never overwriting a card that has notes. His request: "for each card you
  need an overview and a know before you go written". Quota `planNotes` 30/day.
- ...and for any card that lands on a day, however it got there (`hooks/useCardNotes`, in WeekBoard,
  PlanBoard and DayViewClient; never for a guest): cards created since `NOTES_FROM` (29 Sep 2026)
  with a place, not logistics, and no notes. Older cards are never written into (he builds some
  journeys by hand). One module-wide `asked` set so screens and Plan my trip never ask twice; the
  answer is broadcast as a `roam:notes` event and each screen folds it into its own state.

## Plan my trip ends and starts at the airport (30 Sep 2026)

- Tuscany's last day had "10:00 Pisa International Airport" saved as an ordinary `transit` stop, and
  Plan my trip put Florence after it. `lib/plan/airports`: an airport is a flight card, anything
  Google types `airport`, or anything named one (airport/aeroporto/aéroport/aeropuerto/flughafen…).
- First and last days only: the last day's plans end 1 h before an airport stop, 3 h before a
  flight; the first day's start 1 h 30 after landing (the later of start/end — journeys store the
  landing in either). Middle-of-trip flights stay ordinary fixed blocks.
- `draftDays`: a departure by noon or a landing after 15:00 leaves the day with nothing to plan;
  otherwise at most half a day. `buildDraft`: what does not fit inside the bounds stays saved
  (counted in "some stay saved"), never untimed after the flight.
- Map zoom, same day ("still zoomed in a bit too close"): picking a day on the week map stops at
  zoom 12 (`DAY_ZOOM`, guarded in lib/ui/pageLoad.test), the phone day map's fit at 14.

## Plan my trip keeps a pace (30 Sep 2026)

- `lib/plan/pace`, his rules: arrival day you rest, day 2 near home, day trips from day 3, breaks —
  and a weekend breaks them all ("that's the purpose of the trip"). By length:
  up to 4 days, no rules and the farthest group (> 5 km from home) goes first — New York got the
  Natural History Museum back; 5–7 days, day 1 half and near home, day 2 near home (≤ 25 km);
  8+ days, day 1 settles in (only a dinner ≤ 3 km from home rated ≥ 4.4, 6:30, two hours — "isn't
  a big deal ... especially if it's close and really good"), day 2 near home.
- Breaks are a run limit, not fixed days: never more than 4 busy days in a row with kids, 5
  without; any day with nothing on it resets the count. Fixed break days (tried first) gave Costa
  Rica three empty days in the middle; the run limit gives his real shape (busy 2–5, day 6 off).
  `breaksNeeded` comes off the free days before regions are ticked and places grouped.
- placeGroups now waits for ANY later open day, not just tomorrow, before dropping a place that
  is closed today, and counts dropped places when choosing how many spare rest days to keep.
- Testing a planner rule: run the old and new planner over live journeys (NY, Costa Rica) as
  empty trips with only logistics scheduled, and set both beside what he actually did.
- Bars with kids at 9 pm are his rule (29 Sep), not a bug — don't "fix" them.

## A pin dragged onto the week takes its kind's length (30 Sep 2026)

- `durationFor(type, subType, startMin)`: dinner (from 5 pm) 2 h, lunch 75 min, coffee 30, tour
  90 — his numbers. WeekBoard `putFromMap` used a flat hour; arrange's dinner slot now takes 2 h.
- ...and a whole-day place (theme park, zoo, national park, island — `placeShare` in
  lib/plan/dayGroups, the same test Plan my trip uses) takes 7 hours on any drop, single or many
  (ArrangeItem.share, set in lib/week/dayPlan toItem). His catch: "I don't think it accounts for
  all day activities".
- Live-drag testing with Chrome MCP `left_click_drag`: the tool does not send a final pointermove at
  the drop point, and WeekBoard drops where the last move was — so a test card lands a day or two
  off (Sun → Tue). That is the tool, not the app; check the card's times, not its day.

## Getting there: a travel card before each day trip (30 Sep 2026)

- His ask: a logistics card "on how to get to those places, knowing where the home base is" that
  "optimize[s] the best way to get there and provide[s] details on how to do it". After Plan my
  trip inserts, the sheet POSTs the new ids to `api/plan/getting-there` (quota `gettingThere` 30).
- `lib/plan/gettingThere`: a day trip is the day's first planned place > 25 km (NEAR_KM) from that
  night's stay; one note card per day (place_id null, `details.getting_there`, `details.plan` so
  Undo and "Remove what Plan my trip added" take it), timed leave → arrive, `source_url` = Google
  Maps directions in the chosen mode (the card sheet labels it "Directions").
- Best way: Google Directions driving + transit (legacy API, same key as Places; cached a month in
  find_cache "route|"). Transit is asked for the same weekday/hour this coming week (no timetables
  two years out), hour shifted by longitude. Parking +15 min, changes +10 (kids) / +5. With no
  rental saved on the journey (`hasCar`), driving must beat transit by a third — Rome→Tivoli is
  46 min by car, 69 by metro+bus, and a family in Rome has no car.
- Google has NO transit data for Japan or rural Costa Rica (ZERO_RESULTS): the card says so and
  points at Google Maps' own transit view. Leaving before 8 am moves that day's planned cards later.

## A lazy screen after a deploy reloads instead of crashing (30 Sep 2026)

- Brennan pressed Plan my trip on a page loaded before a deploy: "Application error". The sheet is
  `next/dynamic` and its chunk belonged to the old build (ChunkLoadError, 404). Every `dynamic(` in
  the app now goes through `reloadOnStale` (lib/chunkReload): a missing chunk reloads the page once
  (never twice inside a minute). `chunkReload.test` fails if a new `dynamic(` skips it.
- Frequent pushes make this likelier; a reload also fixes it by hand.
- **Journey notes load when opened (5 Oct 2026).** @dnd-kit reached every (app) route at first
  load through `JourneyNotesSheet`, imported statically by `AppOverlays` (in the layout) and
  `DayViewClient` — not through CardTimeline, which has no drag. Both now `dynamic()` it;
  `AppOverlays` preloads the chunk on idle so it is cached for offline. Day page 299 -> 277 kB.
  `day/lazySheets.test.ts` walks the static import graph from the layout and the day page and
  names the chain if dnd-kit comes back; `overlays/JourneyNotesLazy.test.tsx` drags a note.
- Same push: a card dragged out of Anytime onto a time gets its kind's length (durationFor, whole-day
  places the day), like a map drop — it used to land with no end.

## Events reach a day trip away, special ones first (30 Sep 2026)

- His ask: Tuscany's Events should pick up "that barrel rolling festival" (Bravio delle Botti,
  Montepulciano, last Sunday of August, ~130 km from the villa near Lucca) — "events should find really
  cool stuff like that". Two blockers: the prompt searched only the base town, and mergeFind dropped
  anything over FAR_KM (60). Events now search within ~2 h' drive, lead with palios, historic races,
  sagre, processions, re-enactments; keep results to EVENT_FAR_KM (170); 5 web searches, not 3. An event
  or race may sit in a square or a town: Google types Piazza Grande as "route", which fitsCategory
  dropped for every kind — the first live run came back empty. Cache
  key gained "|region" so old event answers are not served.

## Card notes in batches of six (30 Sep 2026)

- Japan's 23 planned cards never got notes: first the Anthropic credit was out, and every page load
  still asked, failed and counted (43 of a 30 allowance → 429s); then, with credit, one Claude call
  for 23 places ran past Vercel's 60 s and wrote nothing. Now six places a call, all in parallel
  (`batchesOf`, `NOTES_BATCH` in lib/plan/notes), and `planNotes` is 100 a day.
- A trip a year out has no published programme: yearly events on those dates count, and "why"
  starts "Usually". Find logs what the travellers' search named ("[find] travellers").

## Notes at once on a drop (30 Sep 2026)

- "Can it be almost instantaneous": useCardNotes asks at once (was 1.5 s), and the week board warms
  the journey's saved places once per page load (`warmNotes`, api/plan/notes `warm: true`): notes
  go into the shared cache only, never into the saved cards, so a drop is a cache hit.
- Museums and galleries (`isMuseum` in lib/plan/dayGroups: Google museum/art_gallery or the name) take
  3 h on drops and in Plan my trip (was 90 min / 2 h 30): "closer to like 3 hours".
- Find's travellers call: max_tokens 1500 -> 4000 (five searches left no room; Tuscany events came back
  empty), and an empty answer logs stop_reason and the tail of Claude's text.
- Find, card notes and Getting there run up to 180 s (maxDuration): five web searches plus the answer
  ran past 60 s on Tuscany's events (504).
- Event results must fall on the trip's dates (`onTripDates`, lib/find/ask): the search returned the
  Luminara (13 Sep) for a trip ending 4 Sep. First good run: Bravio delle Botti, "Usually Sun 29 Aug".
- Event dates in the trip's own year: the prompt carries the trip's calendar (`tripCalendar`), and
  `fixWeekdays` corrects "Sun 13 Apr" on a 2028 trip (a rule like "2nd Sun of Apr" gives the real date;
  otherwise the weekday is fixed). With children, events the search marks kids:false are dropped and the
  prompt says no adult-themed festivals (Kanamara Matsuri came back for Japan). Cache key "region2".
- Find treats a party of 3+ with no ages saved as having children (as hasChildren does): Japan has no
  ages, so the adult-themed filter never ran and Kanamara Matsuri stayed.
- Find's travellers answer: max_tokens 8000, and a reply cut off mid-list keeps every place that came
  through whole (parseTravellers) — Tokyo's events stopped at max_tokens with 4000 and returned nothing.

## Who is travelling: adults, kids with ages, seniors (30 Sep 2026)

- His ask: "put in kids, their ages, and if people are seniors". The app only had a head count; party_ages
  existed but no screen set it (imports did). `PartyPicker` (New journey + Trip settings) writes
  party_size + party_ages via lib/party (`partyFrom` / `agesFrom`): real ages kept, new adults 40, seniors
  70; kid = under 18, senior = 65+. Plan my trip plans gently for seniors as for young kids; Find tells the
  search "over 65: easy access". Names/birthdays (TravellersSection) stay hidden: a family profile is later.
- Travellers is one line ("2 adults · 3 kids (10, 8, 5)") until tapped — his "is this the best design"; a
  saved family profile was rejected ("won't work for all users"). New journeys start from the last journey's
  party aged to the new dates (`ageForward`).

## Find searched ahead (30 Sep 2026)

- His ask: "make find places faster". Measured: Google half ~1.4 s, travellers' half 28–35 s (events 60–90 s).
  Opening a journey (week map, phone map; not guests, not past trips) now runs every category, both halves,
  for its first two bases in the background, three at a time, once a day per browser (`useWarmFind`, lib/find/
  request `findRequest` shared with the sheet so the cache keys match). He agreed ~50¢ an area a month.
  `find` quota 40 -> 150 (cache hits don't count). Kept Sonnet: Haiku would weaken the travellers' picks.

## Find's recommendations audit (30 Sep 2026)

- His ask: go through every recommendation for Tuscany and Japan; "beaches under Tuscany: weird stuff".
- Tuscany's base was "Florence" at the pins' middle (most pins are in Florence), so Google's half was
  Florence's bars, spas and sights for a villa near Lucca. findBases now uses a stay with nights in the
  region (most nights; STAY_KM 100) as the base and its town as the label. Saved-only hotels don't count.
- Google's beaches must be beaches (`isBeach`: name in his languages or natural_feature) — a racecourse,
  a store, a gym, Santa Croce came back. Google's tours must be tours (`isTour`; never a company listing)
  — Shimane had a TV station, a university, a consultancy. The travellers' halves were fine.
- Travellers' picks misfiled (Tuscany Tours: walls, towers, a trattoria, a bike shop; Camps: a voucher scheme,
  a church; Wellness: an adventure park): the prompt said only the category's name. TRAVELLER_WORDS now says
  what each category is and isn't; camps must be named camps; events put the region's best-known first, even
  2 h away (the Bravio dropped out once Lucca's own festivals filled the list). Cache key carries
  FIND_PROMPT_V ("travellersv2") — bump it whenever the prompt changes, or old answers are served for 30 days.
- Audit round 2: cinemas never a place outside Events (Terme Excelsior matched the Excelsior multiplex);
  food not inside a theme park (Osaka desserts were Universal Studios stands); races are ones you enter
  (Osaka gave a horse race); month-only dates must fall in the trip's months (Tokyo "usually mid-June").
  Month words are whole and capitalised — "market" read as March, "may" as May. FIND_PROMPT_V v3.
- Weekday ranges ("Mon 2 – Wed 12 Apr") are corrected too, and dated answers are corrected as served, so
  cached ones are right without asking again. Audit verdict after three rounds: Tuscany and Japan read well.

## Events on set days stay on them (1 Oct 2026)

- His ask: dragging the Bravio (one Sunday) onto another day must not plan it there. lib/plan/eventDays reads
  Find's saved date line (details.find.why) against the trip: `eventDates` (singles, pairs, ranges; null when
  unknown or every day), `dayForCard` (its own day, the nearest of several). Every door uses it: the week's drop,
  move and multi-drop, the pin's Put on a day, the phone's pick-and-place; the toast says "X is on Sun 29 Aug,
  so it's there". Plan my trip puts dated events on their day untimed (`datedEvents`), out of the day groups.
  The pin popup now copies details to the scheduled card, as the week's drop does, so a later move still knows.
- The "is on … so it's there" toast now explains: "X only happens on Sun 29 Aug, so I moved it there" (several
  dates: which one it went to) — his ask. `dayForCard` returns the dates for it.
- An event carries its own name (1 Oct 2026): the Bravio was first in Tuscany's events but titled "Comune di
  Montepulciano" (its venue) and he missed it. The events prompt asks for "event" (its name) beside "name" (the
  venue Google can place); FindResult.title; the sheet shows the event, "At {venue}" under it; Save renames a
  NEW place after the event so its pin and card say Bravio (an existing place keeps its name). FIND_PROMPT_V v4.

## Claude spending, capped (1 Oct 2026)

- One morning cost him $20 (mostly my test re-runs of every Find category, three times, plus useWarmFind's 22
  paid searches per trip opened). "This isn't sustainable." Now: lib/api/spend adds each Find/notes call's cost
  (from res.usage: Sonnet $3/$15 per M, 1¢ a web search) to find_cache "spend|YYYY-MM-DD"; over DAILY_CAP_CENTS
  (300) Find's travellers' half returns 503 "paused until tomorrow" and notes pause; Google's half keeps working.
  Each call logs "[spend] …¢". Web searches 2 (events 3), was 3/5. CACHE_DAYS 90. Warm-up: 4 categories
  (WARM_CATEGORIES), main base only. NEVER test by re-running whole trips — one category, and read the cache.

## Events: the area's yearly list, asked once (1 Oct 2026)

- He wanted events without paying Claude per search. No free source lists yearly events (Wikidata: 28 Tuscan,
  mostly undated, no Bravio); SerpAPI's free plan has no Google Events. So lib/find/yearly: Claude is asked ONCE
  per ~10 km area for the year's recurring events with date rules (month/day or weekday+nth, days), kept for good
  in find_cache "yearly|v1|lat|lng" (no expiry). Every trip there is answered free: `yearlyForTrip` gives the
  dates for that year as "Usually Sun 29 Aug: …" so eventDays/drop rules read it. Events have a "see what's on"
  link to Google's own listings (`whatsOnUrl`) for one-off concerts — free, no API. Races and camps still ask per trip.

## Hotel stays: one card, check-in to check-out (1 Oct 2026)

- Sandra (tester) put her hotel on four days one at a time; Brennan wanted a stay to read like an Outlook all-day
  event. `lib/stays/stayRuns` is the ONE reader of which nights a hotel covers. Stays are stored four ways and it
  reads all: details.check_out / check_out_date (ISO) / end_date (Rome's is a year off, mended) on the check-in
  card; a later card of the same hotel ("Check out of the villa", Hocking's lodge 3 days later) = check-out day;
  the same hotel on consecutive days (Sandra) = check out the morning after the last; else the next hotel's
  check-in, else trip end. Only booked cards count (Japan's 3 "interested" ryokans on day 1 are not stays).
- Desktop week: the Anytime lane is GONE (his call: "the anytime row is where you should put the hotel row").
  A "Staying" band across the nights shipped and was DROPPED the same day (he: "maybe just check-in and
  check-out" — on a one-base trip it repeats itself). A hotel is two blocks, labelled "Check in · X" /
  "Check out · X" (blockTitle). Don't re-propose the band. Untimed cards sit dashed in their own day's
  header, and the header row is the drop target for "no time" (laneRef/overLane).
- Phone day: nothing added on screen (he: "I don't want to crowd the screen"; the day map already shows the
  hotel pin each night). DayViewClient's hotel pin now comes from stayOn, so it stops at check-out.
- Saving a hotel onto a day (AddToTripSheet) asks Check in + Check out, writes details.check_out, puts the
  check-in at 15:00 and creates a "Check out of X" card at 11:00 on the day you leave (his hand-made pattern); the hotel
  sheet (HotelDetail) has a "Check-out day" date field. Next batch, agreed: distance in Find + in a stop's sheet
  (never as lines between phone rows).
- Find distance (1 Oct 2026, lib/find/distance): each result says how far it is from the base's hotel
  (FindBase.stayName), else from the base's middle; in the list's grey line and in the opened place.
  Straight-line, free: <=1.5 km as minutes on foot, further as km. His ruling: distance shows in Find's list
  (deciding), NOT on the day's rows (already decided; the map shows it). A stop's sheet is optional, not built.
- Booking uploads (1 Oct 2026, lib/confirmations/toCards): the reader now returns airline, flight_number,
  origin_airport, arriving_at, seat (the fields FlightArrivalDetail shows) and a hotel's check_out_date/time.
  ConfirmationPreviewSheet looks each booking's place up (autocomplete → bulk-import, as Find saves), so the
  card has a pin/photos and a hotel counts in stayRuns; a failed lookup leaves the old note card. A hotel gets
  a Check out select (prefilled) and a "Check out of X" card at the booking's time (11:00 if none).
- One booking reader (1 Oct 2026, lib/confirmations/prompt): Bookings' upload AND a flight/hotel card's attachment
  use CONFIRMATION_PROMPT — one object per booking, so a package (flight out + home, hotel, car) is separate items.
  The old attachment prompt returned flat keys Apply never mapped (no flight number; an Expedia package put the
  hotel's address on the flight). Booking attachments store parsed_data = { bookings: [...] }; other card types keep
  the open prompt. Apply (AttachmentsPanel) fills the card from its own booking (lib/confirmations/match), adds its
  closing event (hotel check-out / car drop-off, toCards.closingEvent) on that day, and opens ConfirmationPreviewSheet
  headed "We also found these in your confirmation" for the rest. Rental cars = logistics/transit, "Pick up rental car"
  + "Return the rental car". resolvePlace lives in lib/confirmations for both sheets.
- Find's typed search (1 Oct 2026): the box reads "Search for something specific, e.g. 'gelato in Pisa'" (he
  didn't know "Or ask" took a place). A search that names a place (lib/find/ask namedPlace: "... in/near/around X")
  is searched THERE: Google gets the text as typed (not "+ in Lucca"), bias radius 50 km, reach EVENT_FAR_KM; the
  travellers' prompt drops the base. A typed search skips the chip's category filter and saves as Google's type
  (inferTypeOrSight). FIND_PROMPT_V not bumped on purpose: only named asks changed, and a bump re-pays every cache.
  His ruling: no area chips or distance slider for one-base trips like Tuscany — "an edge case"; anchor on the villa.
- Ticketmaster (1 Oct 2026, lib/find/ticketmaster): TICKETMASTER_API_KEY is in Vercel (Prod/Preview/Dev; he pasted it —
  never handle keys). It is Event's Google half in /api/find: Discovery API, 80 km around the base, the trip's dates,
  one per show, never cached (listings change; free 5,000/day). Results are dated "Sun 14 Mar: Rock, 8:00 PM.",
  link "Ticketmaster" to buy (FindSheet shows any result's source link now), placeId "tm:<id>" — Save looks the venue
  up via autocomplete and names the pin after the show. Thin in Italy (TicketOne). Trap: reloading his Vercel tab
  to "check" wiped his unsaved paste — never touch a tab he is typing in.
- Plan my trip on a full trip (1 Oct 2026): when preview.free < 0.5 the sheet opens with "Every day is planned. To plan
  more, take some places off a day and they go back to your saved places. Then run Plan my trip again." — no region
  list, no Plan button; "Remove what Plan my trip added" stays. (Was a toast after pressing Plan.) His call: no
  arrival/hotel-to-hotel travel cards — uploaded bookings already put the landing and the check-in on the day.
- Claude cost (1 Oct 2026, his call "do 1 and 3"): trip notes and both booking readers run on Haiku 4.5
  (claude-haiku-4-5-20251001); Find's travellers' picks, yearly events, entry check and prices stay Sonnet; the
  assistant is Opus. EVERY Claude route now checks overBudget and calls addSpend(…, res.model) — bookings,
  attachments, entry check, prices, share suggest and the assistant ran uncapped before. lib/api/spend prices by
  model (Haiku 1/5, Sonnet 3/15, Opus 5/25 $ per M). Not done (his "later"): area-level travellers' cache, paid tier.
- Ticketmaster shows have no Google rating: mergeFind keeps "tm:" results without wellRated and dedupes them by
  title, not venue (all 12 Santa Barbara shows were dropped as unrated).
- Settings rows (1 Oct 2026, mocked and approved): BOOKINGS (components/trip/BookingsSection, lib/bookings/summary) —
  empty: "No flight or hotel yet · Upload a confirmation and Roam puts them on your days" + Upload (Bookings' reader,
  ConfirmationPreviewSheet); booked: one line per kind — Flight(s) by date+city (≤2) or "N, range"; Hotel(s) by name
  and nights (≤2, via stayRuns) or "N: towns"; Car. Tapping a booked row opens DocumentsSheet. No "Upload another"
  link (one door). ENTRY row reads "Travel requirements" with a pill: "✓ None pending" / "Action required · N" /
  "Not checked yet". His rulings: no multi-stop switch (hotels show it); nothing about hotels at trip creation.
- Ticketmaster shows are kept by their local date within the trip (the UTC query window let in the evening before).

### Find never covers the map; a save rings its pin (1 Oct 2026)
- Brennan: "if you click Saved you can't really tell where it's saved on the map." Approved mock: Find docked beside the map on a computer, a half sheet on the phone, the new pin pulsing.
- `FindSheet` `dock` prop: WeekMap passes "beside" (absolute, `right: calc(100% + 10px)`, 400 px, over the week) or "inside" when the map is widened. FullMapClient (phone) passes nothing: a 50dvh sheet, handle toggles 88dvh, wrapper `pointer-events-none` so the map above still pans. No dimming backdrop anywhere; Escape or ✕ closes.
- `lib/map/pulse.ts`: `coverFrom(mapBox, sheetBox)` works out what the sheet hides; `pulseAt` glides only if the place is outside the uncovered part (easeTo `offset`, never `padding`, which sticks to the map), then adds a 2 s two-ring marker (pointer-events none) and removes it.
- Saving does not pick a day: the pin goes on the map; drag it onto a day or let Plan my trip place it.

### Find shows where a place is; Plan my trip on every trip (1 Oct 2026)
- Brennan: "even when you click on an item, it's hard to know where on the map it is ... you just end up seeing pictures", and "like a trip like Europe it's way too zoomed out". Approved mock: find-where.png.
- `FindSheet` `onFocus(r | null)`: called when a place opens, on Back, and when Find closes (unmount). WeekMap and FullMapClient draw it with `lib/map/pulse` `showAt` (a purple pin, the searched-place colour) and remove it on the next focus, on Save, or on close.
- Zoom rule, `focusZoom`: zoomed out past ~10, glide in to town level (11); closer, keep the zoom. Used by both `showAt` and `pulseAt`, so a save from the list zooms in on a Europe-sized view too.
- The place page reads: name, `placeBlurb` (the travellers' reason, else Google's `editorial_summary.overview`, never the "Rated 4.7 on Google" line twice), distance from the hotel with a purple dot, facts, open/closed, then a small photo strip (96x64, arrows step 104). `editorial_summary` was added to `/api/places/details` (Atmosphere tier, already billed by rating/opening_hours).
- Plan my trip's button now shows on every owner's trip (the `toPlan >= 2` gate is gone). The sheet says "Every day is planned..." (no free day) or "Nothing saved to plan yet..." (free days, nothing saved), with no Plan button in either. The Europe test trip had looked like it was missing features because every place was already on a day.
- Test trip for Plan my trip: "Tuscany (test)" (40ba0edf-1033-4494-a52f-9a5d6ec6b012), a copy of Tuscany with only the hotel (and transit) on days and 47 saved pins.

- Live check on the Europe trip (1 Oct 2026): the first cut only moved the map when the place was hidden, so an opened place sat near the map's edge as a bare purple dot among purple food pins. `showAt` now always centres (glideTo `always`) and puts the place's name beside the pin, as the mock had. `pulseAt` (save) still moves only when needed.

### Start here on a new journey (1 Oct 2026)
- From the how-to storyboards: uploading a booking was three steps deep (⋯, Share & settings, Upload) and a new journey had no "start here". Approved mock start-here.png, with his two changes: each button goes on its own, and the upload names cars.
- `lib/plan/startHere` `startSteps(cards)`: Upload until a hotel, flight or rental car is on a day; Find until an activity or food place is on the journey (saved or planned). Notes, cut cards and an only-saved hotel don't count.
- `components/plan/StartHere`: the card. On the week it floats over the empty grid in a sticky, zero-height wrapper (top 150, width = the scroller's measured width, so it stays centred while the grid scrolls). Find dispatches `roam:open-find`, which WeekMap listens for. On the phone's day it sits above the stops (DayViewClient reads the journey's cards itself, again when the day's count changes); Find goes to `/map?find=1`, which FullMapClient opens; Upload uses the day page's own import input. CardTimeline `quietEmpty` drops "Nothing planned yet" under it.
- `components/trip/useBookingUpload`: the upload (file input, parse, the check-and-add sheet), shared by Settings' Bookings row and the week. The week's Bookings sheet Upload had done nothing; it now uploads too.


### Phone Find: controls scroll away; "Add to my days" (2 Oct 2026)
- Brennan, with a screenshot: "when you scroll through it you can barely see what's up there at the bottom". In the 50dvh half sheet the controls (title, Activity/Food, two rows of kinds, the search box) took about 280 of 450 px, leaving under one result.
- `FindSheet` on the phone: one scroller (`data-testid="find-scroll"`) holds the controls and the results, so the controls scroll away; scrolling past 12 px raises the sheet to 88dvh; opening a place drops it back to 50dvh so the map above shows the purple pin. On a computer the wrapper is `display: contents`, so the docked panel is unchanged (controls fixed, results scroll).
- The booking sheet's button reads "Add to my days" (was "Add to plan"; "Add N to my days" for several, "Adding to your days…" while saving), matching the toast "Added to your days" and the how-to video. The video review caught the mismatch.
- Uploading a booking on the week adds the cards to their days directly; it must not call draftCreated, which also opens Plan my trip's 'Planned N places · Undo' tray (found by the video 2 storyboard review, 2 Oct 2026; WeekBoard.test covers it).

### Rulings from the video storyboards (2 Oct 2026)
- **Dragging a pin from the map onto a day copies it, on purpose.** Brennan: otherwise "you won't be able to do the same thing twice". To move a visit, drag its card on the week. Don't "fix" this.
- **No directions button on a stop's card.** He had one and removed it. Don't re-propose it.
- **One Undo after Plan my trip on a computer:** the week's tray ("Planned N places on M days · Where to stay · Undo"). `PlanMyTripSheet` `trayUndo` (WeekMap passes `!wide`; the tray is hidden when the map is widened, so the toast stays then) skips its toast and sends its Getting there card ids as `roam:plan-travel`, which WeekBoard's `undoPlan` deletes with the planned cards. The phone keeps the toast.
- **The map's Find button reads "Find places"**, the same name as Start here's.
- **The shared link shows the hotel's note under "Tonight"**, folded (`<details data-testid="tonight-note">`) so it isn't printed under every night: `lib/sharedItinerary` `Stay.note`, taken from the stay's first (check-in) card. The hotel's note box tells the owner "Shows on the shared link. Keep door codes in Journey notes." Journey notes still never reach that page; their sheet now says "People who sign in can see these. The shared link doesn't show them."

### Shared link notes folded; Find's pin; Start here during Find (2 Oct 2026)
- **Stop notes on the shared link are folded** (`lib/sharedNote` `foldNote`): the first paragraph's sentences up to the first break at or after 60 characters, then a sienna "more" (`<details data-testid="stop-note">`) opening the rest. The 60-character floor is for Brennan's own fragment-style notes ("Florence, since 1953. Google 4.6 …"). A short note shows whole with no "more".
- **Never on the shared link:** the "**Intent**" heading Plan my trip writes (131 of 326 notes), and first-person hedging lines ("I cannot verify…", "I have limited verified operational detail…"): `cleanNote`, also used on the Tonight note. Notes in the database are unchanged; signed-in screens still show them in full.
- **Find's "you're looking at this" pin is navy (#1A1A2E) with an orange (#B0541F) ring** and a white halo (`pulse.ts` `showAt`, `LOOK_FILL`/`LOOK_RING`). It was purple, which is every food pin's colour.
- **Start here hides while Find is open:** WeekMap sends `roam:find-open` (true/false, and false on unmount); WeekBoard hides the sticky Start here holder. It comes back on close if nothing is saved yet.
- The plan tray says "on 1 day" (was "on 1 days").

### Three phone bugs from the Romania test journey (2 Oct 2026)
- **A push straight after a write can show the page from before it.** Next 14.2's router reuses a page it showed in the last 30 s, and one `router.prefetch` fetched in the last 5 min (the phone day prefetches the days either side). Plan my trip pushed to Romania day 1, prefetched 14 s earlier; the Vercel log has no request for that day between the insert and his pull-to-refresh. `router.refresh()` empties the cache, but a push made while it is in flight DISCARDS it (navigations win in the router's queue), so "refresh then push" on one line does nothing. `hooks/useFreshPush(data)`: refresh, wait until the host's server data comes back with the new cards in it, then push (5 s fallback). FullMapClient's Plan my trip and pick tray both use it; `FullMapClient.test.tsx` fails on a bare `router.push(...days...)` there. Any other "write, then open a different page" needs the same.
- **DayViewClient ignores new props**: `localCards` is a `useState` initialiser, so a `router.refresh()` on the day changes nothing on screen. Not changed here. Consequences read from the code, not yet seen on his phone: the phone toast's Undo after Plan my trip deletes the cards but the day keeps showing them, and Getting there cards that arrive after you land show only on the next visit.
- **Find's phone half sheet covered the map's bottom row** (fixed, z-70, 50dvh over Filter / Plan my trip / Find places, z-10), and since the morning's change its ✕ scrolls away, so the buttons "just basically disappeared". The row now sits at `calc(50dvh + 12px)` while Find is open, steps aside (display none) when the sheet is raised to 88dvh (`FindSheet onTall`), the Find chip hides while Find is open, and Plan my trip closes Find. Mapbox's controls ride up with `.find-open`, as `.stays-open` already did. Where to stay's sheet still covers the row; not touched.
- **Notes not written on Romania = the Anthropic credit was empty**, not code: every `/api/plan/notes` call in his session returned 400 "Your credit balance is too low" (Vercel log, 17:42-17:56 UTC), and no `note|` row has been cached since 1 Oct 03:06 UTC. Find's travellers' half fails the same way. `useCardNotes` re-asks on the next screen that shows the cards, so the notes fill in by themselves once there is credit. Check the log for that string before debugging notes.

### Four fixes from a new journey on his phone (2 Oct 2026, round 2)
- **Destination suggestions over the keyboard.** "The keyboard is so high that you can't see that it's giving you a suggestion of the place below it unless you scroll down." The list in NewJourneyForm is now `position: fixed` to the Destination row's measured box and goes ABOVE the field when the keyboard leaves no room below (`lib/ui/dropdownPlacement`: below if ~4 rows fit or below > above, else above; never taller than the room). "Visible" is `window.visualViewport` (height shrinks for the keyboard; offsetTop is how far the browser panned), re-measured on its resize/scroll and on any scroll. Scrolling the field to the top was considered and not done: the form body is shorter than the sheet, so it has no room to scroll without a spacer, and removing a spacer on blur shifts the layout under the next tap. Any other field with a dropdown on a phone should use the same function. jsdom cannot open a keyboard: `NewJourneyForm.test.tsx` fakes `visualViewport` and the row's rect.
- **Dates: picking both does not close the calendar; Done does.** Reverses the Sep 2026 click-audit "second tap closes" (his words: "people need to do their start and end date and then press Done"). The overlap/verdict line is now seen before confirming. Don't re-add the auto-close.
- **Find on the phone: Save drops the sheet to half (50dvh)**, as opening a place already did, so the pin is seen landing; `onTall(false)` brings FullMapClient's bottom row back above the sheet. `FindSheet.test.tsx` covers it.
- **Start here's "Upload a booking" shows only on the journey's first day** (earliest date) of the phone day, and only until a booking is on a day (`startSteps(cards, { firstDay })`; DayViewClient works out firstDay). Find places still shows on any day until something is saved. The week passes nothing (default true): one Start here over the week. `DayViewClient.startHere.test.tsx` renders the real DayViewClient with its children mocked; it is the pattern for any DayViewClient rendering test.

### How-to videos in the app (2 Oct 2026)
- Mock approved: `video-placement-mock.html`, both calls YES (a Videos tile in the journey menu; one video at a time on the computer's Start here card). Rule: the right video at the right moment, shown once; after that, only in the menu.
- **One config, one switch.** `lib/videos/howTo.ts` lists the three videos (id, title, length, file, poster, surfaces) and the rules (`forSurface`, `startHereVideo`, `listed`). The files are in the PUBLIC bucket `how-to-videos`, never in `public/` (Vercel storage). `videos.json` in that bucket (`{"<id>": version}`, >0 = on) is the ONLY switch: no file or a failed fetch shows nothing anywhere. The version rides on the URL (`?v=N`), so a new cut replaces the old at once.
- **Switch one on / replace a cut:** `node scripts/upload-video.mjs <id> <mp4> <poster>` (`--off <id>` to hide). It needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (not there as of 2 Oct 2026; Supabase → Settings → API). No code change, no deploy. A temporary anon upload policy was tried and refused by the permission classifier; don't route around it.
- **"Gone" = played or ✕'d.** Signed in: `users.videos_seen` jsonb (migration 014), written by `mark_video_seen(video)` — SECURITY INVOKER, so own-row RLS applies — plus a localStorage copy. A failed read counts every video as gone (prompts stay away; the menu still lists). The shared link: localStorage only (`roam:video-seen:<id>`), read after mount.
- Surfaces: Journeys empty state (`FirstJourneyVideo` replaces the pin tile); Start here (video 1 row on the phone's first day and the week; on the week, video 2's "Watch how · 1 min" line only on a LATER visit — the pick is snapshotted per mount, see `StartHere.test`); the shared page's strip (`SharedVideoStrip`, video 3); AppMenu's sixth tile "Videos" → `VideosSheet`. `VideoPlayer` is native `<video controls playsInline>`, portalled to `<body>` at z-95; ✕, Escape, swipe down close it. Sheet and player are portalled because the menu lives inside header stacking contexts — and kept out of AppMenu.tsx so `layers.test` still reads the menu's own z.
- Tests that render StartHere, AppMenu or SharedItinerary mock `@/hooks/useHowToVideos`; `components/videos/videos.test.tsx` runs the real hook with fetch and Supabase faked.

### Small fixes, same push (2 Oct 2026)
- **A place saved in Find lands as a pin at once** (FullMapClient `onSaved` → `registerNewCard` before `router.refresh()`); his Hanoi trip said "Nothing on the map yet" until a reload. `FullMapClient.test`.
- **A booking that can't be read says so plainly.** `/api/confirmations/parse` returned the raw error, so an Anthropic refusal ("credit balance is too low") reached the phone's toast as JSON. `lib/confirmations/readError` gives one plain line; the real error goes to the log. Other Claude routes may still pass raw errors through; check before trusting a toast's words.
- **Cover photos fall back to broader searches** (`lib/coverQueries`): "Viet Hung, Ha Noi, Vietnam" → "Ha Noi, Vietnam" → "Vietnam". A non-OK Unsplash answer stops the loop (a broader search won't fix a refused key).

### Plan my trip: the sheet asks the planner (2 Oct 2026)
- Hanoi test trip (b35e1cb6): the sheet said "6 saved places · about 3 days of places for 0.5 free, so some stay saved" and showed Plan the trip; pressing it toasted "Nothing to plan". Cause: the sheet summed day shares (the last day's 0.5) while `placeGroups` only puts a group on a day with room for its whole load (0.75), so half a day holds nothing. Brennan: "It shouldn't offer both."
- `planRoom` (lib/plan/draftRows) is the one answer: it runs `buildDraft` and returns free, saved, fits, days and the rows. The sheet's line, its states and its button all come from it, and pressing the button inserts `planRoom`'s rows, so what it says and what it does cannot differ. Never decide "can we plan" from `preview.free` again; free is for words only.
- States: nothing fits and nothing saved (with free time) → "Nothing saved to plan yet."; nothing fits and no free time → "Every day is planned."; nothing fits with free time → "No room for what's left." + "Only half a day is free, and each place left needs more than that." (or "N days are free, but none of the places left fit."). No Plan button in any of them.
- The line counts places, not days: "8 saved places · 2 fit, so 6 stay saved" / "all fit, on 3 days". Never show a fractional day; `dayWords` says "half a day", "a day and a half", "10 and a half days".
- Fixture: `lib/plan/fixtures/hanoi.json` (that trip's days and cards from the live DB, place fields trimmed); used by draftRows.test and PlanMyTripSheet.test.

### How-to video player: centred on a computer (2 Oct 2026)
- `VideoPlayer` was full screen everywhere; on a wide monitor that was too much (Brennan). At 768 px and up (`matchMedia`, the same breakpoint as `md:`) it is now a centred frame over the page dimmed to rgba(14,14,22,0.72): `widePlayerSize` (lib/videos/howTo) = two-thirds of the window's width, max 960 px, max 80% of its height, at the file's own shape (read on `loadedmetadata`; 16:9 until then, 4:5 kept). ✕ sits just above the frame's top-right; ✕, Escape or a click on the dim closes; a click on the video does not. Phone: unchanged, full screen, swipe down closes.
- Rendering tests in `components/videos/videos.test.tsx` for both widths (jsdom has no matchMedia, so the default render is the phone path; the computer tests stub matchMedia and innerWidth/innerHeight). `data-layout` = "full" | "centred" on the dialog.

### Start here goes once stops are planned; Where to stay glides in ~1–1.4 s (2 Oct 2026)
- **Start here hides, whole card, once a stop is planned** (`lib/plan/startHere` `isPlannedStop`: an activity or food place on a day with status `in_itinerary`). Brennan: his Japan journey (46 stops on its days, its 6 ryokans all only `interested`) still showed "Upload a booking" on day 1, wrong for a journey well past its start. Both buttons and the video 1 row go with it (the video row lives on the card); Bookings stays in the menu, the Videos tile still lists the video. A place only saved, or on a day but `interested`/`cut`, does not count. Fixture: `lib/plan/fixtures/japan-start.json` (that journey's 94 cards, place type/sub_type only), used by startHere.test, StartHere.test and DayViewClient.startHere.test. Over all journeys on 2 Oct, only empty ones and Italy 2027 / London / Sandra (0 stops planned) still show it.
- **Where to stay's map moves are timed by `lib/map/glide` `stayGlide`**, not Mapbox's distance-based flyTo: Osaka ↔ Tokyo (~400 km) took ~4.3 s on a computer and ~5.7 s on a phone at zoom 12–13 (computed from Mapbox's own flyTo formula). Now 0.9 s (next door) rising on a log scale to 1.4 s (≥300 km). Under 25 km it eases straight across (fitBounds `linear: true` / easeTo); further it keeps flyTo's arc, because an easeTo across 400 km at street zoom pans over every tile between. His ruling on feel: "don't make it aggressive and jerky… it just needs to not lag or look jumpy." Both FullMapClient (phone) and WeekMap (computer) use it for the stays' fitBounds and the focused stay; `glide.test.ts` reads both files.
- **Trap: Mapbox `maxDuration` is not a cap.** A move longer than it gets `duration = 0`, i.e. a jump-cut. Always pass `duration`. `glide.test.ts` fails if either map file uses `maxDuration`.

**Video 4's "Your trip's started" card (2 Oct 2026):** surface `trip-underway`
in `lib/videos/howTo`, rendered by `components/videos/TripUnderwayVideo` at the
top of the phone's day. The day page now passes `phone` (lib/device, server UA)
to `DayViewClient` for everyone, not just to redirect owners — a guest on a
computer still gets the day view, so "phone only" cannot be read from the page
existing. "Under way" is `isUnderwayLocal` (lib/isSameLocalDay), computed after
mount because the server is UTC; it waits for Start here's card read so the two
never show together. Faking "today" in a render test:
`vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime` — faking all
timers stalls the async reads the day view does after mount.

### A booking dated outside the journey is kept, on the nearest day (3 Oct 2026)
- Before: ConfirmationPreviewSheet's `findMatchingDay` fell back to `days[0]` for any date it could not find, so a flight home the day after the end went on Day 1 without a word, and a check-out after the last day defaulted to "After the trip's last day" (no check-out card). Now `lib/confirmations/outsideDates` decides: `dayFor` = own day, else the nearest edge (a gap INSIDE the journey still returns null → Day 1 as before); `bookingOutside` = one plain sienna (#B0541F) line per booking ("AC 890 flies Mon 23 Aug, a day before the trip starts. It'll go on Tue 24 Aug.") plus "Extend the trip to …" covering every date it has (a stay wider than the journey extends both edges).
- The reader's flight `date` is the DEPARTURE day, so the line says "flies", never "lands" — there is no arrival date field.
- Extend = `lib/confirmations/extendJourney`: Settings' write (planDayChanges over fresh days → trips row → day updates → inserts with `Day N` names), growing only — it refuses any range that would remove a day. The sheet holds its own days after that; on close/save it calls `onDaysChanged`, default `window.location.reload()` because WeekBoard/DayView keep days in useState and a router.refresh would not show the new day.
- `shortDay` spells months by hand: Node's ICU writes "Sept" in en-GB and browsers differ.
- The check-out select now allows the check-in day itself (`>=`), so a stay clipped to the last day can still check out on it.

### Plan my trip: saved food goes on days already planned (3 Oct 2026)
- Muskoka (8bd1f3c0): Santa's Village, Treetop Trekking and Dwight Beach on days, two Huntsville cafés and the Old Station (Bracebridge) still saved, and the sheet said "No room for what's left". Cause: meals only ever joined a NEW day's group (dayGroups, MEAL_KM 3), and a day with a sight is free 0, so once every day had a sight no meal could be planned. Not planRoom's fault (98add14 only made the sheet tell the truth about it).
- `lib/plan/mealsOnDays` `mealsOnPlannedDays`, run at the end of buildDraft over the food the groups did not take: nearest day with a sight within NEAR_KM (8 km; planned days are driving days, Treetop is 5 km from the cafés); coffee (any food but restaurant; bars excluded) = 45 min ending 15 min before the day's first timed card, not before 8; restaurant = lunch 12:00 if nothing is booked over it, else dinner from 18:00 or after the last card, by 8 pm; one coffee / lunch / dinner a day counting food already there; inside that day's opening hours; never over a timed card or airport bound. What cannot go returns a plain reason ("It's closed on Sun 11 Oct, the only day near it.").
- `planRoom.meals` = { placed, left }; the sheet lists them under the count line (`data-testid="plan-meals"`): "Coffee at X, Sun 11 Oct, before Y." / "Z stays saved. <reason>". Fixture `lib/plan/fixtures/muskoka.json` (live DB after his run); mealsOnDays.test + PlanMyTripSheet.test. Henrietta's is closed Sundays, so only Threshold and the Old Station plan.

## Verifying phone-only pages (5 Oct 2026)
- The `window.open(..., "popup=yes,width=430")` trick is 430px wide but still sends a DESKTOP user agent.
  The day route picks phone vs computer from the server UA (`lib/device` `isPhone`), so in that popup
  `/trips/{id}/days/{dayId}` redirects to `/plan` and you never see DayViewClient/DayMap. Use the
  built-in browser pane's `mobile` preset: it sends an Android UA with sec-ch-ua-mobile ?0, and since
  7034cfe `isPhone` lets the phone UA win, so the pane gets the real phone day page (verified 5 Oct:
  Tuscany Day 1, map + 7 pins). Navigate with the pane's navigate tool after setting the preset.
- The desktop Map tab sidebar is retired (7034cfe); owners get the Filter pill on every screen.
- The same popup on `/plan` downloads mapbox-gl (1.6 MB) because PlanSwitch server-renders the week
  (WeekMap) before swapping to PlanBoard. Real phones never reach /plan, so that cost is not a phone cost.
- Desktop pin popups (WeekMap, FullMapClient) slide the map down when the popup would overhang the top:
  MapPinPopup reports its HEIGHT via ResizeObserver and the host computes the top from its current pin
  position (`lib/map/popupRoom`). Measuring the popup's top directly was a render stale and only
  panned part way (live: top -104 px on Tuscany).
- DayMap waits for idle on a phone before starting Mapbox (`lib/map/mapGoNow`); desktop starts at once.
- **Never `git worktree remove --force` a worktree whose node_modules is a junction** (5 Oct 2026): the
  delete follows the junction and empties C:\Users\brenn\roam\node_modules. Remove the junction first
  (`cmd /c rmdir <wt>\node_modules`), then the worktree. Recovery: `npm ci`.

## To book: Flights / Stays / Car at the top of Bookings (6 Oct 2026)
- Mock approved: https://claude.ai/artifact/DToVaxpZebi7wdQSzr56GB. `components/plan/ToBookSection` sits at the top of
  DocumentsSheet (every host gets it: phone + computer menu "Bookings", Settings' Bookings row); the uploads follow
  under an "Uploaded" label, unchanged. **Owner only** — it loads its own rows and renders nothing unless
  `trips.user_id` is the session's user (guests and cohosts never see it; the shared link has no Bookings).
- Rows come from `lib/booking/checklist` `checklistRows`: ticked automatically from cards ON THE DAYS (not
  interested/cut): flight_arrival/departure cards; hotels covering every night via `stayRuns` (the one reader);
  a rental car = `isRentalCar` in lib/bookings/summary (sub_type is `transit`, there is no car type). A manual
  "Booked"/"Not needed" in `trips.booking_checklist` (jsonb, migration 016) wins over everything. Writes go through
  `queuedUpdate("trips", …)` with a toast + Undo. Stays' open run is searched in the town of that night's plans
  (Tuscany's 31 Aug gap → Firenze, as the mock shows), else the stay beside the gap, else the destination.
- **Kayak URL rules (lib/booking/kayak, shapes verified live by Brennan 6 Oct 2026):** the host is the
  person's own Kayak site (`kayakBase`, home country then passport), because Kayak prices in its regional
  site's currency: Canada `www.ca.kayak.com` (**kayak.ca does not resolve — DNS**), UK `kayak.co.uk`, AU, IE, DE,
  FR, IT, ES, NL, CH, MX, IN (all three shapes curl-checked 6 Oct); US and the rest `www.kayak.com`. Flights need IATA codes; **a town in
  the route is silently dropped**, so no codes = the plain /flights page. Several arrival airports comma-join
  (`YYZ-FLR,PSA`). Stays: `/hotels/Town/in/out/Nadults/Kchildren-a-b/Rrooms` with the **plain English town, no country**
  (tested live: "Florence-Italy" and "Lisboa-Portugal" opened the AIRPORT, "Roma" opened Roma, Queensland, "Firenze"
  a hamlet; "Florence", "Lisbon", "Rome" the city) — `englishTown` maps local spellings; a comma falls back to the
  generic stays page; a region ("Tuscany") is not a Kayak place. Rooms =
  ceil(people/4); 1 room and no children are left out. Cars: `/cars/PSA/2027-08-24-14h/2027-09-04-10h`, pick-up
  two hours after a known landing else 14h, return 10h. Outbound is the day before the start when there are no
  flight cards and home and destination are different countries outside one region (`overnightOutbound`).
- Arrival airports: the journey's own flight cards (`arriving_at`/`origin_airport` codes) first; otherwise
  `POST /api/booking/airports` asks Haiku once per destination EVER (find_cache `airports|<destination>`, no
  expiry, even an empty answer), owner only, quota `bookingAirports`, spend-capped. The sheet asks lazily
  (`needsAirports`) — only when Flights or Car is open.
- **Search all, seats, Where to stay, real prices (6 Oct 2026, his yes to all four):** an OPEN row has a checkbox
  ("include in my search", ticked by default, this visit only); booked/skip rows show the ✓/dash, not a control.
  Booked / Not needed / Clear (and "What did it cost?" on a hand-booked row, "Where to stay" on a booked Stays row)
  sit behind the row's ⋯. One button under the rows ("Search flights, car & stays") runs `lib/booking/search`:
  Kayak tabs first via `window.open(url, "_blank")` in the same click (NO "noopener" feature — with it
  window.open returns null even when it opened), then Where to stay. A null return = blocked (iPhones may allow
  only the first): the rest stay as a "Next: Car ↗" button, one tap each, and the sheet does not leave until the
  Kayak steps are done. Stays (row or search) opens Roam's Where to stay by the old menu tile's exact path
  (`whereToStayHref`: <768px `/map?stays=1`, else `/plan?stays=1`) and closes Bookings (`onLeave`). A cruise
  keeps Kayak for Stays. **The journey menu has no Stay tile any more** — the Stays row is the door (plus Plan
  my trip's bar on the week). Not added: "Search hotels on Kayak" inside Where to stay (not a one-liner there).
- Cars carry Kayak's seats filter (verified live 6 Oct): ≤4 none; 5–6 `?sort=rank_a&fs=carcapacity=pas_5_6`;
  7+ `pas_7_X`; 10+ also says "you'll need two cars" on the row (`carCapacity`, `twoCars` in kayak.ts).
- Prices: the booking reader (CONFIRMATION_PROMPT) returns `total_paid` + `paid_currency` for flights, hotels
  and cars, ONCE per booking; `onePricePerBooking` drops a repeat under the same reference (Rome's AC890 legs
  share B24EDV). Stored as `details.paid_total`/`paid_currency` on the OPENING card only — the outbound leg,
  the hotel's check-in card, the car's pick-up card; `closingDetails` strips it from check-out/drop-off cards.
  Uploads before 6 Oct have no price and are NOT re-read (Claude money). A hand "Booked" may carry a cost:
  `booking_checklist = { stays: "booked", costs: { stays: { amount, currency } } }` (`storeChecklist` keeps a
  cost only while the row is Booked; default currency = trip_budgets.currency, else the destination's).
- Budget (`lib/budget/booked`): flights / car = sum of paid; accommodation = paid + nightly rate × nights not
  covered by a PRICED hotel run (stayRuns) — a hand-booked Stays with a cost counts every night. Converted on
  the screen at its own rate (home 1, the journey currency at fx, else REFERENCE_RATES; no rate = left out).
  Lines show "Booked" / "Booked · 4 of 6 nights" and no inputs when all paid; the header reads "booked $X ·
  still estimated $Y". **Contingency is on the estimated part only** (paid money needs none). Both sources add.

## Bookings rebuilt to one job (6 Oct 2026, later; mock v4 approved, same artifact)
**Supersedes the "To book" layout above** (the checkbox, the ⋯, "Search flights, car & stays", the "Uploaded"
label, the dark "Upload a booking" button, the empty-state block). Logic is unchanged: auto-ticks, Kayak URLs,
seats, Where to stay, costs/budget, blocked-tab "Next", owner only, toast + Undo.
- Owner: title "Bookings", three rows (`ToBookSection`), ONE mark each — ○ ink outline to book, filled green
  (#1D7A55) ✓ booked, dashed – not needed — title, one short line (no truncate), faint ›. The **mark** (44px)
  opens Booked / Not needed / Clear (+ What did it cost?, + Where to stay / Open the confirmation when the row's
  tap goes elsewhere, + Remove the upload for a `documents` record). The **row** is the tap: `lib/booking/files`
  `rowTap` — open → Kayak (a real `<a target=_blank>`) or Where to stay; booked → its file (several unfold under
  the row), else Where to stay for Stays, else `/trips/:id/days/:dayId` of its card; Not needed → the menu.
- Lines (`checklistRows`): "Toronto → Pisa · 7 people" (`airportCity` in kayak.ts; unknown code shows the
  code), "Villa Zambaldi · all 11 nights" / "4 of 6 nights booked" / "Lucca · 11 nights", "Pisa airport · 7
  seats" (", two cars" at 10+), "Marked booked" / "Paid €1,450". `rowLine` swaps a booked Flights/Car line for
  "Air Canada · confirmation" when an upload sits in the row.
- One primary button "Book N on Kayak" (`bookLabel`; N = rows still to book, Stays included; hidden at 0).
  Not needed rows are out — that replaced the include-in-search checkboxes. Under it the quiet link "Upload a
  confirmation" (the host's same `onImport`), then "Other files (n)" only when an upload matches no row.
- Uploads → rows: attachments by their card (`rowForCard`: flight sub_types, `isRentalCar`, hotel); `documents`
  by `document_type` (`rowForDocument`). A `documents` row holds NO file (just parsed_data) — it names the row
  but cannot open; only card attachments (signed URLs) open in FileViewer.
- Not the owner: `ToBookSection` calls `onOwner(false)` and DocumentsSheet shows the plain file list (plus the
  upload link if the host passes `onImport`, i.e. a cohost); nothing at all → "Nothing has been added yet."

## Designer audit, batch A (6 Oct 2026): card sheet, week day names, three bugs
Mock: https://claude.ai/artifact/4r2r4qi1gCUearqXiKnCrB. Approved scope only — the map's Select disc and + / −
stay (Select is the lasso's only door).
- **Card sheet:** no "1/10" counter on the gallery (arrows + swipe page it; dots still for ≤5); the Google
  credit is hidden only when it is the place's own name (`lib/places/photoCredit` `isOwnCredit` — the business
  uploaded the photo); a photographer's credit stays (Google attribution). No duration beside the times. No
  "Notes" label while reading (each detail component shows it only with Add details on). The generated note's
  "Open … that day" point is hidden when the sheet shows an Hours row: `FieldRow`'s `NoteDisplay` context, set
  to `lib/plan/notes` `withoutHoursLine` by the sheet — display only, the stored note is untouched.
- **Booked lives in the ⋯** (a `menuitemcheckbox` with the switch; the menu stays open). Same write as the old
  row (`saveTopLevel("confirmed")` → `onCardUpdate`), so CardBadges' Booked, the Estimate and Re-plan read it
  as before. The ⋯ now shows for any bookable card (guided / logistics / restaurant), not only scheduled ones —
  a saved restaurant's ⋯ holds Booked alone. The To book checklist does NOT read `cards.confirmed`.
- **Week day names:** the header prints `days.theme` (what he typed) and nothing else; `autoDayTitle` is only
  the rename box's placeholder there. Typed vs automatic IS distinguishable: automatic names are computed,
  never stored (Tuscany/Japan/Rome have no themes; Palm Springs, Santa Barbara, Last Week of Summer do).
  PlanBoard, DayViewClient, the shared page and the rest keep their own rules.
- **`lib/noteLead`** (moved out of CardSurface): the note's first real sentence, past `**Intent**`. The week's
  opened day (`noteLine`) and the map pin's folded line use it; the pin's open note renders `renderEmphasis`
  (bold headings, as the sheet). Never print a note's first line raw.
- `md:italic` escapes globals.css's `.font-display.italic` neutraliser (a breakpoint class is a different
  class). It put his Profile name in italics on the computer; `houseRules.test.ts` now forbids `sm|md|lg|xl:italic`.
- Find's meta line is text, not flex items: the "·" sits between distance and source with `\u00a0` either side.

## Designer audit, batch B (6 Oct 2026): map pin card, Find's Save, Plan my trip's planned state
Approved scope only. Find KEEPS its two-level filters (Activity / Food, then kinds — one long row was rejected
29 Sep); only its Save buttons changed.
- **Map pin card (MapPinPopup, both WeekMap and FullMapClient, phone and desktop):** the bin beside the ✕ is
  gone; "Remove from map" is a quiet dotted text link at the bottom of the card, always there when
  `onCardDelete` is passed, hidden while a confirm or the day list is open. Same doors as the bin
  (`handleTrashClick`): saved pin → "Remove this place from your map?"; scheduled → "Take it off the day";
  the host's toast + Undo arrive through `onCardDelete`, unchanged. One star + "4.7" (`OneStar`, the sheet's
  #B45309 star) instead of five. The name wraps to two lines (`line-clamp-2`), heart top-aligned. No name or
  counter on the photo (PlacePhotoGallery, batch A). The folded note uses `lib/noteLead`; opened, `renderEmphasis`.
- **Find's row Save:** a white outlined "+ Save" (inset 1px ink at 18%), then green (#1D7A55) "✓ Saved",
  disabled. The marks are `aria-hidden`, so the button's name stays "Save" / "Saved". The opened place's
  full-width "Save to your map" is unchanged (it is that screen's one primary action).
- **Plan my trip:** the how-to line ("To plan more, take some places off a day…") is gone from both full states.
  Two or more saved food places that cannot go on a day collapse to one line — `lib/plan/mealsOnDays`
  `leftLine`: "N food places stay saved: those days already have their meals." only when every one is
  `why: "full"`; a mix (one shut, one far) says just "N food places stay saved." and each name keeps its reason
  under "See which". One place keeps its own sentence. `MealLeft` carries `why` ("full" | "closed" | "far").
  "Remove what Plan my trip added (N places)" stays (the only way back) as a quiet grey underlined link, not
  sienna; "See which" never hides it.

## Taps audit batch (6 Oct 2026)
- **Finger-sized targets, no visual change:** an `aria-hidden` absolute span with a negative inset inside a
  `relative` control (the time chip in CardSurface was first). Never let the span reach a neighbouring
  control: between two controls use at most half the gap; never past an `overflow-hidden` edge (it clips the
  hit area too) or a toast's own box. A clipped circle (the Journeys avatar) gets its span on the link, outside
  the circle. `src/components/ui/tapTargets.test.tsx` holds the insets; change both together.
- **`onCardDelete(id, takenOff?)`:** CardBottomSheet and MapPinPopup pass `{ savedId }` when "Take off this
  day" / "Take it off the day" ran (the place stays saved; `savedId` is the saved copy unscheduleCard made, or
  null). Day view toasts `lib/takenOff` "Taken off Fri · still on your map", the Map tab "Taken off Day 3";
  both Undos delete that saved copy and re-insert the card. Other hosts ignore the second argument.
- **Booked pill is status only** (CardBadges, no `onToggleBooked`): its one-tap un-book had no toast or Undo.
  The Booked switch in the card sheet's ⋯ menu is the one door.
- **Plan board Find below lg:** the map panel is `hidden lg:block`, so WeekMap opens Find undocked, portalled
  to `document.body` (the phone's half sheet) unless lg or the map is widened.
- **Map pick tray** shows at every width (was `md:hidden` while Pick more / long press worked on a computer).

### Taps audit, second batch (6 Oct 2026)
- **Several bookings in one pick:** `useBookingUpload` takes `multiple` files, reads each through the unchanged
  `/api/confirmations/parse` three at a time (`lib/confirmations/batch`, max 10 per pick — each is a paid read
  under QUOTA.parseBooking), and opens ONE ConfirmationPreviewSheet. More than one booking = compact rows
  (eyebrow, title, `whenLine`, Edit); one booking = the full form as before. One `documents` row per file;
  `onCardsCreated` passes `docIds` third so Undo removes cards and records. Toast: `addedMessage`.
  **Every upload door is the hook (6 Oct 2026, later):** the phone's day (Start here "Upload bookings" + ⋯ →
  Bookings), the Map tab and the Plan board moved onto it; their own parse/input/sheet code is gone, and
  `trip/uploadDoors.test.ts` fails if a host reads /api/confirmations/parse, renders `type="file"` or
  `<ConfirmationPreviewSheet` itself. The hook loads the sheet with `dynamic(reloadOnStale(…))` so the day
  page keeps it out of its bundle (lazySheets.test). Hosts render `upload.element` and their own
  "Reading…" pill from `upload.readingLabel`; a read failure is the hook's toast (the old 4 s pill is gone).
  The Map tab's `onAdded` also takes pins off for deleted ids, so Undo clears them. The picker accepts PDF +
  images only — the old `.eml,.txt` accept was wrong (the parse route rejects them with a 400).
- **The week's empty hour suggests places** (`plan/HourSuggest`): saved first (`lib/plan/hourSuggest`),
  then Google via /api/places/autocomplete with the trip's bias; a Google pick goes through bulk-import.
  Enter with nothing highlighted is still a plain note.
- **Journeys ⋯ Archive and Past journeys' restore** show the one toast with Undo, and say so on failure.

### Taps audit, batch A (6 Oct 2026)
- **Directions remember the app** (`lib/directions`, `ui/NavigationSheet`): Google opens `/maps/dir/` with
  `destination` (lat,lng or address) + `destination_place_id`, no forced travelmode. "Remember my choice" is ON
  by default; the app lives in localStorage `roam:directions-app`, read in an effect. Remembered: the card
  sheet's address opens the app directly, with a quiet "Use Waze instead" / "Use Google Maps instead" under it
  that opens the other once and switches. **The map pin card's directions disc uses it too** (MapPinPopup,
  6 Oct 2026, later): remembered app → straight to the route; none → NavigationSheet, portalled to
  `document.body` because the desktop popup's `transform` would otherwise pin the fixed sheet to the popup.
- **Map search knows what is pinned** (`lib/map/savedPlace`): a result whose Google id is a pin on this journey
  shows a teal filled pin + "On your map"; tapping it goes through `handleSidebarCardSelect`, not the add sheet.
- **A pin on a day says which** (MapPinPopup): "Day N · Tue 25 Aug ›" links to `/trips/<id>/days/<dayId>`
  instead of "Put on a day". Unscheduled pins unchanged.
- **Preview from the add sheet adds to that day**: CreateCardSheet's `onPreviewCard(card, add)` hands over the
  row's own Add; CardBottomSheet `addToDay={{ label, onAdd }}` makes the button "Add to Tue 25 Aug", closes back
  to the sheet (row reads "Added ✓"). Without the prop, "Put on a day" is unchanged.
- **A Google add from the day's add sheet toasts** "Added <place> to <dayLabel>" with Undo (needs `dayLabel` +
  `onCardRemoved`; the Plan board's composer passes neither, so it stays silent). A failed place save toasts.

## The travel leg (7 Oct 2026, mock d13)

- A card is a **leg** when its place is logistics/transit (ferry/train if those sub_types ever exist) AND
  `details.from = { title, lat, lng, google_place_id?, place_id? }` is a real point. The place stays the END
  (pin, photo, directions); `details.mode` is drive|bus|train|ferry, `details.mode_label` optional words
  ("Overland truck", "Border crossing, Malaba") read before the mode's word. No schema change.
  `lib/travel/leg` is the one reader: isTravelLeg, legTitle, legSubtitle, legDurationMins, shouldDrawLine,
  legLines, withFrom, defaultFromForDay.
- Row: title "From → To" in full (a named "A → B" title wins: imported tour legs name the town, the pin sits on
  a gate), subtitle "{mode word} · {duration}" with the mode glyph, time chip stacked start/end.
- Sheet: `components/cards/TravelLegPanel` (From editable via autocomplete → details, no places row written;
  To; mode pills). Shown on every transit card, so a plain transit stop can be given a start. A leg's title is
  not editable (it would rename the end place). Changing From retitles a named leg's A (withFrom).
- Day map: dashed line only for legs >= 60 min (untimed: >= 60 km straight-line; never < 0.5 km), 1.5px,
  opacity 0.4, PIN_COLORS.logistics; a dot at the start, the mode glyph at the middle, fit includes the start.
  The journey Map (FullMapClient) draws them too, through the shared lib/map/legLayer.ts (4df1601, 7 Oct 2026).
- Hand-add: CreateCardSheet holds a station/port pick (no auto-add) to show From, defaulted to the hotel
  covering the night before (stayRuns via defaultFromForDay; useDefaultFrom fetches days + cards once).
- The G Adventures test journey's 63 "<Mode>: A → B" transit cards were converted 7 Oct 2026 (from = the
  previous card's place when it names A, else last night's hotel when it names A, else the previous leg's end).
  The four "around …" loops and "Tour ends in Nairobi" were left as stops.

## Toast placement and the phone-harness tap batch (7 Oct 2026)
- **The toast is a lane + pill:** `fixed inset-x-4` (full width minus 16px gutters, `pointer-events-none`) holding a
  centred `max-w-[420px]` pill. Never `left-1/2 -translate-x-1/2` on a fixed box: it only gets the right half of the
  screen to grow into ("Lisbon tomorrow · 2 still to book" wrapped to four lines).
- **Toasts stand off an open sheet** (phone only): `openSheetTop` (Toast.tsx) asks `elementsFromPoint` at the screen's
  bottom-centre for a `position: fixed` layer at z-60+ and takes the tallest non-full-screen box under it as the panel
  (`offsetHeight`, so slide-in/drag transforms don't matter); `lib/ui/toastPlacement` puts the toast 8px above it, or at
  `top: 8px` when the sheet leaves no room (card sheet 95dvh). Re-measured on a MutationObserver while a toast is up.
  No sheet needs a marker; a new sheet only has to stay at z-60+ and bottom-pinned.
- **Controls that ride ABOVE a sheet are marked `data-toast-clear`** (7 Oct 2026, "delete a pin ... the legend at the
  bottom disappears"): the Map's Filter / Plan my trip / Find row sits 12px over Find's half sheet and the Filter's pills
  grow up from it, so the toast (8px above the sheet) landed on the row for 6 s. `toastClearTop` (Toast.tsx) takes the
  highest marked box's top and `toastPlacement({ clearTop })` stands the toast above it; a closed row low on the screen
  changes nothing. A new floating control near the bottom gets the attribute. Harness: `/dev/phone/map` and `map-one`
  render FullMapClient over real Mapbox tiles (the only screens whose network is on: stub `passHosts`, and phone-check
  lets the Mapbox hosts resolve only when a map screen is in the run).
- **Tap targets left under 44px on purpose:** card-sheet header discs 34×44 (28px discs 6px apart); the card sheet's
  address 17px (4px between the editable title and the time chip); the day header's date 35px when the weather line
  is there (two stacked controls in a 58px header); the shared page's "Tonight: <hotel>" inline link (inside the
  row's own summary, which takes the tap); Mapbox's logo (theirs). `scripts/phone-check.mjs` still lists these.
  Not yet decided: the Add-to-this-day type pills (Activity … Medical) are 26px tall with 8px between rows, so a
  44px target would land on the next row; it needs a spacing call, not an inset.
- **The slim travel leg (7 Oct 2026, mock t05):** card sheet = route title, one quiet "From Lusaka · change" line
  (LegFromLine; the search opens at the top of the body), the address line kept under it (it is the only Directions
  door), the caption once, pills behind "Change how you travel". Hand-add = From only; pills once From is set, none
  picked; no mode means no mode word (legModeWord returns "") and withFrom no longer sets drive. Harness screens:
  card-leg, add-leg (no stay the night before), add-leg-from (last night's stay).

## Copy to new dates (7 Oct 2026, mock t07)
- Doors, owner only: a past journey row's ⋯ (`PastJourneysList`, new `ui/JourneyMenu`, 44px rows), the upcoming
  card's ⋯ (`TripCard owner`), Journey settings' manage row. Sheet: `trip/CopyJourneySheet` (start = same weekday
  52 weeks on, end follows; ages a year older via `agesOn`; switch for saved places, hidden at 0).
- `lib/trips/copyJourney` is the one rule (pure); `POST /api/trips/copy` writes as the user (RLS + explicit owner
  check): trip, days, cards in three statements, and `deleteJourney` on the new trip if days/cards are refused.
  No migration. No share_token, no trip_members, `booking_checklist: {}`, lists not copied (list_id null).
- Copied flights / hotels / rental cars / anything confirmed come back `confirmed: false` with
  `details.to_book = true`; booking-only keys stripped (confirmation, flight_number, seat, paid_*; a "found"
  cost_source with its cost), check_out / check_out_date / end_date / drop_off shifted by the day offset.
  `isToBook(c)` = to_book && !confirmed — the card sheet's Booked switch ends it with no extra write.
  Placeholders never tick Bookings rows or the Settings Bookings lines (selects now read `confirmed`); the Stays
  row names last time's hotel: "11 Howard · 22–25 Jul · book again". CardBadges shows "To book" for them.
- Upload onto a placeholder (`lib/confirmations/fillPlaceholder`): same day + same place (or Google id) → a
  booked card keeps old behaviour (missing time only); an unbooked one takes the booking's times and booking
  keys and loses to_book. Flights prefer the same kind (arrival/departure) at that airport.
- Harness screens: past-menu, copy-sheet, copy-sheet-dates.

## Session recording (Microsoft Clarity, 8 Oct 2026)
- `components/ui/SessionRecorder.tsx` (root layout) loads Clarity project `yuj39nvz5w` via `lib/sessionRecording.ts`.
  Live host only (`roam-roan.vercel.app`), never for Brennan's own emails (incl. `+` aliases), signed-out guests ARE recorded.
  Identify sends the Supabase user id (Clarity hashes it), never the email. Keep Clarity masking on "Balanced" or stricter.
- To stop recording: set `NEXT_PUBLIC_CLARITY_PROJECT_ID=off` in Vercel and redeploy. The privacy page names Clarity; keep them in step.
- Short links for posts live in `next.config.mjs` `redirects()`: /ig, /reddit, /beta → `/?utm_source=…` (307). `src/lib/shortLinks.test.ts` pins them; add a row to both when a new channel gets a link.

## Reverted 8 Oct 2026: phone "one page" day map (do not rebuild without him asking)
Four commits (bbf019a, f532668, cb36b20, 614cef0) opened the journey map in place on the phone's day page, focused it on a day (tap again = whole trip), and tried several pin layouts on the strip and map: merged count pins with a colour ring, a fan-out, side-by-side rows. All reverted at his request the same evening: "we're not going in the right direction at all". What he rejected along the way, in his words: clustering ("it just looks like a huge blob"), pins nudged side by side ("the pins move depending on whether I zoom in and out"), a filled or grey pill for the chosen day ("looks absolutely terrible"), a merged one-row header. The day view, strip and Map screen are back exactly as of 2fbc4c0.

## Front door, first run and the funnel (10 Oct 2026)
- `/` is `components/landing/LandingPage.tsx`: product first, no stock photo (the Amalfi photo page
  of 26 Sep and its 500 KB jpg are gone). Atoms, palette, the three plates and `DEMO_JOURNEY` (the
  public New York page a stranger can read without an account) live in `landingAtoms.tsx`.
  Tagline "The whole trip, in one place." (his "amazing"); subhead is his Instagram bio line;
  "Free. No card." under every Google button. Keep the words matching the bio.
- First sign-in: `components/trips/FirstRunOpen.tsx` opens the Plan a journey overlay once per
  browser session when the account has no journeys (sessionStorage `roam:first-run-form-opened`).
  The Journeys page is still the signed-in landing (26 Sep ruling); this only opens the form over it.
- Funnel counting is in Clarity, not Vercel (Web Analytics is off; his dashboard toggle).
  `lib/funnel.ts`: `funnelEvent` (landing_view, landing_demo, signin_google, signin_email,
  trip_created) and a `source` tag from `utm_source`. Silent when Clarity isn't loaded. Add a
  stage only for a question someone will actually ask.
- The growth audit brief is roam-ship §3f. Not done: Plan my trip inside Start here (needs a
  mock), a return email (no sending domain), pricing (no paywall stays).
- Start here gained a third row, **Plan my trip**, on top (10 Oct 2026): `startSteps` returns `plan`
  = something saved and nothing planned, because the planner works from SAVED places and says
  "Nothing saved to plan yet" on an empty journey. So Find first, then the row flips to Plan my trip.
  Phone: `/map?plan=1` opens the sheet (FullMapClient); week: `roam:open-plan` (WeekMap). Free, not a
  paid tier — his call after the growth lead's case: never gate the aha, charge per trip later, once
  about a third of sign-ups reach a filled trip.
