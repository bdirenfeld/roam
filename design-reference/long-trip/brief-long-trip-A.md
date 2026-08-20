# Brief — Long-trip navigation (Direction A)

*For the prompt-writer. Prepared 20 Aug 2026. Decisions below are LOCKED — do not reopen them in the prompt.*

**Design reference:** `design-reference/long-trip/long-trip-directions.html` — open it and read Direction A. The boards scroll; the picker and chips are live. Build to what it shows.

**Background:** `claude/long-trip-ui-diagnosis.md` in the project.

---

## 1 · The problem in one paragraph

The **Japan** trip (`34579915-0214-463e-86b4-50d7a2850580`, 2–15 Apr 2028) is 14 days — the first trip past the 4–11 day envelope everything was designed and tested against. Plan-board width is `300N + 36`, so 14 days = **4,236px**, about 2.9 screen-widths at 1440. You see 4.7 of 14 columns, and the X-scroller has `scrollbarWidth: "none"`, so nothing on screen says the other nine days exist. On mobile it's 13 arrow taps from Day 1 to Day 14, and the Day-view chips read `Day 1 … Day 14` with no date, so you can't find the Saturday without tapping through.

## 2 · Decisions locked

- **Direction A only.** Make the existing board honest and navigable. No new structural concepts.
- **Extend the shipped picker, don't invent a control.** The `Day N of M ▾` chip + popover already exists on desktop Day view (`DayViewClient.tsx:702`). It is the pattern. Extract and reuse.
- **This lands on BOTH desktop and mobile.** See the surface matrix in §4.
- **Weeks/legs are OUT.** Direction B (week spine) and Direction C (segments) are deliberately deferred; C is likely next but is not this prompt.
- **One ride-along approved:** the `7-day outlook` label fix. Nothing else.

## 3 · Scope

**In:**

1. Extract the day picker into a shared component.
2. Mount it on the desktop Plan board; it scrolls the board to the chosen day.
3. Mount it on the mobile Plan day-nav header; it switches `mobileDayIdx`.
4. Bound the popover — `max-height` + internal scroll.
5. Make the Plan X-scroller's overflow visible: real scrollbar + conditional edge fades.
6. Mobile Day-view chips carry weekday + date.
7. Fix the hard-coded `7-day outlook` heading.

**Explicitly out:** any `segments`/legs work · week grouping · virtualization/windowing · a cap on trip length at creation · the Open-Meteo >16-day empty state · the mobile Plan dot row (leave it; the picker supersedes it as the jump control, but removing it is a separate call) · any change to card, day, or trip data.

## 4 · Surface matrix — what lands where

| Change | Desktop Plan | Mobile Plan | Desktop Day | Mobile Day |
|---|---|---|---|---|
| Day picker mounted | **new** | **new** | already there | — |
| Popover bounded + scrolls | **new** | **new** | **fix** | — |
| Visible scrollbar + edge fades | **new** | n/a (single-day) | — | — |
| Chips carry weekday + date | — | — | — | **new** |
| `7-day outlook` label | — | — | **fix** | **fix** |

## 5 · File-by-file

### 5.1 New — `src/components/day/DayPicker.tsx`

Extract the popover currently inlined at `DayViewClient.tsx:702-788` into one reusable component. Do **not** copy-paste it into a second place — two copies will drift.

Props: `days`, `activeDayId`, `onSelect(day)`, plus an optional `align` for popover side. Renders the `Day N of M ▾` trigger chip and the popover. Keep the existing visual treatment exactly — Playfair italic day number, `Sat, 15 Apr` primary line, `Day 14` secondary, `#FAF7F2` panel, the current shadow, the active row's white background + hairline ring.

Two behavioural changes while extracting:

- **Bound it.** `max-height: 296px` with `overflow-y: auto`. Today it's `days.map` into an unbounded `w-[280px]` box: at ~40px a row that's 560px at 14 days, 840px at 21, 1,200px at 30 — taller than the viewport, running off the bottom with nothing to scroll. **This is the latent bug; fixing it is a required part of this prompt, not a nicety.**
- **Scroll the active row into view on open** (`block: "nearest"`), so opening on Day 12 of 14 doesn't land you at the top of the list.

Then refactor `DayViewClient` to consume it. Its behaviour must be unchanged — same trigger, same list, same navigation. The only visible difference on Day view is that a long list now scrolls inside the popover.

### 5.2 `src/components/plan/PlanBoard.tsx` — desktop

**Mount the picker.** Add a `shrink-0` control row as a sibling *above* the X-scroller.

Critical structural note, and the reason the 8-June layout saga took seven attempts: the shell's only definite height anchor is `md:h-[calc(100dvh-64px)]` at **line 557**, and every child height derives from the flex chain off it. Line **617** (`flex-1 flex flex-col overflow-hidden`) is the flex column; `DndContext` renders **no DOM wrapper**, so its children are direct flex children of 617. Therefore:

- Insert the control row as a direct child inside the desktop `DndContext`, before the scroller div at **line 709**.
- Give it `shrink-0`. The scroller already has `flex-1` and will absorb the remaining height automatically.
- **Do not add, alter, or hand-sum any `calc()` constant.** If the prompt finds itself computing `100dvh - <something>`, it has gone wrong.

**Make overflow visible.** Line **710** carries `style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}`. Note this is an *inline style object* — an inline style beats any Tailwind utility, so it must be edited at source, not overridden with a class. Replace the hidden scrollbar with a slim visible one (Firefox `scrollbar-width: thin` + `::-webkit-scrollbar` rules; check `globals.css` for the existing `scrollbar-none` utility and put the new styling beside it, remembering that a global rule authored after `@tailwind utilities` wins on source order).

**Edge fades.** Left and right, ~44px, `pointer-events: none`, fading to the board ground. They must be **conditional on actual overflow** — measure `scrollLeft` and `scrollWidth` vs `clientWidth` on scroll and resize. On a 4-day trip the board doesn't overflow and **neither fade may appear**. Note the board background is user-configurable (`BoardBgPicker`); when a photo background is set, a fade to `#FAF7F2` will look wrong — use a transparent-to-ground gradient that works over both, or suppress the fades on photo backgrounds. Flag whichever you choose.

### 5.3 `src/components/plan/PlanBoard.tsx` — mobile

The mobile day-nav header at **line 637** currently shows `Day {n}` + date between two arrows. Make that centre block the `DayPicker` trigger, so tapping it opens the same list and jumps `mobileDayIdx`. Keep the arrows. This is what removes the 13-taps-to-Day-14 problem.

Leave the dot row alone for now.

> If you want this prompt smaller, this sub-section (5.3) is the one to strike — it's the only item that isn't strictly desktop-Plan or a bug fix. Say so and it comes out.

### 5.4 `src/components/day/DayStrip.tsx` — mobile Day view

Chips currently render `Day {day.day_number}` only (line **65**). Add weekday + date as the primary line, day number secondary:

```
Sun 2        ← primary, 10.5px semibold
Day 1        ← secondary, 9px, muted
```

Active-chip treatment, the Today pill, the auto-centre-on-change effect, the right-edge fade and the progress bar all stay exactly as they are. Chips get slightly wider — confirm the strip still scrolls cleanly at 14 days and doesn't wrap.

Mind the hydration trap already handled in this file: `todayKey` is deliberately client-only to dodge the UTC-vs-local mismatch behind React #418/#422. Any new date formatting must follow the same pattern — **do not** introduce a new SSR-time `new Date()`.

### 5.5 `src/components/day/DayViewClient.tsx` — the label

Line **297**: the heading is hard-coded `7-day outlook` but the body is `days.map(...)`, so a 14-day trip renders 14 cells under a label saying 7. Make the label reflect the actual count (`14-day outlook`, or simply `Outlook` — prompt-writer's call, note which).

Do not touch the Open-Meteo fetch or add an empty state for days past the ~16-day forecast horizon. Logged separately.

## 6 · Gotchas to carry into the prompt

- An inline `style={{...}}` beats any Tailwind utility. To override at a breakpoint use the `!` modifier.
- A global CSS rule authored after `@tailwind utilities` beats an equal-specificity utility on source order.
- Prefer deriving height from the flex chain off the one definite anchor. Hand-summed `calc(100dvh - Npx)` constants are the documented trap.
- Two independent 768px breakpoints exist — `isMobile` (JS) and Tailwind `md:`. They're aligned today; don't drift them. Use whichever the surrounding code already uses.
- `place_id: null` means note card; nothing here should assume a card has a place.
- This prompt writes **no data**. If it touches Supabase, it's wrong.

## 7 · Acceptance criteria

Verify on four real trips — long, medium, short, and a short archived one:

| Trip | Days | Must be true |
|---|---|---|
| Japan `34579915` | 14 | Scrollbar visible; both fades behave; picker jumps to any day; popover scrolls internally |
| Tuscany `fa33c1cc` | 11 | Same, with 21 real scheduled cards rendering unchanged |
| Rome `338bdff4` | 7 | Board still overflows slightly; affordances correct, not intrusive |
| New York `d1e7efa9` | 4 | **No overflow → no scrollbar, no fades.** Board looks exactly as it does today |

Also:

- Desktop Day view behaves identically to before, except a 14-item popover now scrolls instead of overrunning the viewport.
- No new `calc()` constant anywhere in the diff.
- The Plan footer (`Add from saved` / `+ Add a card`) still sits correctly at the bottom of each column with no overlap at 100% zoom on a real laptop — this is the exact regression the 8-June saga produced, so it must be checked on a real viewport, **not** through the Chrome plugin, whose viewport is too tall to be trusted for fit and overlap.
- No React #418/#422 hydration warnings introduced.

## 8 · Deliberately unresolved

**Direction C (legs/segments) is the likely next move and is not decided.** Nothing in this prompt should pre-empt it — no leg-shaped abstractions, no `segment` fields, no grouping hooks "for later." A is meant to stand on its own and stay useful even if C lands on top of it.
