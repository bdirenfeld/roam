---
name: m365-admin
description: Someone asked Brennan for a Microsoft 365 change — app access, a mailbox, a licence, an account. Talk it through, then hand back the single link or short tap-path that DOES it on a phone. Use for any M365 access, permissions, or admin request.
---

# Microsoft 365 change requests

Brennan is on a phone and he is the admin of **elevateservicegroup.com / tficanada.com**, tenant `5bfae7fb-2c24-4232-b562-c9dc3ebf16f7`.

## The rule that makes this skill worth having

**Hand him the action, not an investigation.**

Most of these changes are *idempotent* — doing them when they're already done costs nothing. So don't tell him to go check state and branch on what he finds. He can't read a Graph console on a phone, and neither can you. Just give him the thing that makes the desired state true either way.

> ✗ "Check whether consent is tenant-wide; if it's only yours, open the consent URL."
> ✓ "Open these two links. Now it's tenant-wide regardless of what it was."

Only ask him to look something up when the answer changes *what* he'd do, not merely whether he needs to bother. "It might already be fine" is never a reason to make him look.

State what the action does before he taps it, and say if it's one of the few things that isn't reversible.

## What you cannot do

You have mail, calendar, SharePoint and Teams for his mailboxes. **Nothing that reads or writes Entra** — no consent grants, no app assignments, no user admin. There is no connector for it either; don't go looking again. `pwsh` + `Connect-MgGraph` on a laptop is the only execution path, and it doesn't exist on a phone.

So never say a tenant change was made. He taps; he tells you it's done.

What you *can* do is find things out from mail and files, which is usually the valuable half — who asked, what tenant an address is really in, whether a migration already happened.

## Check the tenant by probing the address, not the domain

**A migrated mailbox keeps its original domain.** `justin@jjamechanicalltd.com` living in the TFI tenant is what a successful migration looks like — the platform moved, the address didn't. Never conclude from the domain that an address is external, and never assume migration means a rename to `@elevateservicegroup.com`.

Probe the actual address with `find_meeting_availability`, alongside a known-good in-tenant control (`spencer.sabo@elevateservicegroup.com`):

- Returns a slot with confidence 100 → in the tenant.
- `AttendeesUnavailableOrUnknown` while the control resolves → not in the tenant.

Probe one address per call; a batch fails as a whole and tells you nothing. If it's not in the tenant, stop — that company's admin owns it. Offer to draft the note he forwards.

Roster spreadsheets are stale by design. The directory wins.

## Actions

**Third-party app blocked / "needs admin approval"** — send the consent link. One tap, admin sign-in, Accept:

```
https://login.microsoftonline.com/5bfae7fb-2c24-4232-b562-c9dc3ebf16f7/adminconsent?client_id=APP_ID
```

The **Claude M365 connector is two apps** and both need it, or it breaks confusingly:
`07c030f6-5743-41b7-ba00-0a6e85f37c17` (server) and `08ad6f98-a4f8-4635-bb8d-f1a3044760f0` (client).

Consent covers the **whole tenant**, not the person who asked. Say that. If it should be limited to some people, follow with the assignment row below — again as an action, not a check.

Before he taps: the application ID on the consent screen should match the link. A mismatch means it isn't the app you think.

| Request | Tap path |
|---|---|
| Let one person use an app | entra.microsoft.com → Enterprise applications → *app* → Users and groups → Add user |
| Limit an app to a list | same screen → Properties → Assignment required = Yes, then add the people |
| Reset a password | Microsoft 365 Admin app → Users → *person* → Reset password |
| Block / unblock an account | Admin app → Users → *person* → Block sign-in |
| Add or remove a licence | Admin app → Users → *person* → Licences |
| Offboard someone | Admin app → Users → *person* → Block sign-in, then Reset password |
| Group or DL membership | admin.microsoft.com → Teams & groups → *group* → Members |
| Shared mailbox access | admin.microsoft.com → Teams & groups → Shared mailboxes → *mailbox* → Members |

The **Microsoft 365 Admin** app (iOS/Android) beats mobile Safari for anything user- or licence-shaped. entra.microsoft.com is browser-only and fiddly — keep those paths to as few taps as you can.

Not on the list? Work out the path. Don't reach for PowerShell.

## Rules

- One person's approval doesn't cover the next. Ask each time.
- Never suggest disabling MFA, Conditional Access, or security defaults. Name the blocker and let him decide.
- Never suggest loosening the tenant-wide user consent policy for one person's access problem — the connector's permissions need admin consent regardless, so it doesn't even work.
- Offer to note what changed, for whom, and who approved it.
