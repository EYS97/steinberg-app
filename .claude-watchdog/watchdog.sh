#!/usr/bin/env bash
###############################################################################
# Claude Code Auto-Resume Watchdog
#
# Tracks Claude Code task sessions, detects usage/rate/token-limit blocks,
# waits until the official reset, and resumes the SAME session afterward.
#
# Safe by design:
#   - never bypasses or evades limits (only waits for the official reset)
#   - never starts duplicate work (tracks child pids; refuses live duplicates)
#   - never auto-runs destructive commands (default-deny tool policy + agent
#     safety system-prompt + NEEDS_USER_APPROVAL pause gate)
#   - bounded retries (max resumes per session)
#
# Pure bash + GNU date + a tiny node JSON helper (lib/json.js). No tmux/python.
# Background sessions stay alive via detached (nohup) processes.
###############################################################################
set -u

# --- locate ourselves --------------------------------------------------------
WD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DEFAULT="$(cd "$WD_DIR/.." && pwd)"
SESSIONS_FILE="$WD_DIR/sessions.json"
LOGS_DIR="$WD_DIR/logs"
LEDGER="$WD_DIR/task-ledger.md"
DAEMON_LOG="$LOGS_DIR/daemon.log"
PID_FILE="$WD_DIR/watchdog.pid"
LOCK_DIR="$WD_DIR/.lock"

export WD_SESSIONS_FILE="$SESSIONS_FILE"

# shellcheck source=lib/detect.sh
. "$WD_DIR/lib/detect.sh"

# --- config (config.env overrides these defaults) ----------------------------
# shellcheck disable=SC1091
[ -f "$WD_DIR/config.env" ] && . "$WD_DIR/config.env"

: "${CLAUDE_BIN:=claude}"
: "${POLL_INTERVAL:=30}"
: "${SAFETY_BUFFER_SECONDS:=60}"
: "${BACKOFF_BASE_SECONDS:=600}"     # 10 min
: "${BACKOFF_MAX_SECONDS:=3600}"     # 60 min
: "${DEFAULT_MAX_RESUMES:=5}"
: "${MODEL:=}"
: "${FALLBACK_MODEL:=}"
: "${MAX_BUDGET_USD:=}"
: "${PERMISSION_MODE:=acceptEdits}"
: "${NOTIFY_DESKTOP:=1}"
# Comma-separated tool policies (commas keep "Bash(git status:*)" intact).
: "${ALLOWED_TOOLS:=Read,Edit,Write,Grep,Glob,LS,TodoWrite,Task,NotebookEdit,WebFetch,WebSearch,Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git add:*),Bash(git commit:*),Bash(git checkout -b:*),Bash(git switch:*),Bash(git branch:*),Bash(npm test:*),Bash(npm run:*),Bash(npm ci:*),Bash(npm install:*),Bash(node:*),Bash(npx:*),Bash(ls:*),Bash(cat:*),Bash(pytest:*),Bash(python:*)}"
: "${DISALLOWED_TOOLS:=Bash(rm:*),Bash(git push --force:*),Bash(git push -f:*),Bash(git reset --hard:*),Bash(git clean:*),Bash(sudo:*),Bash(dd:*),Bash(mkfs:*),Bash(npm publish:*),Bash(* deploy*),Bash(* migrate*),Bash(* drop *),Bash(rmdir:*)}"
: "${RESUME_PROMPT:=Continue the task exactly where you left off. First read .claude-watchdog/task-ledger.md for prior progress and the next action. Do not restart completed steps.}"
: "${SAFETY_SYSTEM_PROMPT:=You are running UNATTENDED under an auto-resume watchdog. Persist progress to .claude-watchdog/task-ledger.md after each meaningful step (record completed steps and the next action). NEVER perform destructive or irreversible operations: deleting data, force-push, git reset --hard, git clean, database migrations, production deploys, credential/secret changes, or package publish. If a required step is destructive or risky, DO NOT do it. Instead append a line to .claude-watchdog/task-ledger.md that begins with 'NEEDS_USER_APPROVAL:' describing the step, AND end your final printed message with that same 'NEEDS_USER_APPROVAL: <description>' line, then stop.}"

# --- small utilities ---------------------------------------------------------
jdb() { node "$WD_DIR/lib/json.cjs" "$@"; }
ts_now() { date +%s; }
fmt() { jdb fmt-epoch "$1"; }
log_daemon() { printf '[%s] %s\n' "$(date '+%F %T')" "$*" >>"$DAEMON_LOG"; }

pid_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

acquire_lock() {
  local t=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    # steal stale locks (>120s old) left by a crashed run
    if [ -d "$LOCK_DIR" ]; then
      local age; age=$(( $(ts_now) - $(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo 0) ))
      [ "$age" -gt 120 ] && rmdir "$LOCK_DIR" 2>/dev/null
    fi
    sleep 0.2; t=$((t+1)); [ "$t" -ge 150 ] && return 1
  done
  return 0
}
release_lock() { rmdir "$LOCK_DIR" 2>/dev/null || true; }

backoff_seconds() {
  local idx="${1:-0}"; [ "$idx" -gt 6 ] && idx=6
  local s=$(( BACKOFF_BASE_SECONDS * (1 << idx) ))
  [ "$s" -gt "$BACKOFF_MAX_SECONDS" ] && s="$BACKOFF_MAX_SECONDS"
  echo "$s"
}

ledger_entry() {
  local name="$1"; shift
  [ -f "$LEDGER" ] || init_ledger
  printf -- '- [%s] (%s) %s\n' "$(date '+%F %T')" "$name" "$*" >>"$LEDGER"
}

init_ledger() {
  cat >"$LEDGER" <<'EOF'
# Task Ledger — Claude Code Auto-Resume Watchdog

Human-readable, append-only record of tracked tasks: current step, completed
steps, next action, and any pauses requiring approval.

Lines beginning with `NEEDS_USER_APPROVAL:` mark a risky step the agent refused
to run unattended — review it, then `watchdog.sh approve <name>` to continue.

---

EOF
}

notify() {
  local title="$1" msg="$2"
  printf '[%s] %s: %s\n' "$(date '+%F %T')" "$title" "$msg"
  log_daemon "NOTIFY $title: $msg"
  if [ "${NOTIFY_DESKTOP:-1}" = "1" ]; then
    if command -v osascript >/dev/null 2>&1; then           # macOS
      osascript -e "display notification \"$msg\" with title \"$title\"" >/dev/null 2>&1 || true
    elif command -v notify-send >/dev/null 2>&1; then        # Linux
      notify-send "$title" "$msg" >/dev/null 2>&1 || true
    elif command -v powershell.exe >/dev/null 2>&1; then     # Windows (best effort)
      powershell.exe -NoProfile -Command \
        "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); \$n=New-Object System.Windows.Forms.NotifyIcon; \$n.Icon=[System.Drawing.SystemIcons]::Information; \$n.Visible=\$true; \$n.ShowBalloonTip(5000,'$title','$msg',[System.Windows.Forms.ToolTipIcon]::Info)" \
        >/dev/null 2>&1 || true
    fi
  fi
  if [ -n "${SLACK_WEBHOOK_URL:-}" ] && command -v curl >/dev/null 2>&1; then
    curl -fsS -X POST -H 'Content-type: application/json' \
      --data "{\"text\":\"[claude-watchdog] $title: $msg\"}" "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] && command -v curl >/dev/null 2>&1; then
    curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=[claude-watchdog] $title: $msg" >/dev/null 2>&1 || true
  fi
}

daemon_running() {
  local p
  [ -f "$PID_FILE" ] || return 1
  p="$(cat "$PID_FILE" 2>/dev/null)"
  pid_alive "$p"
}

# --- launching a supervised claude run ---------------------------------------
# launch_run <name> <initial|resume>  -> prints child pid; sets a fresh log path
launch_run() {
  local name="$1" mode="$2"
  local repo sid prompt user_text log run_ts
  repo="$(jdb get "$name" repo)"; [ -n "$repo" ] || repo="$REPO_DEFAULT"
  sid="$(jdb get "$name" session_id)"
  prompt="$(jdb get "$name" last_prompt)"
  run_ts="$(date +%Y%m%d-%H%M%S)"
  log="$LOGS_DIR/${name}.${run_ts}.log"
  jdb set "$name" log "$log"
  rm -f "$log.exit"

  # Build claude args. A fresh per-run log avoids re-detecting stale limit text.
  local -a args=( -p --session-id "$sid" -n "$name"
                  --permission-mode "$PERMISSION_MODE" --output-format text )
  [ -n "$MODEL" ]            && args+=( --model "$MODEL" )
  [ -n "$FALLBACK_MODEL" ]   && args+=( --fallback-model "$FALLBACK_MODEL" )
  [ -n "$MAX_BUDGET_USD" ]   && args+=( --max-budget-usd "$MAX_BUDGET_USD" )
  [ -n "$ALLOWED_TOOLS" ]    && args+=( --allowedTools "$ALLOWED_TOOLS" )
  [ -n "$DISALLOWED_TOOLS" ] && args+=( --disallowedTools "$DISALLOWED_TOOLS" )
  [ -n "$SAFETY_SYSTEM_PROMPT" ] && args+=( --append-system-prompt "$SAFETY_SYSTEM_PROMPT" )

  if [ "$mode" = resume ]; then
    args+=( -r "$sid" )
    user_text="$RESUME_PROMPT"
  else
    user_text="$prompt"
  fi

  # Detached wrapper: cd into repo, run claude, record exit code + done marker.
  local inner='cd "$1" || exit 97; logf="$2"; bin="$3"; shift 3; "$bin" "$@" >>"$logf" 2>&1; code=$?; echo "$code" >"$logf.exit"; [ "$code" = "0" ] && printf "%s\n" "'"$DONE_MARKER"'" >>"$logf"'
  nohup bash -c "$inner" _ "$repo" "$log" "$CLAUDE_BIN" "${args[@]}" "$user_text" >>"$DAEMON_LOG" 2>&1 &
  local pid=$!
  disown 2>/dev/null || true
  echo "$pid"
}

start_or_resume() {
  local name="$1" mode="$2" pid
  pid="$(launch_run "$name" "$mode")"
  jdb set "$name" child_pid "$pid"
  jdb set "$name" status RUNNING
  jdb set "$name" wake_at null
}

# --- daemon per-session state machine ----------------------------------------
schedule_block() {
  local name="$1" log reset now wake idx bo
  log="$(jdb get "$name" log)"
  now="$(ts_now)"
  reset="$(parse_reset_time "$log")"
  if [ -n "$reset" ]; then
    wake=$(( reset + SAFETY_BUFFER_SECONDS ))
    jdb set "$name" reset_at "$reset"
    ledger_entry "$name" "BLOCKED by limit; official reset $(fmt "$reset"); will resume ~$(fmt "$wake")"
  else
    idx="$(jdb get "$name" backoff_index)"; idx="${idx:-0}"
    bo="$(backoff_seconds "$idx")"
    wake=$(( now + bo ))
    jdb set "$name" backoff_index "$((idx+1))"
    ledger_entry "$name" "BLOCKED/ERROR; no reset time found; retry in $((bo/60))m (~$(fmt "$wake"))"
  fi
  jdb set "$name" wake_at "$wake"
  jdb set "$name" status BLOCKED
  jdb set "$name" child_pid null
  notify "watchdog" "Session '$name' blocked; will resume around $(fmt "$wake")."
}

classify_finished() {
  local name="$1" log code
  log="$(jdb get "$name" log)"
  code=""; [ -f "$log.exit" ] && code="$(cat "$log.exit" 2>/dev/null)"
  jdb set "$name" exit_code "${code:-null}"

  if [ "$code" = "0" ] || grep -qF "$DONE_MARKER" "$log" 2>/dev/null; then
    jdb set "$name" status DONE
    jdb set "$name" child_pid null
    jdb set "$name" backoff_index 0
    ledger_entry "$name" "COMPLETED (exit ${code:-0})"
    notify "watchdog" "Session '$name' completed."
    return
  fi
  if log_needs_approval "$log"; then
    jdb set "$name" status NEEDS_APPROVAL
    jdb set "$name" child_pid null
    ledger_entry "$name" "PAUSED: NEEDS_USER_APPROVAL — human required (run: watchdog.sh approve $name)"
    notify "watchdog" "Session '$name' needs approval before continuing."
    return
  fi
  if log_is_blocked "$log"; then
    schedule_block "$name"
    return
  fi
  # Unknown non-zero exit -> treat as transient; back off and retry.
  ledger_entry "$name" "ERROR (exit ${code:-?}); treating as transient"
  schedule_block "$name"
}

maybe_resume() {
  local name="$1" resume_count max wake now pid repo dirty
  resume_count="$(jdb get "$name" resume_count)"; resume_count="${resume_count:-0}"
  max="$(jdb get "$name" max_resumes)"; max="${max:-$DEFAULT_MAX_RESUMES}"

  if [ "$resume_count" -ge "$max" ]; then
    jdb set "$name" status MAX_RESUMES
    ledger_entry "$name" "MAX_RESUMES ($max) reached — stopping to avoid loop"
    notify "watchdog" "Session '$name' hit max resumes ($max); stopped."
    return
  fi

  wake="$(jdb get "$name" wake_at)"; now="$(ts_now)"
  [ -n "$wake" ] && [ "$now" -lt "$wake" ] && return 0   # not time yet

  # ---- pre-resume safety checks ----
  pid="$(jdb get "$name" child_pid)"
  if pid_alive "$pid"; then return 0; fi                  # never duplicate work
  if log_needs_approval "$(jdb get "$name" log)"; then
    jdb set "$name" status NEEDS_APPROVAL
    ledger_entry "$name" "Resume blocked: NEEDS_USER_APPROVAL present (run: watchdog.sh approve $name)"
    return
  fi
  repo="$(jdb get "$name" repo)"; [ -n "$repo" ] || repo="$REPO_DEFAULT"
  if git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    dirty="$(git -C "$repo" status --porcelain 2>/dev/null | grep -c . || true)"
    ledger_entry "$name" "Pre-resume git check: ${dirty} uncommitted change(s) in $repo"
  fi

  start_or_resume "$name" resume
  jdb set "$name" resume_count "$((resume_count+1))"
  ledger_entry "$name" "RESUMED (#$((resume_count+1))/$max)"
  notify "watchdog" "Resumed session '$name' (#$((resume_count+1))/$max)."
}

process_session() {
  local name="$1" status pid
  status="$(jdb get "$name" status)"
  case "$status" in
    QUEUED)
      ledger_entry "$name" "STARTING initial run"
      start_or_resume "$name" initial ;;
    RUNNING)
      pid="$(jdb get "$name" child_pid)"
      if pid_alive "$pid"; then return 0; fi              # still working
      classify_finished "$name" ;;                        # child exited
    BLOCKED|ERROR)
      maybe_resume "$name" ;;
    *) : ;;                                               # DONE/STOPPED/MAX_RESUMES/NEEDS_APPROVAL/QUEUED-handled
  esac
}

daemon_loop() {
  echo "$$" >"$PID_FILE"
  log_daemon "daemon started (pid $$)"
  notify "watchdog" "Daemon started (pid $$); polling every ${POLL_INTERVAL}s."
  trap 'rm -f "$PID_FILE"; log_daemon "daemon stopping"; notify watchdog "Daemon stopped."; exit 0' TERM INT
  while true; do
    if acquire_lock; then
      while IFS= read -r name; do
        [ -n "$name" ] && process_session "$name"
      done < <(jdb names)
      release_lock
    fi
    sleep "$POLL_INTERVAL"
  done
}

ensure_daemon() {
  daemon_running && return 0
  jdb init
  nohup bash "$WD_DIR/watchdog.sh" __daemon >>"$DAEMON_LOG" 2>&1 &
  disown 2>/dev/null || true
  sleep 1
  if daemon_running; then echo "watchdog daemon started (pid $(cat "$PID_FILE"))."; else
    echo "WARN: daemon may not have started; check $DAEMON_LOG" >&2; fi
}

# --- public subcommands ------------------------------------------------------
valid_name() { [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }

cmd_start() {
  local name="" prompt="" repo="$REPO_DEFAULT" max="$DEFAULT_MAX_RESUMES"
  name="${1:-}"; shift || true
  while [ $# -gt 0 ]; do
    case "$1" in
      --max-resumes) max="$2"; shift 2 ;;
      --repo) repo="$(cd "$2" && pwd)"; shift 2 ;;
      *) prompt="$1"; shift ;;
    esac
  done
  if [ -z "$name" ] || [ -z "$prompt" ]; then
    echo "usage: watchdog.sh start <name> \"<prompt>\" [--repo PATH] [--max-resumes N]" >&2; return 2
  fi
  valid_name "$name" || { echo "invalid name (use A-Z a-z 0-9 . _ -)" >&2; return 2; }
  jdb init
  local sid
  if ! sid="$(jdb add "$name" "$repo" "$prompt" "$max" "")"; then
    echo "Refused: a session named '$name' is already active. Use a new name, or 'stop-session $name' first." >&2
    return 3
  fi
  ledger_entry "$name" "REGISTERED — repo=$repo session_id=$sid max_resumes=$max"
  ledger_entry "$name" "PROMPT: $prompt"
  echo "Registered session '$name' (session_id $sid)."
  ensure_daemon
  echo "It will launch within ${POLL_INTERVAL}s. Track with: watchdog.sh status"
}

cmd_list() { jdb list; }

cmd_status() {
  if daemon_running; then echo "daemon: RUNNING (pid $(cat "$PID_FILE"))"; else echo "daemon: stopped"; fi
  echo
  jdb list
  echo
  echo "--- recent ledger ---"
  [ -f "$LEDGER" ] && tail -n 12 "$LEDGER" || echo "(no ledger yet)"
}

cmd_resume() {
  local name="${1:-}" force=0
  [ "${2:-}" = "--force" ] && force=1
  [ -n "$name" ] || { echo "usage: watchdog.sh resume <name> [--force]" >&2; return 2; }
  jdb exists "$name" || { echo "no such session: $name" >&2; return 1; }
  acquire_lock || { echo "could not acquire lock" >&2; return 1; }
  local pid; pid="$(jdb get "$name" child_pid)"
  if pid_alive "$pid"; then release_lock; echo "'$name' is already running (pid $pid); not resuming."; return 0; fi
  if [ "$force" = 1 ]; then
    local rc; rc="$(jdb get "$name" resume_count)"; rc="${rc:-0}"
    start_or_resume "$name" resume
    jdb set "$name" resume_count "$((rc+1))"
    ledger_entry "$name" "MANUAL force-resume (#$((rc+1)))"
    release_lock
    ensure_daemon
    echo "Force-resumed '$name'."
  else
    jdb set "$name" status BLOCKED
    jdb set "$name" wake_at "$(( $(ts_now) - 1 ))"
    ledger_entry "$name" "MANUAL resume requested (daemon will pick up; safety gates apply)"
    release_lock
    ensure_daemon
    echo "'$name' queued for resume on next poll (~${POLL_INTERVAL}s). Use --force to bypass gates."
  fi
}

cmd_approve() {
  local name="${1:-}"
  [ -n "$name" ] || { echo "usage: watchdog.sh approve <name>" >&2; return 2; }
  jdb exists "$name" || { echo "no such session: $name" >&2; return 1; }
  acquire_lock || return 1
  local pid; pid="$(jdb get "$name" child_pid)"
  if pid_alive "$pid"; then release_lock; echo "'$name' already running."; return 0; fi
  local rc; rc="$(jdb get "$name" resume_count)"; rc="${rc:-0}"
  ledger_entry "$name" "APPROVED by user — resuming past NEEDS_USER_APPROVAL gate"
  start_or_resume "$name" resume
  jdb set "$name" resume_count "$((rc+1))"
  release_lock
  ensure_daemon
  echo "Approved and resumed '$name'."
}

cmd_stop_session() {
  local name="${1:-}"
  [ -n "$name" ] || { echo "usage: watchdog.sh stop-session <name>" >&2; return 2; }
  jdb exists "$name" || { echo "no such session: $name" >&2; return 1; }
  local pid; pid="$(jdb get "$name" child_pid)"
  pid_alive "$pid" && { kill "$pid" 2>/dev/null; echo "killed run pid $pid"; }
  jdb set "$name" status STOPPED
  jdb set "$name" child_pid null
  ledger_entry "$name" "STOPPED by user"
  echo "Session '$name' stopped."
}

cmd_stop() {
  if daemon_running; then
    kill "$(cat "$PID_FILE")" 2>/dev/null
    sleep 1; rm -f "$PID_FILE"
    echo "watchdog daemon stopped (running claude tasks were left to finish)."
  else
    echo "daemon not running."
  fi
}

cmd_logs() {
  local name="${1:-}" follow=""
  [ "${2:-}" = "-f" ] && follow="-f"
  [ -n "$name" ] || { echo "usage: watchdog.sh logs <name> [-f]" >&2; return 2; }
  local log; log="$(jdb get "$name" log)"
  [ -n "$log" ] && [ -f "$log" ] || { echo "no log yet for '$name'" >&2; return 1; }
  echo "== $log =="
  # shellcheck disable=SC2086
  tail -n 60 $follow "$log"
}

cmd_ledger() { [ -f "$LEDGER" ] && cat "$LEDGER" || echo "(no ledger yet)"; }

cmd_test() { bash "$WD_DIR/tests/run-tests.sh"; }

# boot: reboot/logon recovery, then (re)start the detached daemon and exit.
# A session left RUNNING when the machine went down lost its child process, so
# requeue it for a clean resume. The daemon is launched detached (not as the
# task process), so the scheduled task finishes in seconds and its execution
# time limit never affects the long-running daemon.
cmd_boot() {
  jdb init
  if daemon_running; then
    echo "boot: daemon already running (pid $(cat "$PID_FILE")); nothing to do."
    return 0
  fi
  local name status
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    status="$(jdb get "$name" status)"
    if [ "$status" = RUNNING ]; then
      jdb set "$name" child_pid null
      jdb set "$name" status BLOCKED
      jdb set "$name" wake_at "$(ts_now)"
      ledger_entry "$name" "BOOT recovery: run ended at shutdown; will resume"
    fi
  done < <(jdb names)
  log_daemon "boot recovery complete; ensuring daemon"
  ensure_daemon
}

# install-startup: drop a hidden VBS launcher in the user's Startup folder so the
# daemon restarts at every logon. No admin required (Task Scheduler creation is
# blocked without elevation on many Windows setups). The VBS runs `watchdog.sh
# boot` with no console window; boot recovers stale sessions and starts the
# detached daemon, then exits.
startup_vbs_path() { echo "$(cygpath -F 7)/ClaudeWatchdog.vbs"; }

cmd_install_startup() {
  command -v cygpath  >/dev/null 2>&1 || { echo "cygpath not found" >&2; return 1; }
  command -v wscript.exe >/dev/null 2>&1 || command -v cscript.exe >/dev/null 2>&1 \
    || { echo "wscript not found" >&2; return 1; }
  local bash_win vbs
  bash_win="$(cygpath -w "$(command -v bash)")"
  vbs="$(startup_vbs_path)"
  cat >"$vbs" <<VBS
' ClaudeWatchdog — auto-start the watchdog daemon at logon (hidden window).
' Auto-generated by watchdog.sh install-startup. Remove with: watchdog.sh uninstall-startup
Set s = CreateObject("WScript.Shell")
s.Run """$bash_win"" -lc ""cd '$WD_DIR' && ./watchdog.sh boot >> logs/startup.log 2>&1""", 0, False
VBS
  if [ -f "$vbs" ]; then
    echo "Installed logon auto-start:"
    echo "  $vbs"
    echo "The daemon will restart automatically at each logon (no admin needed)."
    echo "Start it now without logging out:  wscript.exe \"$(cygpath -w "$vbs")\""
  else
    echo "Failed to write startup launcher to $vbs" >&2
    return 1
  fi
}

cmd_uninstall_startup() {
  command -v cygpath >/dev/null 2>&1 || { echo "cygpath not found" >&2; return 1; }
  local vbs; vbs="$(startup_vbs_path)"
  if [ -f "$vbs" ]; then rm -f "$vbs" && echo "Removed logon auto-start: $vbs"; else
    echo "No logon auto-start installed."; fi
}

usage() {
  cat <<EOF
Claude Code Auto-Resume Watchdog

  watchdog.sh start <name> "<prompt>" [--repo PATH] [--max-resumes N]
                                  Register + launch a tracked session.
  watchdog.sh list                List tracked sessions and statuses.
  watchdog.sh status              Daemon state + sessions + recent ledger.
  watchdog.sh logs <name> [-f]    Show (or follow) a session's current run log.
  watchdog.sh ledger              Print the full task ledger.
  watchdog.sh resume <name> [--force]
                                  Manually resume (force bypasses gates).
  watchdog.sh approve <name>      Clear a NEEDS_USER_APPROVAL pause and resume.
  watchdog.sh stop-session <name> Stop one session.
  watchdog.sh stop                Stop the watchdog daemon (tasks keep running).
  watchdog.sh test                Run detection tests against simulated logs.
  watchdog.sh install-startup     Auto-start the daemon at logon (survives reboots).
  watchdog.sh uninstall-startup   Remove the logon auto-start.
  watchdog.sh daemon              Start the daemon in the foreground (debug).

See README.md for full docs and 3-parallel-session examples.
EOF
}

# --- dispatch ----------------------------------------------------------------
mkdir -p "$LOGS_DIR"
cmd="${1:-help}"; shift || true
case "$cmd" in
  start)         cmd_start "$@" ;;
  list|ls)       cmd_list ;;
  status)        cmd_status ;;
  logs)          cmd_logs "$@" ;;
  ledger)        cmd_ledger ;;
  resume)        cmd_resume "$@" ;;
  approve)       cmd_approve "$@" ;;
  stop-session)  cmd_stop_session "$@" ;;
  stop)          cmd_stop ;;
  test)          cmd_test ;;
  install-startup)   cmd_install_startup ;;
  uninstall-startup) cmd_uninstall_startup ;;
  boot)          cmd_boot ;;                  # logon recovery + resident daemon
  daemon)        jdb init; daemon_loop ;;     # foreground (debug)
  __daemon)      daemon_loop ;;               # internal: detached daemon
  help|-h|--help) usage ;;
  *) echo "unknown command: $cmd" >&2; usage; exit 1 ;;
esac
