param(
  # Employee ID (e.g. 02-3-003-56) OR email - same identifier the login screen takes.
  [Parameter(Mandatory = $true)][string]$Identifier,
  [Parameter(Mandatory = $true)][string]$Password,
  [string]$SupabaseUrl = 'https://sjkggguedgtynktymzes.supabase.co',
  [string]$AnonKey = 'sb_publishable_ZO6nGx_2VNMO9dK_fN72Cg_LlprwmWQ'
)

# Team-visibility scope probe (20260713_team_visibility_scoping.sql).
# Logs in as a MEMBER or MANAGER via the app's login Edge Function (so an
# Employee ID works, not just an email) and checks the scoped profiles policy:
#   member  -> a subset of staff, and ZERO client-role rows (hard fail if any)
#   manager -> subset + possibly some client rows (its project-clients; reported)
# "Only same group" is eyeballed against the roster (the probe can't know groups).
#
# ASCII only (Windows PowerShell 5.1 reads .ps1 as ANSI).
# Usage: ./team_scope_probe.ps1 -Identifier '02-3-003-56' -Password 'pw'

$script:Pass = 0; $script:Fail = 0; $script:Warn = 0
function Pass-Check($m) { Write-Host "  PASS  $m" -ForegroundColor Green; $script:Pass++ }
function Fail-Check($m) { Write-Host "  FAIL  $m" -ForegroundColor Red;   $script:Fail++ }
function Warn-Check($m) { Write-Host "  WARN  $m" -ForegroundColor Yellow; $script:Warn++ }

Write-Host ""
Write-Host "============================================================"
Write-Host " Team-visibility scope probe"
Write-Host "============================================================"
Write-Host "Logging in as: $Identifier"

# Authenticate through the app's login Edge Function (accepts Employee ID or email).
try {
  $login = Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/login" -Method POST `
    -Headers @{ 'Content-Type' = 'application/json' } `
    -Body (@{ identifier = $Identifier; password = $Password } | ConvertTo-Json)
} catch {
  Write-Host "LOGIN FAILED: $($_.Exception.Message)" -ForegroundColor Red; exit 2
}
$tok = $login.session.access_token
if (-not $tok) { Write-Host "LOGIN returned no session (bad credentials?)" -ForegroundColor Red; exit 2 }

$H = @{ apikey = $AnonKey; Authorization = "Bearer $tok" }

# Resolve the caller's user id from the token.
try {
  $who = Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/user" -Headers $H -Method GET
  $uid = $who.id
} catch { Write-Host "Could not resolve user id: $($_.Exception.Message)" -ForegroundColor Red; exit 2 }
Write-Host "Auth OK -- user_id: $uid" -ForegroundColor Green

function Get-Json($path) {
  try {
    $r = Invoke-WebRequest -Uri "$SupabaseUrl/rest/v1/$path" -Headers $H -Method GET -UseBasicParsing -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($r.Content)) { return @() }
    return @(ConvertFrom-Json $r.Content)
  } catch { Write-Host "  (request error: $($_.Exception.Message))" -ForegroundColor DarkGray; return @() }
}

# Own role
$me = Get-Json "profiles?id=eq.$uid&select=id,role,name"
$role = if ($me.Count -ge 1) { $me[0].role } else { '?' }
Write-Host "-- Caller role: $role"
Write-Host ""

# All profiles this session can SELECT
$rows = Get-Json 'profiles?select=id,name,role,client_id&order=role'
$total = @($rows).Count
$byRole = @{}
foreach ($r in $rows) { $k = "$($r.role)"; if ($byRole.ContainsKey($k)) { $byRole[$k]++ } else { $byRole[$k] = 1 } }

Write-Host "-- profiles visible to this session: $total row(s)"
foreach ($k in ($byRole.Keys | Sort-Object)) { Write-Host ("       {0,-8} {1}" -f $k, $byRole[$k]) }
Write-Host ""

$clientCount = @($rows | Where-Object { $_.role -eq 'client' }).Count

switch ($role) {
  'member' {
    if ($clientCount -eq 0) { Pass-Check "member sees 0 client rows" }
    else { Fail-Check "member sees $clientCount client row(s) (EXPECTED 0 -- members must not see clients)" }
    if ($total -ge 1) { Pass-Check "member sees $total staff row(s) (verify these are only same-group colleagues)" }
    else { Warn-Check "member sees 0 rows (not even self? unexpected)" }
    Warn-Check "MANUAL: confirm every visible staff row shares a group with this member (probe can't know your groups)"
  }
  'manager' {
    Pass-Check "manager sees $total row(s); $clientCount client row(s)"
    if ($clientCount -gt 0) {
      Write-Host "       client rows visible (must all be on THIS manager's projects):" -ForegroundColor Yellow
      foreach ($r in ($rows | Where-Object { $_.role -eq 'client' })) { Write-Host "         $($r.name)  client_id=$($r.client_id)" }
    }
    Warn-Check "MANUAL: confirm staff rows are same-group/direct-reports and client rows are only this manager's project-clients"
  }
  default {
    Warn-Check "caller role '$role' is not member/manager -- run this probe with a member and a manager login (admins/owners see all by design)"
  }
}

Write-Host ""
Write-Host "============================================================"
Write-Host " Result: $($script:Pass) PASS  $($script:Fail) FAIL  $($script:Warn) WARN"
Write-Host "============================================================"
if ($script:Fail -gt 0) { Write-Host "SCOPE PROBE FAIL" -ForegroundColor Red; exit 1 }
Write-Host "SCOPE PROBE OK (review WARN/manual items)" -ForegroundColor Green
exit 0
