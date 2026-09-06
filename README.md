# Roam

A travel planner for people who actually take the trip. You collect places on a
map, drop them onto days, and end up with an agenda you can follow hour by hour
— with the bookings, the budget and the entry rules attached to it.

Built and run by one person. Live at **https://roam-roan.vercel.app**.

---

## The four screens

| Screen | What it is for |
|---|---|
| **Journeys** | Every journey you have, upcoming first, plus a strip of your year and the ones you have taken. |
| **Agenda** | One day at a time: what you are doing, in order, with the weather, a small map, and the gaps between things. |
| **Plan** | The whole journey as columns — your lists on the left, then every day. Drag a place onto a day. |
| **Map** | Everything you have saved for this journey, filtered by saved or scheduled and by kind. |

## What it does

**Collecting places.** Search anywhere in the world from the map, save what you
like, and it becomes a pin with its photograph, opening hours, rating and price
range. Anything saved can be dropped onto a day later, or never.

**Planning a day.** Cards sit in clock order. Tap the time on a card to set a
start, an end and a length, or one of Morning / Lunch / Afternoon / Evening, or
no time at all. The day re-sorts itself and offers an undo. Free gaps between
things are tappable: "1h free · add".

**Bookings.** Upload a flight or hotel confirmation and Claude reads it into
cards on the right day, with the confirmation number and the file kept on the
card. Every attachment is listed in one place and opens in the app.

**Ideas.** Paste a link from TikTok, Instagram, YouTube or anywhere else. Roam
keeps it, plays it in place, and lets you promote it into a journey as a real
place when you decide to go.

**What it will cost.** The Estimate builds a budget from the journey itself:
flights, nights, meals, car, excursions. It knows the destination's currency,
uses the day's exchange rate, reads prices off attached tickets, and looks up
the ones it cannot find. Every figure is editable and says where it came from.

**Getting in.** For each journey Roam checks what your passports need — visa,
forms, onward ticket, passport validity, government travel advisory — from the
Government of Canada's own pages, and re-checks as the date approaches. Children
travelling without both parents get the consent-letter reminder and the form.

**Sharing.** Invite people by email or by link. A guest sees the journey, its
days, notes and bookings, and nothing else you own. A co-host can edit it.

**On your phone.** Roam installs to the home screen and works offline: what you
change without signal is queued and sent when you are back.

## How it is built

Next.js 14 (App Router) and TypeScript, Tailwind, deployed on Vercel.
Supabase holds the database, sign-in and files. Maps are Mapbox; places,
photos and hours are Google Places; the assistant, the price lookups, the
booking parser and the entry checks are Claude; cover photographs are Unsplash;
invites go through Resend; payment through Stripe.

Sign in with Google or with an email link.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # must pass before anything is pushed
```

Environment variables live in Vercel. The database is in Montréal.

## The rules that matter

Three files carry them, and they are not decoration:

- **`CLAUDE.md`** — every convention and trap learned the hard way: the schema
  truths, what breaks the phone layout, how the sheets and menus behave, why
  the day map stacks pins, why place photos expire after 30 days. Read it
  before changing anything.
- **`AGENTS.md`** — the design brief: colours, type, and the language ("journey",
  never "trip").
- **`~/.claude/skills/roam-ship/SKILL.md`** — how a change ships: build, gate,
  push, verify live, write down what was learned.

Two that are easy to get wrong:

- **Every route that spends money** (Claude, Google, Mapbox, Unsplash) must go
  through `lib/api/guard.ts`: a signed-in user, then a daily allowance per
  person. Five routes once answered anyone on the internet.
- **Row-level security is the only thing standing between users.** Any new
  table needs its policies, and a shared file needs the storage rule *and* the
  table rule. Test both by simulating a guest, not by reading the SQL.

## Where it stands

Small and real: a handful of users, a few thousand cards, one person's family
trips. The work to take it further is written up in the scale audit — published
plans, error tracking, a mail domain — and the code side of that is done.
