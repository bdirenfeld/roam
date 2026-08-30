---
name: m365-admin
description: Give someone access to the Claude Microsoft 365 connector, or take it away. Use when a person hits "admin approval required" connecting Claude to their work mailbox, or when asked who is allowed to use the connector.
---

# Claude M365 connector access

One job: let a named person connect Claude to their work mailbox, and nobody else.

Two settings do it. **Admin consent** turns the connector on for the tenant. **Assignment** limits it to a list of people. Always both — consent alone opens it to everyone in the company.

## 1. Check the tenant is Brennan's

Only an admin of the tenant that owns the mailbox can do this. Brennan administers **elevateservicegroup.com**, tenant `5bfae7fb-2c24-4232-b562-c9dc3ebf16f7`.

If the address is in another domain, check whether it's the same tenant:

```bash
pwsh -NoProfile -Command "Get-MgDomain | Select-Object Id,IsVerified"
```

Not in that list → stop. That company's own admin has to do it. Say so; offer to write them the instructions.

## 2. Check you can actually run commands

```bash
pwsh -NoProfile -Command "Get-MgContext | Format-List Account,TenantId,Scopes"
```

**Empty or `pwsh` missing** → you can't make the change. Give Brennan the commands below and stop. Don't imply anything happened. (Remote Claude Code sessions are always this case.)

**Returns a context** → you can run step 3.

The M365 connector tools (`mcp__*_M365__*`) are mail and calendar only. They cannot change tenant settings. Never say a change was made through them.

Setup, once, on Brennan's own machine:

```bash
pwsh -Command "Install-Module Microsoft.Graph -Scope CurrentUser -Force"
pwsh -Command "Connect-MgGraph -Scopes 'Application.ReadWrite.All','AppRoleAssignment.ReadWrite.All','User.Read.All'"
```

## 3. Grant consent — once per tenant, in a browser

Skip if already done (step 4 will tell you). Brennan opens both URLs as Global Admin:

```
https://login.microsoftonline.com/5bfae7fb-2c24-4232-b562-c9dc3ebf16f7/adminconsent?client_id=07c030f6-5743-41b7-ba00-0a6e85f37c17
https://login.microsoftonline.com/5bfae7fb-2c24-4232-b562-c9dc3ebf16f7/adminconsent?client_id=08ad6f98-a4f8-4635-bb8d-f1a3044760f0
```

Both are needed — they're the two halves of the connector ("M365 MCP Server for Claude" and "M365 MCP Client for Claude"). Consenting to one leaves it broken confusingly.

**Check the application ID on the consent screen matches the URL** before approving. A mismatch means it isn't Anthropic's app — stop.

**Then run step 4 immediately.** Until you do, every licensed user in the tenant can connect.

## 4. Set the access list

Edit `$allowed`, confirm with Brennan who's on it, then run.

```powershell
$allowed = @(
  'brennan.direnfeld@elevateservicegroup.com'
)

foreach ($appId in '07c030f6-5743-41b7-ba00-0a6e85f37c17','08ad6f98-a4f8-4635-bb8d-f1a3044760f0') {
  $sp = Get-MgServicePrincipal -Filter "appId eq '$appId'"
  if (-not $sp) { Write-Warning "Consent not granted yet — do step 3 first."; continue }

  Update-MgServicePrincipal -ServicePrincipalId $sp.Id -AppRoleAssignmentRequired:$true

  foreach ($upn in $allowed) {
    $user = Get-MgUser -UserId $upn -ErrorAction SilentlyContinue
    if (-not $user) { Write-Warning "No such user: $upn"; continue }
    $has = Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id |
             Where-Object PrincipalId -eq $user.Id
    if ($has) { continue }
    New-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -BodyParameter @{
      principalId = $user.Id
      resourceId  = $sp.Id
      appRoleId   = [Guid]::Empty.Guid
    } | Out-Null
  }

  Write-Host "`n$($sp.DisplayName) — restricted to:"
  Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id |
    Select-Object PrincipalDisplayName | Format-Table
}
```

Report the printed list back. Don't call it done on the absence of an error.

## 5. Tell the person to connect

They add the Microsoft 365 connector in Claude and sign in. If Claude asks for permissions it didn't have before, re-run step 3.

## Removing someone

```powershell
$who = 'justin@igcfcm.com'
foreach ($appId in '07c030f6-5743-41b7-ba00-0a6e85f37c17','08ad6f98-a4f8-4635-bb8d-f1a3044760f0') {
  $sp = Get-MgServicePrincipal -Filter "appId eq '$appId'"
  Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id |
    Where-Object PrincipalDisplayName -eq (Get-MgUser -UserId $who).DisplayName |
    ForEach-Object { Remove-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -AppRoleAssignmentId $_.Id }
}
Revoke-MgUserSignInSession -UserId $who   # kills their live session now
```

## If it still doesn't work

**"Needs admin approval"** — consent didn't take. Redo step 3.

**"Your organization's access policy blocks the MCP server"** — not a consent problem. Either they aren't on the list (re-run step 4) or Conditional Access is blocking them. Never turn off Conditional Access or MFA to fix this; report it and let Brennan decide.

## Rules

- Say which setting, on which tenant, affecting whom — then get a yes before changing it.
- Approval for one person is not approval for the next one. Ask each time.
- Never widen the org-wide user consent policy for this. It doesn't help (the connector's permissions need admin consent regardless) and it weakens the tenant.
- Offer to note what changed, for whom, and who approved it.
