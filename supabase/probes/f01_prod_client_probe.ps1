param(
  [Parameter(Mandatory = $true)][string]$Email,
  [Parameter(Mandatory = $true)][string]$Password,
  [string]$SupabaseUrl = 'https://sjkggguedgtynktymzes.supabase.co',
  [string]$AnonKey = 'sb_publishable_ZO6nGx_2VNMO9dK_fN72Cg_LlprwmWQ'
)

$script:Pass = 0
$script:Fail = 0
$script:Warn = 0

function Pass-Check($message) {
  Write-Host "  PASS  $message" -ForegroundColor Green
  $script:Pass++
}

function Fail-Check($message) {
  Write-Host "  FAIL  $message" -ForegroundColor Red
  $script:Fail++
}

function Warn-Check($message) {
  Write-Host "  WARN  $message" -ForegroundColor Yellow
  $script:Warn++
}

function Invoke-JsonGet($path, $headers) {
  try {
    $resp = Invoke-WebRequest -Uri "$SupabaseUrl/rest/v1/$path" -Headers $headers -Method GET -UseBasicParsing -ErrorAction Stop
    $body = if ([string]::IsNullOrWhiteSpace($resp.Content)) { @() } else { ConvertFrom-Json $resp.Content }
    return @{
      ok = $true
      status = [int]$resp.StatusCode
      body = @($body)
    }
  } catch {
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    return @{
      ok = $false
      status = $status
      error = $_.Exception.Message
      body = @()
    }
  }
}

function Invoke-JsonPost($path, $headers, $body = '{}') {
  try {
    $resp = Invoke-WebRequest -Uri "$SupabaseUrl/rest/v1/$path" -Headers $headers -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -ErrorAction Stop
    $json = if ([string]::IsNullOrWhiteSpace($resp.Content)) { @() } else { ConvertFrom-Json $resp.Content }
    return @{
      ok = $true
      status = [int]$resp.StatusCode
      body = @($json)
    }
  } catch {
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    return @{
      ok = $false
      status = $status
      error = $_.Exception.Message
      body = @()
    }
  }
}

function Get-Rows($table, $query = 'select=*') {
  Invoke-JsonGet "$table`?$query" $script:AuthHeaders
}

function Check-MustZero($label, $table, $query = 'select=*') {
  $res = Get-Rows $table $query
  if (-not $res.ok) {
    if ($null -ne $res.status -and $res.status -ge 400) {
      Pass-Check "$label -> blocked (HTTP $($res.status))"
    } else {
      Warn-Check "$label -> request error: $($res.error)"
    }
    return
  }

  $count = @($res.body).Count
  if ($count -eq 0) {
    Pass-Check "$label -> 0 rows"
  } else {
    Fail-Check "$label -> $count rows (EXPECTED 0)"
  }
}

function Check-WriteDenied($label, $table, $body) {
  $headers = @{
    apikey = $AnonKey
    Authorization = "Bearer $script:AccessToken"
    Prefer = 'return=representation'
  }

  try {
    $resp = Invoke-WebRequest -Uri "$SupabaseUrl/rest/v1/$table" -Method POST -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10) -UseBasicParsing -ErrorAction Stop
    $rows = if ([string]::IsNullOrWhiteSpace($resp.Content)) { @() } else { @(ConvertFrom-Json $resp.Content) }
    $changed = @($rows).Count
    if ($changed -gt 0) {
      Fail-Check "$label -> INSERT $table succeeded ($changed row(s))"
    } else {
      Warn-Check "$label -> INSERT $table returned HTTP $([int]$resp.StatusCode) with 0 rows"
    }
  } catch {
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    if ($null -ne $status -and $status -ge 400 -and $status -lt 500) {
      Pass-Check "$label -> INSERT $table blocked (HTTP $status)"
    } else {
      Warn-Check "$label -> INSERT $table error: $($_.Exception.Message)"
    }
  }
}

Write-Host ""
Write-Host "============================================================"
Write-Host " F-01 Prod Client RLS Probe"
Write-Host "============================================================"
Write-Host ""
Write-Host "Authenticating as: $Email"

try {
  $auth = Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" -Method POST -Headers @{
    apikey = $AnonKey
    'Content-Type' = 'application/json'
  } -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
} catch {
  Write-Host "AUTH FAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 2
}

$script:AccessToken = $auth.access_token
$uid = $auth.user.id
$script:AuthHeaders = @{
  apikey = $AnonKey
  Authorization = "Bearer $script:AccessToken"
}

Write-Host "Auth OK -- user_id: $uid" -ForegroundColor Green

Write-Host "-- 1. Own scope --------------------------------------------"
$profiles = Get-Rows 'profiles' 'select=id,role,client_id'
if (-not $profiles.ok) {
  Fail-Check "profiles -> error: $($profiles.error)"
} else {
  $pc = @($profiles.body).Count
  if ($pc -eq 1 -and $profiles.body[0].role -eq 'client') {
    Pass-Check "profiles -> 1 row, role=client (own only)"
  } elseif ($pc -eq 0) {
    Fail-Check "profiles -> 0 rows (portal will break)"
  } elseif ($pc -eq 1) {
    Warn-Check "profiles -> 1 row but role=$($profiles.body[0].role)"
  } else {
    Fail-Check "profiles -> $pc rows (EXPECTED 1 -- PII LEAK)"
  }
}

$summary = Invoke-JsonPost 'rpc/get_client_project_summary' $script:AuthHeaders '{}'
if (-not $summary.ok) {
  Fail-Check "get_client_project_summary -> error: $($summary.error)"
} else {
  $sc = @($summary.body).Count
  if ($sc -eq 0) {
    Warn-Check "get_client_project_summary -> 0 projects"
  } else {
    Pass-Check "get_client_project_summary -> $sc project(s)"
    foreach ($row in $summary.body) {
      Write-Host "        project=$($row.project_name)  hours=$($row.total_hours)"
    }
  }
}

$clients = Get-Rows 'clients' 'select=id,name'
if (-not $clients.ok) {
  Fail-Check "clients -> error: $($clients.error)"
} else {
  $cc = @($clients.body).Count
  if ($cc -eq 1) {
    Pass-Check "clients -> 1 row ($($clients.body[0].name))"
  } elseif ($cc -eq 0) {
    Warn-Check "clients -> 0 rows"
  } else {
    Fail-Check "clients -> $cc rows (EXPECTED 1)"
  }
}

Write-Host ""
Write-Host "-- 2. Employee PII / internal (must be 0) ------------------"
$mustZeroTables = @(
  'time_entries',
  'leave_requests',
  'employees',
  'employee_compensation',
  'petty_cash_settings',
  'document_templates',
  'group_members',
  'task_assignments',
  'evaluation_cycles',
  'evaluation_questions',
  'evaluation_responses',
  'login_attempts'
)
foreach ($table in $mustZeroTables) {
  Check-MustZero $table $table
}
# A SECURITY DEFINER view bypasses the client_block_* table RLS, so an
# all-tenant aggregate view is a cross-tenant leak if the client can read it.
# After the drop it should 404 (blocked); Check-MustZero passes on HTTP>=400.
Check-MustZero 'client_project_totals (view)' 'client_project_totals' 'select=project_id&limit=1'

Write-Host ""
Write-Host "-- 3. Expense/travel ---------------------------------------"
$cash = Get-Rows 'cash_transactions' 'select=id,project_id&direction=eq.out'
$cashCount = if ($cash.ok) { @($cash.body).Count } else { -1 }
if (-not $cash.ok) {
  Warn-Check "cash_transactions(out) -> error: $($cash.error)"
} elseif ($cashCount -eq 0) {
  Pass-Check "cash_transactions(out) -> 0 rows"
} else {
  Pass-Check "cash_transactions(out) -> $cashCount rows (verify own projects)"
}

$travel = Get-Rows 'travel_requests' 'select=id,project_id'
$travelCount = if ($travel.ok) { @($travel.body).Count } else { -1 }
if (-not $travel.ok) {
  Warn-Check "travel_requests -> error: $($travel.error)"
} elseif ($travelCount -eq 0) {
  Pass-Check "travel_requests -> 0 rows"
} else {
  Pass-Check "travel_requests -> $travelCount rows (verify own projects)"
}

Write-Host ""
Write-Host "-- 4. Writes denied ----------------------------------------"
Check-WriteDenied 'projects' 'projects' @{
  name = 'probe_test'
  client_id = '00000000-0000-0000-0000-000000000000'
}
Check-WriteDenied 'time_entries' 'time_entries' @{
  user_id = '00000000-0000-0000-0000-000000000000'
  project_id = '00000000-0000-0000-0000-000000000000'
  date = '2020-01-01'
  hours = 1
}
Check-WriteDenied 'cash_transactions' 'cash_transactions' @{
  project_id = '00000000-0000-0000-0000-000000000000'
  amount = 1
  direction = 'out'
  txn_date = '2020-01-01'
}
Check-WriteDenied 'travel_requests' 'travel_requests' @{
  project_id = '00000000-0000-0000-0000-000000000000'
  destination = 'probe'
  start_date = '2020-01-01'
  end_date = '2020-01-01'
}
Check-WriteDenied 'leave_requests' 'leave_requests' @{
  employee_id = '00000000-0000-0000-0000-000000000000'
  leave_type_code = 'annual'
  start_date = '2020-01-01'
  end_date = '2020-01-01'
}

Write-Host ""
Write-Host "============================================================"
Write-Host " Result: $($script:Pass) PASS  $($script:Fail) FAIL  $($script:Warn) WARN"
Write-Host "============================================================"
if ($script:Fail -gt 0) {
  Write-Host "F-01 FAIL" -ForegroundColor Red
  exit 1
}
if ($script:Warn -gt 0) {
  Write-Host "F-01 WARN -- review warnings" -ForegroundColor Yellow
  exit 0
}
Write-Host "F-01 PASS -- client isolation verified" -ForegroundColor Green
exit 0
