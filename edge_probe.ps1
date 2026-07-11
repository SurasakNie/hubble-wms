param(
  # Optional. Supply a real MEMBER (non-admin) employee login to run the
  # "non-admin caller must get 403" checks + the 1G audit-log spoof test.
  [string]$MemberId       = '',
  [string]$MemberPassword = '',
  # Optional. Supply a real ADMIN login to run the malformed-admin-input checks.
  [string]$AdminId        = '',
  [string]$AdminPassword  = '',
  [string]$SupabaseUrl = 'https://sjkggguedgtynktymzes.supabase.co',
  [string]$AnonKey = 'sb_publishable_ZO6nGx_2VNMO9dK_fN72Cg_LlprwmWQ'
)

# Edge Function + CORS probe (audit Phases 1E, 1G, and the A3.1 CORS regression).
# PowerShell-native rewrite of the bash curl block in
# PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md (Windows PS 'curl' is an alias for
# Invoke-WebRequest and does not accept curl's flags, so the packet's bash
# commands cannot be run as-is on Windows).
#
# Credential-free checks (4 input-validation + 14 CORS) run always.
# Member-token checks (6 non-admin-403 + 1 audit spoof) run only if -MemberId/-MemberPassword given.
# Admin-token checks (4 malformed-input) run only if -AdminId/-AdminPassword given.
#
# Usage:
#   ./edge_probe.ps1
#   ./edge_probe.ps1 -MemberId '12-3-456-78' -MemberPassword 'xxx' -AdminId '00-0-000-01' -AdminPassword 'yyy'

$EDGE = "$SupabaseUrl/functions/v1"
$NEW_O = 'https://surasaknie.github.io'
$OLD_O = 'https://he-cells.github.io'

$script:Pass = 0
$script:Fail = 0
$script:Warn = 0
function Pass-Check($m) { Write-Host "  PASS  $m" -ForegroundColor Green; $script:Pass++ }
function Fail-Check($m) { Write-Host "  FAIL  $m" -ForegroundColor Red;   $script:Fail++ }
function Warn-Check($m) { Write-Host "  WARN  $m" -ForegroundColor Yellow; $script:Warn++ }

# Raw request helper: returns @{ status; headers(hashtable); body(string) } for
# both success and 4xx/5xx (PS throws on non-2xx, so failures are caught).
function Invoke-Raw($method, $url, $headers, $body) {
  $p = @{ Uri = $url; Method = $method; Headers = $headers; UseBasicParsing = $true; ErrorAction = 'Stop' }
  if ($null -ne $body) { $p['Body'] = $body; $p['ContentType'] = 'application/json' }
  try {
    $resp = Invoke-WebRequest @p
    $h = @{}; foreach ($k in $resp.Headers.Keys) { $h[$k] = $resp.Headers[$k] }
    return @{ status = [int]$resp.StatusCode; headers = $h; body = $resp.Content }
  } catch {
    $r = $_.Exception.Response
    $status = $null; $h = @{}; $b = ''
    if ($r) {
      try { $status = [int]$r.StatusCode } catch {}
      try { foreach ($k in $r.Headers.Keys) { $h[$k] = $r.Headers[$k] } } catch {}
      try { $sr = New-Object System.IO.StreamReader($r.GetResponseStream()); $b = $sr.ReadToEnd() } catch {}
    }
    return @{ status = $status; headers = $h; body = $b; err = $_.Exception.Message }
  }
}

function Get-Token($id, $pw) {
  $r = Invoke-Raw 'POST' "$EDGE/login" @{} (@{ identifier = $id; password = $pw } | ConvertTo-Json)
  if ($r.status -ge 200 -and $r.status -lt 300 -and $r.body) {
    try { $j = ConvertFrom-Json $r.body; return $j.session.access_token } catch { return $null }
  }
  return $null
}

Write-Host ""
Write-Host "============================================================"
Write-Host " Edge Function + CORS probe (Phases 1E / 1G / CORS regression)"
Write-Host "============================================================"

# ---- 1E credential-free input validation --------------------------------
Write-Host ""
Write-Host "-- 1E input validation (no credentials) --------------------"

# 1. login wrong password (expect 401/400, generic error)
$r1 = Invoke-Raw 'POST' "$EDGE/login" @{} '{"identifier":"99-9-999-99","password":"wrong"}'
if ($r1.status -eq 401 -or $r1.status -eq 400) { Pass-Check "login wrong password -> HTTP $($r1.status)" }
else { Fail-Check "login wrong password -> HTTP $($r1.status) (expected 400/401)" }

# 2. login non-existent ID (expect SAME generic error as #1 - differing = enumeration leak)
$r2 = Invoke-Raw 'POST' "$EDGE/login" @{} '{"identifier":"00-0-000-00","password":"whatever"}'
if ($r2.status -eq $r1.status) {
  if ("$($r1.body)" -eq "$($r2.body)") { Pass-Check "login non-existent ID -> HTTP $($r2.status), identical body to #1 (no user enumeration)" }
  else { Warn-Check "login non-existent ID -> HTTP $($r2.status) but body DIFFERS from #1 - inspect for enumeration leak. #1='$($r1.body)' #2='$($r2.body)'" }
} else { Warn-Check "login non-existent ID -> HTTP $($r2.status) vs #1 HTTP $($r1.status) - differing status may enable enumeration" }

# 3. login oversized payload (expect 400/413, not a 500 crash)
$big = 'A' * 200000
$r3 = Invoke-Raw 'POST' "$EDGE/login" @{} (@{ identifier = '12-3-456-78'; password = $big } | ConvertTo-Json)
if ($r3.status -eq 400 -or $r3.status -eq 413 -or $r3.status -eq 401) { Pass-Check "login oversized payload -> HTTP $($r3.status) (no 500 crash)" }
elseif ($r3.status -ge 500) { Fail-Check "login oversized payload -> HTTP $($r3.status) (server crash - should be 400/413)" }
else { Warn-Check "login oversized payload -> HTTP $($r3.status) (expected 400/413)" }

# 4. provision-users no auth header (expect 401)
$r4 = Invoke-Raw 'POST' "$EDGE/provision-users" @{} '{"employee_ids":["00000000-0000-0000-0000-000000000000"]}'
if ($r4.status -eq 401) { Pass-Check "provision-users no auth -> HTTP 401" }
elseif ($r4.status -eq 403) { Pass-Check "provision-users no auth -> HTTP 403 (also acceptable - denied)" }
else { Fail-Check "provision-users no auth -> HTTP $($r4.status) (expected 401)" }

# ---- CORS regression (A3.1) ---------------------------------------------
Write-Host ""
Write-Host "-- CORS regression: 7 functions x new/old origin ------------"
$fns = @('login','provision-users','admin-reset-password','admin-set-account-active',
         'admin-clear-mfa','account-activation-status','provision-client')
foreach ($fn in $fns) {
  # new origin -> expect ACAO echoing the new origin (or '*')
  $pre = @{ Origin = $NEW_O; 'Access-Control-Request-Method' = 'POST'; 'Access-Control-Request-Headers' = 'authorization,content-type' }
  $rn = Invoke-Raw 'OPTIONS' "$EDGE/$fn" $pre $null
  $acao = $rn.headers['Access-Control-Allow-Origin']
  if ($acao -and ($acao -eq $NEW_O -or $acao -eq '*')) { Pass-Check "$fn new origin -> ACAO '$acao'" }
  elseif ($acao) { Warn-Check "$fn new origin -> ACAO '$acao' (expected $NEW_O or *)" }
  else { Fail-Check "$fn new origin -> no Access-Control-Allow-Origin header (login/admin calls from prod would break)" }

  # old origin -> expect ACAO NOT echoing he-cells
  $preo = @{ Origin = $OLD_O; 'Access-Control-Request-Method' = 'POST' }
  $ro = Invoke-Raw 'OPTIONS' "$EDGE/$fn" $preo $null
  $acaoOld = $ro.headers['Access-Control-Allow-Origin']
  if ($acaoOld -and $acaoOld -like '*he-cells*') { Fail-Check "$fn old origin -> ACAO still echoes '$acaoOld' (remove he-cells from ALLOWED_ORIGINS)" }
  else { Pass-Check "$fn old origin -> not echoed (ACAO '$acaoOld')" }
}

# ---- Member-token checks (optional) -------------------------------------
Write-Host ""
Write-Host "-- 1E non-admin-403 + 1G audit spoof (member token) --------"
if ($MemberId -and $MemberPassword) {
  $MT = Get-Token $MemberId $MemberPassword
  if (-not $MT) {
    Warn-Check "member login failed - could not get a token for -MemberId '$MemberId' (skipping member checks)"
  } else {
    $mh = @{ Authorization = "Bearer $MT" }
    $checks = @(
      @{ n='provision-users';          b='{"employee_ids":["00000000-0000-0000-0000-000000000000"]}' },
      @{ n='admin-reset-password';     b='{"target_user_id":"00000000-0000-0000-0000-000000000000"}' },
      @{ n='admin-set-account-active'; b='{"target_user_id":"00000000-0000-0000-0000-000000000000","active":false}' },
      @{ n='admin-clear-mfa';          b='{"target_user_id":"00000000-0000-0000-0000-000000000000"}' },
      @{ n='account-activation-status';b=$null },
      @{ n='provision-client';         b='{"client_id":"00000000-0000-0000-0000-000000000000","email":"x@x.com","name":"X"}' }
    )
    foreach ($c in $checks) {
      $r = Invoke-Raw 'POST' "$EDGE/$($c.n)" $mh $c.b
      if ($r.status -eq 403 -or $r.status -eq 401) { Pass-Check "$($c.n) as member -> HTTP $($r.status) (denied)" }
      elseif ($r.status -ge 500) { Fail-Check "$($c.n) as member -> HTTP $($r.status) (server crash)" }
      else { Fail-Check "$($c.n) as member -> HTTP $($r.status) (EXPECTED 403 - non-admin must be denied)" }
    }
    # 1G: spoofed actor_id insert into audit_log via PostgREST (expect 403 from WITH CHECK)
    $ah = @{ apikey = $AnonKey; Authorization = "Bearer $MT"; Prefer = 'return=representation' }
    $rg = Invoke-Raw 'POST' "$SupabaseUrl/rest/v1/audit_log" $ah '{"actor_id":"00000000-0000-0000-0000-000000000000","action":"test","entity_type":"test"}'
    if ($rg.status -eq 403 -or ($rg.status -ge 400 -and $rg.status -lt 500)) { Pass-Check "1G audit_log spoofed actor_id -> HTTP $($rg.status) (WITH CHECK rejected)" }
    else { Fail-Check "1G audit_log spoofed actor_id -> HTTP $($rg.status) (EXPECTED 403 - a member forged an audit row)" }
  }
} else {
  Write-Host "  (skipped - pass -MemberId and -MemberPassword to run these 7 checks)" -ForegroundColor DarkGray
}

# ---- Admin-token checks (optional) --------------------------------------
Write-Host ""
Write-Host "-- 1E malformed-input as admin (admin token) ---------------"
if ($AdminId -and $AdminPassword) {
  $AT = Get-Token $AdminId $AdminPassword
  if (-not $AT) {
    Warn-Check "admin login failed - could not get a token for -AdminId '$AdminId' (skipping admin checks)"
  } else {
    $ah = @{ Authorization = "Bearer $AT" }
    $mchecks = @(
      @{ n='provision-users';          b='{}';                                        d='missing employee_ids' },
      @{ n='admin-reset-password';     b='{"target_user_id":"not-a-uuid"}';           d='invalid UUID' },
      @{ n='admin-set-account-active'; b='{"target_user_id":"not-a-uuid","active":false}'; d='invalid UUID' },
      @{ n='provision-client';         b='{"email":"x@x.com","name":"X"}';            d='missing client_id' }
    )
    foreach ($c in $mchecks) {
      $r = Invoke-Raw 'POST' "$EDGE/$($c.n)" $ah $c.b
      if ($r.status -eq 400 -or $r.status -eq 422) { Pass-Check "$($c.n) ($($c.d)) -> HTTP $($r.status)" }
      elseif ($r.status -ge 500) { Fail-Check "$($c.n) ($($c.d)) -> HTTP $($r.status) (server crash - should be 400/422)" }
      else { Warn-Check "$($c.n) ($($c.d)) -> HTTP $($r.status) (expected 400/422; may be OK if the fn validates differently)" }
    }
  }
} else {
  Write-Host "  (skipped - pass -AdminId and -AdminPassword to run these 4 checks)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "============================================================"
Write-Host " Result: $($script:Pass) PASS  $($script:Fail) FAIL  $($script:Warn) WARN"
Write-Host "============================================================"
if ($script:Fail -gt 0) { Write-Host "EDGE PROBE FAIL -- review FAIL items." -ForegroundColor Red; exit 1 }
if ($script:Warn -gt 0) { Write-Host "EDGE PROBE WARN -- review warnings." -ForegroundColor Yellow; exit 0 }
Write-Host "EDGE PROBE PASS." -ForegroundColor Green
exit 0
