---
name: m365-admin
description: Diagnose and apply Microsoft 365 / Entra ID tenant settings — especially granting admin consent for the Claude M365 connector and restricting it to an approved list of users. Use when someone asks to connect Claude (or another third-party app) to a Microsoft 365 mailbox and hits "admin approval required", or when asked to change app consent policy, enterprise app assignment, or who is allowed to use a connector.
---

# Microsoft 365 tenant administration

This skill turns a request like *"Justin wants Claude connected to his mailbox"* into: the exact setting that is blocking it, the exact change to make, and a runnable command — then applies it if this session can, or hands it over cleanly if it cannot.

## Step 0 — Establish whether you can execute (do this first, every time)

**You cannot change tenant settings through the M365 connector.** The `mcp__*_M365__*` tools are user-delegated Graph tools scoped to mail, calendar, SharePoint and Teams for one mailbox. They contain no identity-management surface — no `servicePrincipal`, `oauth2PermissionGrant`, `appRoleAssignment`, or `authorizationPolicy` write. Never claim a tenant change was made through them.

There is exactly one execution path: **Microsoft Graph PowerShell over Bash.** Probe for it before promising anything:

```bash
pwsh -NoProfile -Command "Get-MgContext | Format-List Account,TenantId,Scopes" 2>&1
```

- **Returns a context with the scopes below** → you can execute. Proceed to Step 3 and run the change.
- **`pwsh` missing, or context is empty/wrong tenant** → you are in advise mode. Produce the diagnosis and the exact script, tell the user which of the two setup commands to run, and stop. Do not pretend.

Remote/sandboxed sessions (Claude Code on the web) will almost always be advise mode: no tenant credential, and login.microsoftonline.com is usually blocked by egress. That is fine — the diagnosis and script are the deliverable there.

To get into execute mode the user runs, once, on a machine where they are the admin:

```bash
pwsh -Command "Install-Module Microsoft.Graph -Scope CurrentUser -Force"
pwsh -Command "Connect-MgGraph -Scopes 'Application.ReadWrite.All','AppRoleAssignment.ReadWrite.All','Policy.ReadWrite.Authorization','User.Read.All','Group.ReadWrite.All'"
```

## Step 1 — Identify the tenant, and say so out loud

**Every setting here is per-tenant, and only an admin of *that* tenant can change it.** This is the single most common way this request goes wrong: someone asks you to enable Claude for an address in a domain the user does not administer.

Before doing anything, name the tenant that owns the mailbox in question. Brennan administers **elevateservicegroup.com**, tenant ID `5bfae7fb-2c24-4232-b562-c9dc3ebf16f7` (verify with `(Get-MgContext).TenantId`).

If the mailbox is in a different domain — a partner company, a university, a client — check whether it is a domain of the same tenant:

```bash
pwsh -NoProfile -Command "Get-MgDomain | Select-Object Id,IsVerified,IsDefault"
```

If it is not in that list, stop and say so plainly: that tenant's own admin has to make the change, and you can give them the identical instructions to forward. Do not guess that two companies share a tenant because one person works with both.

## Step 2 — Diagnose which setting is actually blocking

Match the symptom, then apply the matching recipe from `references/entra-recipes.md`. Prefer the narrowest change that unblocks the person.

| Symptom | Blocking setting | Recipe |
|---|---|---|
| "Need admin approval" / "admin has not consented" on first connect | The Claude apps have no tenant-wide admin consent | **A** |
| Consent granted, but you want only certain people to use it | `Assignment required` is No on the enterprise apps | **B** |
| Users cannot consent to *any* third-party app | Tenant user-consent policy is "Do not allow" | **C** |
| Users keep emailing you for approvals one at a time | Admin consent workflow is off | **D** |
| Connected, but writes fail / only reads work | Consent granted for a narrower scope set than requested | **E** |
| "Your organization's access policy blocks the MCP server" | Conditional Access or app-specific block, not consent | **F** |

**The default answer for "person X wants Claude on their work mailbox" is A + B together.** Recipe A grants the tenant consent once; recipe B is the permission list — it flips the apps to require assignment and then admits only named people. A without B silently opens the connector to everyone in the tenant, which is almost never what was asked for.

## Step 3 — Propose, confirm, then apply

These changes are tenant-wide, outward-facing, and affect other people's access to company mail. So:

1. **State the change in one sentence before making it** — which setting, on which tenant, affecting whom. Name the blast radius: recipe A grants a third-party app delegated access to mail, calendar, files and chat for every user who connects it; recipe C changes the consent posture for the entire organization.
2. **Get explicit confirmation for that specific change.** Approval to enable Claude for Justin is not approval to loosen the org-wide consent policy. Ask again when the scope widens.
3. **Apply it**, then **verify by reading the state back** — never report success from the absence of an error.
4. **Report what actually changed**, including anything you skipped.

Recipe C (org-wide user consent) is the one to be most careful with — it is the setting most likely to be quietly loosened and never tightened again. Recommend A + B instead unless the user explicitly wants the global change.

## Step 4 — Tell the user what they must do by hand

Admin consent itself is a browser flow — it cannot be fully scripted, and it should not be. Always end by handing over:

- The admin consent URLs for both Claude apps (see recipe A), with the tenant ID filled in.
- What the person requesting access does next: reconnect the connector in Claude, and re-consent if new scopes appear.

## Ground rules

- **Least privilege by default.** Narrow app-specific consent beats a loosened global policy, every time.
- **Verify the app before consenting.** Confirm the publisher and application ID in the consent prompt match what is written in the recipes. The IDs there were gathered from public documentation, not from this tenant — treat a mismatch as a stop sign and re-derive them from the actual consent prompt.
- **Never grant application (app-only) permissions** where delegated will do. Delegated access is bounded by what the signed-in user can already see; app-only permissions read every mailbox in the tenant.
- **Never disable Conditional Access, MFA, or security defaults** to make a connector work. If CA is the blocker, scope an exclusion narrowly and say exactly what was excluded — or leave it and report it.
- **Log it.** After any change, offer to note what was changed, for whom, who approved it, and when. These are the changes an auditor asks about.
