# Entra ID recipes

All PowerShell assumes an authenticated Graph session — see Step 0 of the skill.
Substitute `$TenantId` with the target tenant. Verify with `(Get-MgContext).TenantId`.

## The two Claude applications

Connecting Claude to Microsoft 365 creates **two** enterprise applications. Both need consent; consenting to only one leaves the connector broken in a confusing way.

| Enterprise application | Application ID | Role |
|---|---|---|
| M365 MCP Server for Claude | `07c030f6-5743-41b7-ba00-0a6e85f37c17` | Holds the delegated Microsoft Graph permissions |
| M365 MCP Client for Claude | `08ad6f98-a4f8-4635-bb8d-f1a3044760f0` | Holds `access_as_user` against the server app |

> These IDs come from public documentation, not from a tenant read. **Verify them against the application ID shown in the actual consent prompt before granting.** If they differ, trust the prompt and stop to investigate — a mismatched app ID is how consent phishing works.

Delegated scopes requested typically include `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `Calendars.Read`, `Calendars.ReadWrite`, `Files.Read.All`, `Files.ReadWrite.All`, `Chat.Read`, `MailboxSettings.ReadWrite`, `User.Read`. Read the prompt for the live list — it changes as the connector gains features.

---

## Recipe A — Grant tenant-wide admin consent

Requires Global Administrator or Privileged Role Administrator. This is a browser flow by design.

```
https://login.microsoftonline.com/{TENANT_ID}/adminconsent?client_id=07c030f6-5743-41b7-ba00-0a6e85f37c17
https://login.microsoftonline.com/{TENANT_ID}/adminconsent?client_id=08ad6f98-a4f8-4635-bb8d-f1a3044760f0
```

For elevateservicegroup.com:

```
https://login.microsoftonline.com/5bfae7fb-2c24-4232-b562-c9dc3ebf16f7/adminconsent?client_id=07c030f6-5743-41b7-ba00-0a6e85f37c17
https://login.microsoftonline.com/5bfae7fb-2c24-4232-b562-c9dc3ebf16f7/adminconsent?client_id=08ad6f98-a4f8-4635-bb8d-f1a3044760f0
```

Or via portal: **Entra admin center → Identity → Applications → Enterprise applications →** select the app **→ Security → Permissions → Grant admin consent for {tenant}**.

**Run recipe B in the same sitting.** Between consent and assignment being required, the connector is open to every licensed user in the tenant.

Verify:

```powershell
foreach ($appId in '07c030f6-5743-41b7-ba00-0a6e85f37c17','08ad6f98-a4f8-4635-bb8d-f1a3044760f0') {
  $sp = Get-MgServicePrincipal -Filter "appId eq '$appId'"
  if (-not $sp) { Write-Warning "Not consented yet: $appId"; continue }
  Write-Host "`n$($sp.DisplayName)  [assignmentRequired=$($sp.AppRoleAssignmentRequired)]"
  Get-MgOauth2PermissionGrant -Filter "clientId eq '$($sp.Id)'" |
    Select-Object ConsentType, PrincipalId, Scope | Format-List
}
```

`ConsentType = AllPrincipals` means tenant-wide consent is in place.

---

## Recipe B — The permission list (restrict to named users)

Two moves: require assignment, then assign. Order matters — flip the switch first, so there is no window where everyone has access.

```powershell
$claudeAppIds = @(
  '07c030f6-5743-41b7-ba00-0a6e85f37c17',   # M365 MCP Server for Claude
  '08ad6f98-a4f8-4635-bb8d-f1a3044760f0'    # M365 MCP Client for Claude
)

# People allowed to use the connector. Add to this list to onboard someone.
$allowedUsers = @(
  'brennan.direnfeld@elevateservicegroup.com'
)

foreach ($appId in $claudeAppIds) {
  $sp = Get-MgServicePrincipal -Filter "appId eq '$appId'"
  if (-not $sp) {
    Write-Warning "$appId has no service principal — grant admin consent (recipe A) first."
    continue
  }

  # 1. Require assignment
  Update-MgServicePrincipal -ServicePrincipalId $sp.Id -AppRoleAssignmentRequired:$true
  Write-Host "Assignment now required: $($sp.DisplayName)"

  # 2. Assign the approved users
  foreach ($upn in $allowedUsers) {
    $user = Get-MgUser -UserId $upn -ErrorAction SilentlyContinue
    if (-not $user) { Write-Warning "No such user: $upn"; continue }

    $already = Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id |
      Where-Object { $_.PrincipalId -eq $user.Id }
    if ($already) { Write-Host "  already assigned: $upn"; continue }

    New-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -BodyParameter @{
      principalId = $user.Id
      resourceId  = $sp.Id
      appRoleId   = [Guid]::Empty.Guid   # default access; these apps expose no app roles
    } | Out-Null
    Write-Host "  assigned: $upn"
  }
}
```

**Prefer a group over a user list** once more than two or three people are involved — then onboarding is a group membership change, not a script edit:

```powershell
$group = New-MgGroup -DisplayName 'Claude M365 Connector Users' `
  -MailEnabled:$false -SecurityEnabled:$true -MailNickname 'claude-m365-users'

# then assign $group.Id as principalId instead of a user id (requires Entra ID P1 for group assignment)
```

Group-based app assignment requires Entra ID P1 or P2. Without those licences, assign users individually — the loop above already does that.

Verify who currently has access:

```powershell
foreach ($appId in $claudeAppIds) {
  $sp = Get-MgServicePrincipal -Filter "appId eq '$appId'"
  Write-Host "`n$($sp.DisplayName) — assignmentRequired=$($sp.AppRoleAssignmentRequired)"
  Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id |
    Select-Object PrincipalDisplayName, PrincipalType, CreatedDateTime | Format-Table
}
```

To remove someone:

```powershell
$sp = Get-MgServicePrincipal -Filter "appId eq '07c030f6-5743-41b7-ba00-0a6e85f37c17'"
$a  = Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id |
        Where-Object { $_.PrincipalDisplayName -eq 'Justin Ralph' }
Remove-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -AppRoleAssignmentId $a.Id
```

Revoking assignment stops new sign-ins. To kill live sessions immediately, also revoke the refresh tokens:

```powershell
Revoke-MgUserSignInSession -UserId 'someone@elevateservicegroup.com'
```

---

## Recipe C — Org-wide user consent policy

**Portal:** Entra admin center → Identity → Applications → Enterprise applications → **Consent and permissions → User consent settings**.

The three options map to `permissionGrantPoliciesAssigned`:

| Portal option | Policy value |
|---|---|
| Do not allow user consent | `@()` |
| Allow user consent for apps from verified publishers, for selected permissions | `ManagePermissionGrantsForSelf.microsoft-user-default-low` |
| Allow user consent for apps | `ManagePermissionGrantsForSelf.microsoft-user-default-legacy` |

Read current state before changing anything:

```powershell
(Get-MgPolicyAuthorizationPolicy).DefaultUserRolePermissions | Format-List
```

Set the middle option — the sane default, and enough to let users self-serve low-risk apps without opening the door completely:

```powershell
Update-MgPolicyAuthorizationPolicy -BodyParameter @{
  defaultUserRolePermissions = @{
    permissionGrantPoliciesAssigned = @('ManagePermissionGrantsForSelf.microsoft-user-default-low')
  }
}
```

Note that this does **not** unblock the Claude connector on its own: the M365 connector requests high-privilege scopes such as `Mail.ReadWrite` and `Mail.Send`, which fall outside the "selected permissions" of the low-risk policy. It will still require admin consent. **Do not loosen this policy expecting it to solve Justin's problem — it will not, and it weakens the tenant.** Use recipe A.

---

## Recipe D — Admin consent workflow

Lets users click "request approval" instead of emailing an admin. Reviewers get a notification and approve or deny in the portal.

**Portal:** Enterprise applications → Consent and permissions → **Admin consent settings** → *Users can request admin consent to apps they are unable to consent to* = **Yes**, then nominate reviewers.

```powershell
$reviewer = Get-MgUser -UserId 'brennan.direnfeld@elevateservicegroup.com'

Update-MgPolicyAdminConsentRequestPolicy -BodyParameter @{
  isEnabled             = $true
  notifyReviewers       = $true
  remindersEnabled      = $true
  requestDurationInDays = 30
  reviewers = @(
    @{
      query     = "/users/$($reviewer.Id)"
      queryType = 'MicrosoftGraph'
    }
  )
}
```

Verify:

```powershell
Get-MgPolicyAdminConsentRequestPolicy | Format-List
```

Pending requests live at: Enterprise applications → **Admin consent requests**.

---

## Recipe E — Consent granted but writes fail

Symptom: reading mail works, sending or modifying does not.

Cause: consent was granted for a narrower scope set than the app now requests — usually because consent was given before a connector update added scopes, or an admin unticked scopes at the prompt.

```powershell
$sp = Get-MgServicePrincipal -Filter "appId eq '07c030f6-5743-41b7-ba00-0a6e85f37c17'"
Get-MgOauth2PermissionGrant -Filter "clientId eq '$($sp.Id)'" |
  Select-Object ConsentType, Scope | Format-List
```

Compare `Scope` against what the connector asks for. If write scopes are missing, re-run recipe A's consent URL — it re-prompts for the current full set. Have the user disconnect and reconnect the connector in Claude afterwards; existing tokens carry the old scopes until refreshed.

---

## Recipe F — "Your organization's access policy blocks the MCP server"

This is **not** a consent problem, and re-granting consent will not fix it. Check, in order:

1. **Assignment** — recipe B is in force and this user is not on the list. Most common cause. Check with recipe B's verify block.
2. **Conditional Access** — a policy targeting this app or all cloud apps is blocking the sign-in. Find the actual failure:

```powershell
Get-MgAuditLogSignIn -Filter "appId eq '07c030f6-5743-41b7-ba00-0a6e85f37c17'" -Top 10 |
  Select-Object CreatedDateTime, UserPrincipalName,
                @{n='Error';e={$_.Status.ErrorCode}},
                @{n='Reason';e={$_.Status.FailureReason}},
                @{n='CA';e={($_.AppliedConditionalAccessPolicies |
                    Where-Object Result -eq 'failure').DisplayName -join ', '}} |
  Format-Table -AutoSize
```

The `CA` column names the policy to look at. Requires `AuditLog.Read.All`.

3. **App blocked outright** — `Get-MgServicePrincipal … | Select AccountEnabled`. If `False`, someone disabled it.

Never disable a Conditional Access policy to fix this. Scope an exclusion for the named users, or report the blocker and let the user decide.
