#!/usr/bin/env bash
# run-tests.sh — validate the watchdog against SIMULATED logs and a mock claude.
# Run this before pointing the watchdog at real Claude Code sessions.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WD="$(cd "$HERE/.." && pwd)"
FIX="$HERE/fixtures"
JSON="$WD/lib/json.cjs"

# shellcheck source=../lib/detect.sh
. "$WD/lib/detect.sh"

pass=0; fail=0
ok()  { printf '  PASS: %s\n' "$1"; pass=$((pass+1)); }
no()  { printf '  FAIL: %s\n' "$1"; fail=$((fail+1)); }
assert_true()  { local d="$1"; shift; if "$@"; then ok "$d"; else no "$d"; fi; }
assert_false() { local d="$1"; shift; if "$@"; then no "$d"; else ok "$d"; fi; }
assert_eq()    { local d="$1" exp="$2" act="$3"; [ "$exp" = "$act" ] && ok "$d (=$act)" || no "$d (exp=$exp got=$act)"; }

echo "== 1. limit detection (log_is_blocked) =="
assert_true  "reset-at message detected"   log_is_blocked "$FIX/blocked_reset_at.log"
assert_true  "epoch message detected"      log_is_blocked "$FIX/blocked_epoch.log"
assert_true  "try-again/429 detected"      log_is_blocked "$FIX/blocked_try_again.log"
assert_true  "token-limit/ISO detected"    log_is_blocked "$FIX/blocked_iso.log"
assert_false "clean log not flagged"       log_is_blocked "$FIX/clean_no_limit.log"

echo "== 2. approval-gate detection (log_needs_approval) =="
assert_true  "NEEDS_USER_APPROVAL detected" log_needs_approval "$FIX/needs_approval.log"
assert_false "clean log has no approval"    log_needs_approval "$FIX/clean_no_limit.log"

echo "== 3. reset-time parsing (parse_reset_time) =="
now="$(date +%s)"
r_epoch="$(parse_reset_time "$FIX/blocked_epoch.log")"
assert_eq "explicit epoch parsed" "1781000000" "$r_epoch"

r_resetat="$(parse_reset_time "$FIX/blocked_reset_at.log")"
assert_true "3pm reset parsed to a future epoch" test -n "$r_resetat"
[ -n "$r_resetat" ] && assert_true "3pm reset is in the future" test "$r_resetat" -gt "$now"

r_try="$(parse_reset_time "$FIX/blocked_try_again.log")"
if [ -n "$r_try" ]; then
  d=$(( r_try - now ))
  assert_true "try-again-15m ≈ 900s ($d)" test "$d" -ge 840 -a "$d" -le 960
else
  no "try-again parsed"
fi

r_iso="$(parse_reset_time "$FIX/blocked_iso.log")"
exp_iso="$(date -d '2030-01-01 09:00:00' +%s)"
assert_eq "ISO datetime parsed" "$exp_iso" "$r_iso"

echo "== 4. JSON state store (lib/json.js) =="
TMPJSON="$(mktemp -u).json"
export WD_SESSIONS_FILE="$TMPJSON"
node "$JSON" init
sid="$(node "$JSON" add t-sess /tmp/repo "do the thing" 4 /tmp/x.log)"
assert_true  "add returns a uuid" test -n "$sid"
assert_eq    "status starts QUEUED" "QUEUED" "$(node "$JSON" get t-sess status)"
assert_eq    "max_resumes stored"   "4"      "$(node "$JSON" get t-sess max_resumes)"
node "$JSON" set t-sess status RUNNING
assert_eq    "status updated" "RUNNING" "$(node "$JSON" get t-sess status)"
node "$JSON" set t-sess resume_count 2
assert_eq    "numeric set typed as int" "2" "$(node "$JSON" get t-sess resume_count)"
assert_true  "exists yes" node "$JSON" exists t-sess
assert_eq    "names lists it" "t-sess" "$(node "$JSON" names)"
# duplicate while active should be refused (exit 3)
if node "$JSON" add t-sess /tmp/repo "again" 5 /tmp/y.log >/dev/null 2>&1; then
  no "duplicate active session refused"
else
  ok "duplicate active session refused"
fi
node "$JSON" del t-sess
assert_false "exists no after del" node "$JSON" exists t-sess
unset WD_SESSIONS_FILE
rm -f "$TMPJSON" "$TMPJSON".tmp.* 2>/dev/null

echo "== 5. end-to-end: block -> wait -> resume -> done (mock claude) =="
TMP="$(mktemp -d)"
mkdir -p "$TMP/.claude-watchdog"
cp -r "$WD/lib" "$WD/watchdog.sh" "$WD/tests" "$TMP/.claude-watchdog/"
chmod +x "$TMP/.claude-watchdog/tests/mock-claude.sh" 2>/dev/null
cat >"$TMP/.claude-watchdog/config.env" <<EOF
CLAUDE_BIN=$TMP/.claude-watchdog/tests/mock-claude.sh
POLL_INTERVAL=2
SAFETY_BUFFER_SECONDS=1
NOTIFY_DESKTOP=0
DEFAULT_MAX_RESUMES=3
EOF

bash "$TMP/.claude-watchdog/watchdog.sh" start e2e "simulated task" --repo "$TMP" >/dev/null 2>&1
e2e_json="$TMP/.claude-watchdog/sessions.json"
status=""
for _ in $(seq 1 25); do
  status="$(WD_SESSIONS_FILE="$e2e_json" node "$JSON" get e2e status 2>/dev/null)"
  [ "$status" = DONE ] && break
  sleep 1
done
rc="$(WD_SESSIONS_FILE="$e2e_json" node "$JSON" get e2e resume_count 2>/dev/null)"
bash "$TMP/.claude-watchdog/watchdog.sh" stop >/dev/null 2>&1
assert_eq   "e2e session reaches DONE" "DONE" "$status"
assert_true "e2e resumed at least once" test "${rc:-0}" -ge 1
rm -rf "$TMP"

echo
echo "==================================="
printf 'RESULT: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] && echo "ALL GREEN ✅" || echo "SOME TESTS FAILED ❌"
exit "$fail"
