param(
  [string]$SupabaseUrl = 'https://sjkggguedgtynktymzes.supabase.co',
  [string]$AnonKey = 'sb_publishable_ZO6nGx_2VNMO9dK_fN72Cg_LlprwmWQ'
)

# Anon RLS Probe
# Verifies that a completely unauthenticated caller (no login at all — just the
# public anon/publishable key, the same one already shipped in the frontend)
# cannot read any internal table or execute any privileged RPC.
#
# Reconstructed 2026-07-11: the previously-referenced `anon_probe.scratch.ps1`
# was never actually committed to this repo (always described as "local,
# gitignored") and its source audit doc (AUDIT_2026-06-11_GOLIVE.md) is also
# absent from every checkout — that reference had been pointing at nothing for
# several rounds. This version's table/RPC list is derived directly from
# `grep -rohE ".from\('[a-z_]+'\)" js/` and `grep -rohE ".rpc\('[a-z_]+'" js/`
# against the actual app code, plus 4 known schema objects the client never
# queries directly (pn_counters, login_attempts, pn_item_snapshot,
# pn_render_template — all server-side-only, but must still deny anon).
#
# Usage:
#   ./anon_probe.ps1

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

$Headers = @{
  apikey        = $AnonKey
  Authorization = "Bearer $AnonKey"
}

function Get-Rows($table, $query = 'select=id') {
  try {
    $resp = Invoke-WebRequest -Uri "$SupabaseUrl/rest/v1/$table`?$query" -Headers $Headers -Method GET -UseBasicParsing -ErrorAction Stop
    $body = if ([string]::IsNullOrWhiteSpace($resp.Content)) { @() } else { @(ConvertFrom-Json $resp.Content) }
    return @{ ok = $true; status = [int]$resp.StatusCode; body = $body }
  } catch {
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    return @{ ok = $false; status = $status; error = $_.Exception.Message; body = @() }
  }
}

function Check-AnonZero($table, $query = 'select=id') {
  $res = Get-Rows $table $query
  if (-not $res.ok) {
    if ($null -ne $res.status -and $res.status -ge 400) {
      Pass-Check "$table -> blocked (HTTP $($res.status))"
    } else {
      Warn-Check "$table -> request error: $($res.error)"
    }
    return
  }
  $count = @($res.body).Count
  if ($count -eq 0) {
    Pass-Check "$table -> 0 rows"
  } else {
    Fail-Check "$table -> $count rows visible to anon (EXPECTED 0)"
  }
}

function Check-ViewBlocked($label, $view, $query = 'select=id&limit=1') {
  Check-AnonZero $view $query
}

function Check-RpcBlocked($fn) {
  try {
    $resp = Invoke-WebRequest -Uri "$SupabaseUrl/rest/v1/rpc/$fn" -Headers $Headers -Method POST -ContentType 'application/json' -Body '{}' -UseBasicParsing -ErrorAction Stop
    $body = if ([string]::IsNullOrWhiteSpace($resp.Content)) { @() } else { @(ConvertFrom-Json $resp.Content) }
    # A 200 with a real result means anon could execute it — that's a leak
    # UNLESS the function is genuinely meant to be public (none in this app are).
    Fail-Check "$fn -> anon call SUCCEEDED (HTTP $([int]$resp.StatusCode)) — should be blocked"
  } catch {
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    if ($null -ne $status -and $status -ge 400) {
      Pass-Check "$fn -> blocked (HTTP $status)"
    } else {
      Warn-Check "$fn -> request error: $($_.Exception.Message)"
    }
  }
}

Write-Host ""
Write-Host "============================================================"
Write-Host " Anon RLS Probe (no login — public anon key only)"
Write-Host " Project: $SupabaseUrl"
Write-Host "============================================================"
Write-Host ""

Write-Host "-- Tables (derived from js/api + js/pages .from() calls) --"
$tables = @(
  'audit_log','cash_transactions','clients','deletion_requests','departments',
  'document_requests','document_templates','employee_audit_log','employee_compensation',
  'employee_documents','employee_skills','employees','employment_types',
  'evaluation_cycles','evaluation_questions','evaluation_responses','evaluations',
  'expense_categories','flex_holiday_swaps','generated_documents','group_members',
  'groups','job_title_change_requests','leave_balances','leave_requests','leave_types',
  'name_change_requests','petty_cash_settings','pn_attributes','pn_item_revisions',
  'pn_items','pn_project_config','pn_type_codes','profiles','project_assignments',
  'projects','public_holidays','tags','task_assignments','tasks','time_entries',
  'time_entry_tags','travel_claims','travel_requests','vehicle_rates',
  # Server-side-only tables — never queried directly by the client, but must
  # still deny anon reads (schema objects confirmed via migrations, not JS grep)
  'pn_counters','login_attempts'
)
foreach ($t in $tables) { Check-AnonZero $t }

Write-Host ""
Write-Host "-- Dropped view regression (R51) --"
Check-ViewBlocked 'client_project_totals (view)' 'client_project_totals'

Write-Host ""
Write-Host "-- RPCs (derived from js/*.rpc() calls + 2 server-side-only pn fns) --"
$rpcs = @(
  'approve_deletion_request','approve_job_title_change_request','approve_trip_settlement',
  'create_cycle_evaluations','get_client_project_summary','get_evaluation_kpis',
  'get_project_stats','get_tag_usage','pn_bump_revision','pn_create_item',
  'review_name_change_request',
  # Server-side-only — called from inside other RPCs, not directly from JS,
  # but anon EXECUTE must still be revoked (this is what 20260709 hardening targeted)
  'pn_item_snapshot','pn_render_template'
)
foreach ($fn in $rpcs) { Check-RpcBlocked $fn }

Write-Host ""
Write-Host "============================================================"
Write-Host " Result: $($script:Pass) PASS  $($script:Fail) FAIL  $($script:Warn) WARN"
Write-Host "============================================================"
if ($script:Fail -gt 0) {
  Write-Host "ANON PROBE FAIL -- fix all FAIL items before going live." -ForegroundColor Red
  exit 1
}
if ($script:Warn -gt 0) {
  Write-Host "ANON PROBE WARN -- review warnings, then close if all acceptable." -ForegroundColor Yellow
  exit 0
}
Write-Host "ANON PROBE PASS -- no anon leaks found." -ForegroundColor Green
exit 0
