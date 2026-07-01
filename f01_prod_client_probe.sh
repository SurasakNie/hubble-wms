#!/usr/bin/env bash
# F-01 Prod Client RLS Probe
# Verifies authenticated client isolation on PRODUCTION Supabase.
# Requires a test client account provisioned in the admin Clients page first.
#
# Usage:
#   chmod +x f01_prod_client_probe.sh
#   ./f01_prod_client_probe.sh <email_or_client_code> <password>
#
# Pass/Fail criteria (based on 20260707_client_read_hardening.sql):
#   OWN SCOPE  — get_client_project_summary returns ≥0 rows (all own company)
#   OWN SCOPE  — cash_transactions (out), travel_requests return rows only for own projects
#   OWN ONLY   — profiles returns exactly 1 row (own auth.uid())
#   ZERO       — time_entries, leave_requests, employees, compensation_records,
#                petty_cash_settings, document_templates, group_members,
#                task_assignments, evaluation_cycles, evaluation_questions,
#                evaluation_responses all return 0 rows
#   WRITE DENY — INSERT into projects returns 4xx

set -euo pipefail

SUPABASE_URL="https://sjkggguedgtynktymzes.supabase.co"
ANON_KEY="sb_publishable_ZO6nGx_2VNMO9dK_fN72Cg_LlprwmWQ"

EMAIL="${1:-}"
PASS="${2:-}"

if [[ -z "$EMAIL" || -z "$PASS" ]]; then
  echo "Usage: $0 <email_or_client_code> <password>"
  exit 1
fi

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'
ok()   { echo -e "${GREEN}  PASS${NC}  $1"; ((PASS_COUNT++)); }
fail() { echo -e "${RED}  FAIL${NC}  $1"; ((FAIL_COUNT++)); }
warn() { echo -e "${YELLOW}  WARN${NC}  $1"; ((WARN_COUNT++)); }
info() { echo -e "        $1"; }

# ── Auth ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " F-01  Prod Client RLS Probe"
echo " Project: $SUPABASE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Authenticating as: $EMAIL"

AUTH_RESPONSE=$(curl -s -X POST \
  "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo -e "${RED}AUTH FAILED${NC} — could not get access token."
  echo "Response: $AUTH_RESPONSE"
  exit 1
fi

USER_ID=$(echo "$AUTH_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo -e "${GREEN}Auth OK${NC} — user_id: $USER_ID"
echo ""

# ── Helper: REST query → row count ───────────────────────────────────────────
# rest_count TABLE [QUERY_STRING]
# Returns the integer count of rows (reads Prefer: count=exact response header).
rest_count() {
  local table="$1"
  local qs="${2:-}"
  local url="$SUPABASE_URL/rest/v1/$table?select=id${qs:+&$qs}"
  local resp
  resp=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Prefer: count=exact" \
    -H "Range: 0-0" \
    "$url")
  # For count we use a separate call that reads Content-Range
  local count_resp
  count_resp=$(curl -s \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Prefer: count=exact" \
    -H "Range: 0-0" \
    "$url")
  echo "$count_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "?"
}

# rest_status TABLE METHOD [BODY]
rest_status() {
  local table="$1"
  local method="${2:-GET}"
  local body="${3:-{}}"
  curl -s -o /dev/null -w "%{http_code}" \
    -X "$method" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    "$SUPABASE_URL/rest/v1/$table" \
    ${body:+-d "$body"}
}

# rpc_call — POST to /rest/v1/rpc/FUNCNAME
rpc_call() {
  local fn="$1"
  curl -s \
    -X POST \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    "$SUPABASE_URL/rest/v1/rpc/$fn" \
    -d '{}'
}

# ── Probe helpers ─────────────────────────────────────────────────────────────
check_zero() {
  local label="$1" table="$2" qs="${3:-}"
  local n
  n=$(rest_count "$table" "$qs")
  if [[ "$n" == "0" ]]; then
    ok "$label → 0 rows (blocked)"
  elif [[ "$n" == "?" ]]; then
    warn "$label → count unclear (check manually)"
  else
    fail "$label → $n rows visible (EXPECTED 0)"
  fi
}

# check_view_blocked LABEL VIEW  — a definer-rights view must not leak.
# A SECURITY DEFINER view bypasses the client_block_* table RLS, so an
# all-tenant aggregate view is a cross-tenant leak if the client can read it.
# PASS if the endpoint 404s (view dropped / not exposed) or returns 0 rows;
# FAIL if any rows come back. (check_zero can't be reused here: it selects
# `id` — absent on views — and would misparse a 404 error body as rows.)
check_view_blocked() {
  local label="$1" view="$2"
  local url="$SUPABASE_URL/rest/v1/$view?select=project_id&limit=1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" "$url")
  if [[ "$code" == "404" ]]; then
    ok "$label → HTTP 404 (view dropped / not exposed)"
    return
  fi
  local body n
  body=$(curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" "$url")
  n=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else -1)" 2>/dev/null || echo "?")
  if [[ "$n" == "0" ]]; then
    ok "$label → reachable but 0 rows (RLS-scoped)"
  elif [[ "$n" == "?" || "$n" == "-1" ]]; then
    warn "$label → HTTP $code, response unclear (check manually)"
  else
    fail "$label → $n row(s) visible (SECURITY DEFINER cross-tenant LEAK)"
  fi
}

check_own_profile() {
  local resp
  resp=$(curl -s \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "$SUPABASE_URL/rest/v1/profiles?select=id,role,client_id")
  local count role
  count=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "?")
  role=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('role','?') if d else 'none')" 2>/dev/null || echo "?")
  if [[ "$count" == "1" && "$role" == "client" ]]; then
    ok "profiles → exactly 1 row, role=client (own only)"
  elif [[ "$count" == "1" ]]; then
    warn "profiles → 1 row but role=$role (expected 'client')"
  elif [[ "$count" == "0" ]]; then
    fail "profiles → 0 rows (client can't read own profile — portal will break)"
  else
    fail "profiles → $count rows (expected 1 own row, got more — PII LEAK)"
  fi
}

check_write_denied() {
  local label="$1" table="$2" body="$3"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$body" \
    "$SUPABASE_URL/rest/v1/$table")
  if [[ "$status" == "4"* ]]; then
    ok "$label → INSERT $table blocked (HTTP $status)"
  else
    fail "$label → INSERT $table returned HTTP $status (expected 4xx)"
  fi
}

check_rpc_own_scope() {
  local resp
  resp=$(rpc_call "get_client_project_summary")
  local count
  count=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "?")
  if [[ "$count" == "?" ]]; then
    warn "get_client_project_summary → could not parse response (check manually)"
    info "Raw: $(echo "$resp" | head -c 200)"
  elif [[ "$count" == "0" ]]; then
    warn "get_client_project_summary → 0 projects (OK if no projects yet, else data missing)"
  else
    ok "get_client_project_summary → $count project(s) returned (check names match own company)"
    echo "$resp" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
for r in rows:
    print(f'         project_id={r.get(\"project_id\",\"?\")}  name={r.get(\"project_name\",\"?\")}  hours={r.get(\"total_hours\",0)}')" 2>/dev/null || true
  fi
}

# ── Run probe ─────────────────────────────────────────────────────────────────

echo "── 1. Own scope ──────────────────────────────────────────────"
check_own_profile
check_rpc_own_scope

echo ""
echo "── 2. Employee PII / internal tables (must be 0) ────────────"
check_zero "time_entries"        "time_entries"
check_zero "leave_requests"      "leave_requests"
check_zero "employees"           "employees"
check_zero "compensation_records" "compensation_records"
check_zero "petty_cash_settings" "petty_cash_settings"
check_zero "document_templates"  "document_templates"
check_zero "group_members"       "group_members"
check_zero "task_assignments"    "task_assignments"
check_zero "evaluation_cycles"   "evaluation_cycles"
check_zero "evaluation_questions" "evaluation_questions"
check_zero "evaluation_responses" "evaluation_responses"
check_zero "login_attempts"      "login_attempts"
check_view_blocked "client_project_totals (view)" "client_project_totals"

echo ""
echo "── 3. Expense/travel detail (own projects only) ─────────────"
EXP_RESP=$(curl -s \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$SUPABASE_URL/rest/v1/cash_transactions?direction=eq.out&select=id,project_id,amount,direction")
EXP_COUNT=$(echo "$EXP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "?")
if [[ "$EXP_COUNT" == "0" ]]; then
  ok "cash_transactions(out) → 0 rows (none yet or all blocked)"
elif [[ "$EXP_COUNT" == "?" ]]; then
  warn "cash_transactions(out) → check manually"
else
  ok "cash_transactions(out) → $EXP_COUNT rows visible (verify all are own projects)"
fi

TRIP_RESP=$(curl -s \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$SUPABASE_URL/rest/v1/travel_requests?select=id,project_id,destination,status")
TRIP_COUNT=$(echo "$TRIP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "?")
if [[ "$TRIP_COUNT" == "0" ]]; then
  ok "travel_requests → 0 rows (none yet or all blocked)"
elif [[ "$TRIP_COUNT" == "?" ]]; then
  warn "travel_requests → check manually"
else
  ok "travel_requests → $TRIP_COUNT rows visible (verify all are own projects)"
fi

echo ""
echo "── 4. Writes denied ─────────────────────────────────────────"
check_write_denied "projects"          "projects"          '{"name":"probe_test","client_id":"00000000-0000-0000-0000-000000000000"}'
check_write_denied "time_entries"      "time_entries"      '{"user_id":"00000000-0000-0000-0000-000000000000","project_id":"00000000-0000-0000-0000-000000000000","date":"2020-01-01","hours":1}'
check_write_denied "cash_transactions" "cash_transactions" '{"project_id":"00000000-0000-0000-0000-000000000000","amount":1,"direction":"out","txn_date":"2020-01-01"}'
check_write_denied "travel_requests"   "travel_requests"   '{"project_id":"00000000-0000-0000-0000-000000000000","destination":"probe","start_date":"2020-01-01","end_date":"2020-01-01"}'
check_write_denied "leave_requests"    "leave_requests"    '{"employee_id":"00000000-0000-0000-0000-000000000000","leave_type_code":"annual","start_date":"2020-01-01","end_date":"2020-01-01"}'

echo ""
echo "── 5. clients table (own row only) ──────────────────────────"
CLI_RESP=$(curl -s \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$SUPABASE_URL/rest/v1/clients?select=id,name,prefix")
CLI_COUNT=$(echo "$CLI_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "?")
if [[ "$CLI_COUNT" == "1" ]]; then
  ok "clients → 1 row (own company only)"
  echo "$CLI_RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'         name={d[0].get(\"name\",\"?\")}  prefix={d[0].get(\"prefix\",\"?\")}') if d else None" 2>/dev/null || true
elif [[ "$CLI_COUNT" == "0" ]]; then
  warn "clients → 0 rows (if client_id is set, own row should be readable)"
else
  fail "clients → $CLI_COUNT rows (EXPECTED 1 — multiple client companies visible)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf " Result: ${GREEN}%d PASS${NC}  ${RED}%d FAIL${NC}  ${YELLOW}%d WARN${NC}\n" \
  "$PASS_COUNT" "$FAIL_COUNT" "$WARN_COUNT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo -e "${RED}F-01 FAIL — fix all FAIL items before going live.${NC}"
  exit 1
elif [[ "$WARN_COUNT" -gt 0 ]]; then
  echo -e "${YELLOW}F-01 WARN — review WARN items, then close F-01 if all acceptable.${NC}"
  exit 0
else
  echo -e "${GREEN}F-01 PASS — client isolation verified in prod.${NC}"
  exit 0
fi
