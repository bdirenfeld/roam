# Brief — Week folding on the Plan board

*For the prompt-writer. Prepared 20 Aug 2026. Decisions below are LOCKED — do not reopen them in the prompt.*

**Design reference:** the published mockup, and its committed copy at `design-reference/long-trip/week-folding.html`. It is a faithful Plan-view mockup on real Tuscany data — build to what it shows.

**Background:** `claude/long-trip-ui-diagnosis.md` (the original problem) and `claude/qa-review-direction-A-prompt.md` (Direction A, now merged).

---

## 1 · Why this exists

Direction A made the long board honest and navigable — visible scrollbar, edge fades, `Jump to day`. It did not restore **overview**: at eleven days you still see about a third of the trip, and at sixty you see a twentieth.

Legs were the obvious answer and were **rejected**: Tuscany 2027, the only long trip actually planned, is eleven days in **one villa**. Legs would give it one leg — a schema migration, a leg editor, and a migration path for every existing trip, to render a single band that says "Tuscany."

What was doing the work in that idea was **collapse**, not naming. Calendar weeks are free — they exist on every trip the moment it has dates, need no schema, and unlike day-folding they do not run out of road: sixty days folds to nine cards.

## 2 · Decisions locked

- **Weeks are Monday–Sunday calendar weeks.** Not trip-relative. The weekday on a card is the weekday you plan around, and an invented "Week 1" starting on a Saturday reads as a bug.
- **Partial weeks at both ends are expected and labelled.** Tuscany renders 2 · 7 · 2. The bar says `part week`; nothing is padded or hidden.
- **Fold state keys off a DAY, not a group.** A week is a set of days folded together. This is the constraint that keeps a future `segments`/legs layer cheap — it becomes a third grouping key over the same state, with weeks as the fallback for trips without legs.
- **State persists in `localStorage`, per trip.** No schema change, no Supabase, no server round-trip.
- **Desktop only.** Mobile Plan renders one day at a time; week folding is meaningless there and must not appear.
- **No stop counts.** Not on the folded card, not on the week bar. Day columns keep their existing header treatment.
- **Folded weeks are not drop targets** in v1. Dragging a card over a folded week does nothing. (Hover-to-open is a logged follow-up, not this prompt.)

## 3 · Scope

**In:**

1. Group day columns into Mon–Sun weeks, with a clickable week bar above each group.
2. Fold a week to a compact card; unfold it back.
3. `Fold all weeks` / `Unfold all` in the existing control row.
4. Persist fold state per trip in `localStorage`.
5. Extend `Jump to day` so it reaches days inside folded weeks.

**Explicitly out:** any `segments`/legs work · mobile · the Agenda view · virtualization · drag-and-drop onto folded weeks · trip-length caps · anything touching Supabase.

## 4 · When week grouping appears

Show week bars only when **the trip is 8 days or longer AND spans more than one calendar week.** Below that the bars are noise — a 4-day trip does not need a container.

Against the real trips: Japan 14d → shown. Tuscany 11d → shown. **Rome 7d → not shown.** New York 4d → not shown.

Flag this rule in the recon report — it's the one number worth a second opinion before building.

## 5 · The structural problem to solve first

**`PlanBoard.tsx` renders the day headers as a separate pinned row, not inside the columns.** Per the 8-June redesign (`06-decisions`), a single pinned day-header row is lifted out of the individual columns and lives as the first `flex-shrink-0` child of the X-scroller, so it pans horizontally in lockstep with the columns and stays pinned vertically with no `position: sticky` and no JS. `DayHeaderCell` mirrors the column width (`md:w-[280px]`) and gap (`md:gap-5`) exactly.

**The mockup does not reproduce this** — it draws headers inside each column, because that was simpler to prototype. Do not copy that. Week grouping has to work *with* the pinned-header architecture:

- The week bar row sits **above** the pinned day-header row. Precisely: the X-scroller has exactly one child, a pad div (`p-4 pb-28 md:px-7 …`), and the header row is that pad div's first `flex-shrink-0` child — not the scroller's. The week-bar row becomes a sibling inside the pad div, above the header row, so all three rows pan together.
- Each week bar must span exactly the width of its member columns: `n × 280px + (n − 1) × 20px`.
- Folding a week must collapse **the header cells and the columns together**, so the two rows never drift out of alignment. This is the single highest-risk part of the build.
- **Do not introduce a `calc()` height constant.** Heights derive from the flex chain off the shell's `md:h-[calc(100dvh-64px)]`. Adding a third row eats vertical space; the scroller's `flex-1` absorbs it. This is the 8-June saga's exact failure site.

## 6 · The two states

### Open — the week bar

Full width of its columns. Contains the date range (Playfair italic, e.g. `6–12 Sep`), then `Week 2` in small caps, plus `· part week` when the week is partial. A **−** sign sits at the right edge in a 20px circle.

**The entire bar is the fold control**, not just the sign — a real `<button>` with a hover state on the bar itself. The sign is an affordance, not the only target. Give the button an `aria-label` ("Fold week 2, 6–12 Sep") since the glyph carries no meaning.

### Folded — the week card

140px wide, **top-aligned with the week bars**, same 8px top padding. Contains: `WEEK 2` small caps with a **+** at the right, the date range in Playfair italic, and the day count (`7 days`). Nothing else — no stop count, no chart, no day list.

**Critical interaction detail — vertical parity only.** The folded card is top-aligned with the week bars and shares their 8px top padding, so it occupies the vertical band the bar vacated. An earlier revision dropped the card 44px lower and left the cursor over blank space — that is the bug this constraint prevents.

**Horizontal parity between the + and the former − is not achievable and is not required.** The − sits at the right edge of a bar up to ~2,080px wide; the folded card is 140px, so the + necessarily lands far to the left. A previous version of this brief claimed fold and unfold were "the same pixel" — that was wrong about its own mockup. Because everything right of a folded week shifts left by up to ~1,940px, a reflexive second click at the same coordinate can land on a *different* week's bar; the prompt handles that separately.

## 7 · `Jump to day` must see through folds

The picker shipped in Direction A. Extend it:

- It lists **every day**, whether its week is open or folded.
- A day whose week is folded is marked `folded` in the row.
- Selecting such a day **unfolds its week first, then scrolls to the column** — reuse the existing rect-delta scroll helper, and let the re-render settle before measuring.

This pairing is what makes folding safe: folding hides days, and the picker guarantees they can always be reached.

## 8 · Gotchas to carry into the prompt

- An inline `style={{...}}` beats any Tailwind utility; use the `!` modifier to override at a breakpoint.
- A global rule authored after `@tailwind utilities` beats an equal-specificity utility on source order.
- Derive height from the flex chain off the one definite anchor. Hand-summed `calc(100dvh - Npx)` is the documented trap.
- Two independent 768px breakpoints exist — `isMobile` (JS) and Tailwind `md:`. Use whichever the surrounding code already uses; do not drift them.
- Dates: follow the existing local-parse pattern (`new Date(date + "T00:00:00")`), which is hydration-safe. Any *is-it-today* comparison stays behind the client-only `todayKey` guard. No new SSR-time `new Date()`.
- `localStorage` must be wrapped — it throws in some contexts and can return stale or absent data. A missing or corrupt value means "nothing folded," never a crash.

## 9 · Acceptance

| Trip | Days | Must be true |
|---|---|---|
| Tuscany `fa33c1cc` | 11 | Three week bars: 4–5 Sep (part), 6–12 Sep, 13–14 Sep (part). Fold each from anywhere on the bar; **+** lands where **−** was |
| Japan `34579915` | 14 | Week bars present; folding keeps header row and columns aligned |
| Rome `338bdff4` | 7 | **No week bars** — below the threshold. Board identical to today |
| New York `d1e7efa9` | 4 | **No week bars.** Board identical to today |

Also:

- Fold state survives a page reload, and is scoped per trip — folding in Tuscany does not affect Japan.
- `Jump to day` reaches a day inside a folded week, unfolds it, and scrolls to it.
- Mobile Plan is completely unchanged — no week bars at any width below 768px.
- The Plan footer (`Add from saved` / `+ Add a card`) still sits correctly at the bottom of each column at 100% zoom on a real laptop viewport, with the extra week-bar row present. **This is the 8-June regression site and the week bar makes it more likely, not less.**
- No new `calc()` constant in the diff.

## 10 · Deliberately unresolved

**Legs/segments remain open and are not pre-empted here.** No `segment` fields, no leg-shaped abstractions, no grouping hooks "for later." The only concession to the future is decision 2's constraint — fold state keys off a day — which costs nothing now and makes legs a grouping key rather than a rewrite when a genuinely multi-base trip finally exists.
