---
name: m365-admin
description: Talk through a requested change to the Microsoft 365 tenant — app access, mailboxes, licences, accounts — decide whether it makes sense, then hand back an action Brennan can tap through on his phone. Use whenever someone asks for M365 access, permissions, or an admin change.
---

# Microsoft 365 change requests

Someone asked Brennan for something that needs an admin. This skill is the conversation about it, ending in something he can do on a phone in under a minute.

**Assume phone unless told otherwise.** The deliverable is a link to tap or a short path through the admin app — never a PowerShell script. If a change genuinely can't be done on mobile, say that instead of handing over commands he can't run.

Brennan is the admin of **elevateservicegroup.com**, tenant `5bfae7fb-2c24-4232-b562-c9dc3ebf16f7`.

## Talk it through first

Four questions, in order. Answer them in the reply — briefly, not as a form.

**1. Is it his to change?** Only an admin of the tenant that owns the account can do anything. If the address is a domain outside elevateservicegroup.com — a partner company, a client, a university — it's their admin's job. Say so early; the rest of the conversation is moot. Offer to draft the note he forwards them.

**2. What does it actually open up?** Say who gets access to what, in plain terms. "Read and send mail as any user who connects it" is useful. "Grants Mail.ReadWrite" is not. If it's a change to the whole tenant rather than one person, say that loudly — that's the difference between a favour and a policy.

**3. Is there a narrower version?** Usually yes, and usually it's the right answer: one person instead of everyone, read instead of write, a group he can remove someone from later. Offer it. If the narrow version is more taps, say so and let him pick.

**4. Can he undo it?** Some changes are a toggle. Some — consenting to an app, deleting a mailbox — aren't cleanly reversible. Say which this is before he taps.

Then give a recommendation. Not a menu of options: say what you'd do and why. He can overrule it.

## Then hand him the tap path

Give the smallest number of taps that gets it done, in order, with the real button names. Two entry points cover almost everything:

- **admin.microsoft.com** — people, licences, mailboxes, groups. Also the **Microsoft 365 Admin** app (iOS/Android), which is better than the mobile browser for anything user-related.
- **entra.microsoft.com** — apps, sign-ins, who's allowed to use what. Mobile browser only; workable but fiddly.

Common ones:

| Request | Phone action |
|---|---|
| Reset someone's password | Admin app → Users → *person* → Reset password |
| Unblock / block an account | Admin app → Users → *person* → Block sign-in |
| Add or remove a licence | Admin app → Users → *person* → Licences |
| Offboard someone | Admin app → Users → *person* → Block sign-in, then reset password |
| Add someone to a group or DL | admin.microsoft.com → Teams & groups → *group* → Members |
| Give access to a shared mailbox | admin.microsoft.com → Teams & groups → Shared mailboxes → *mailbox* → Members |
| Third-party app needs admin approval | Admin consent link — see below |
| Stop an app being used by everyone | entra.microsoft.com → Enterprise applications → *app* → Properties → Assignment required = Yes, then Users and groups → add only the approved people |
| Who currently has access to an app | entra.microsoft.com → Enterprise applications → *app* → Users and groups |

If a request isn't on this list, work out the path rather than reaching for PowerShell. Almost everything user- or licence-shaped is in the admin app.

## App consent — the one that comes up most

An app asking for tenant access is approved by opening one URL, signing in as admin, and tapping Accept. Works fine on a phone.

```
https://login.microsoftonline.com/5bfae7fb-2c24-4232-b562-c9dc3ebf16f7/adminconsent?client_id=APP_ID
```

Before sending it: **check the application ID on the consent screen matches the one in the link.** A mismatch means it isn't the app you think it is.

Two things worth saying every time this comes up:

- Consent applies to the **whole tenant**, not the person who asked. If it should only be some people, follow with the assignment row in the table above — otherwise everyone can connect it.
- The **Claude M365 connector is two apps**, and both need consent or it breaks in a confusing way: `07c030f6-5743-41b7-ba00-0a6e85f37c17` (server) and `08ad6f98-a4f8-4635-bb8d-f1a3044760f0` (client).

## Rules

- One person's approval doesn't cover the next person. Ask each time.
- Never suggest turning off MFA, Conditional Access, or security defaults to make something work. Say what's blocking it and let him decide.
- Never suggest loosening the tenant-wide user consent policy to solve one person's access problem. It usually doesn't even work, and it weakens everything.
- Don't claim a change happened. These tools read mail and calendar; they can't touch tenant settings. He taps, then tells you it's done.
- Offer to note what changed, for whom, and who approved it.
