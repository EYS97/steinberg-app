# Claude Code Auto-Resume Watchdog

A local, safe, auditable system that keeps long Claude Code tasks alive across
usage/rate/token-limit blocks. When a tracked session is blocked by a limit, the
watchdog **waits for the official reset** and then resumes the *same* session —
so you can walk away and come back to finished work.

It does **not** bypass, evade, or work around Anthropic limits. It only waits and
resumes after the official reset, exactly as a human would.

---

## How it works (architecture)

```
                    ┌─────────────────────────────────────────────┐
                    │  watchdog daemon (one detached bash process)  │
                    │  polls every POLL_INTERVAL seconds            │
                    └───────────────┬───────────────────────────────┘
                                    │ reads/writes (atomic)
                                    ▼
   sessions.json  ◄──────  per-session state machine  ──────►  task-ledger.md
   (source of truth)        QUEUED → RUNNING → …               (human journal)
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                       ▼
   launch detached `claude -p`   scan run log for      resume with
   --session-id <uuid>           limit / approval /    `claude -p -r <uuid>`
   (nohup, survives logout)      completion markers    after reset + buffer
              │                                                │
              ▼                                                ▼
        logs/<name>.<ts>.log  (fresh per run)         resume_count++ (capped)
```

**Why these choices on this machine** (Windows + Git Bash, no tmux/python):

- **Detached processes, not tmux.** tmux/screen aren't available in Git Bash and
  WSL has no distro here. Each Claude run is launched with `nohup` so it keeps
  running after you close the terminal or log out — the same "stays alive while
  away" guarantee tmux would give, without the dependency.
- **Headless `claude -p`** with an explicit `--session-id` (a UUID we generate).
  That UUID is how we resume the *exact* conversation later via `-r <uuid>`, and
  how we guarantee we never start a second copy of the same task.
- **State machine in `sessions.json`** (the source of truth), edited only through
  `lib/json.cjs` with atomic write-temp-then-rename. `task-ledger.md` is the
  human-readable mirror.
- **Fresh per-run log** (`logs/<name>.<timestamp>.log`) each launch, so stale
  limit text from a previous run is never re-detected as a new block.
- **Self-correcting waits.** Reset times are parsed from the log when present
  (clock time, relative "try again in N", ISO datetime, or a raw epoch). If a
  parse is slightly off and we wake too early, the next run simply hits the limit
  again, is re-detected, and we wait again. If no time is found at all, we fall
  back to exponential backoff (10 → 20 → 40 → 60 min, capped).

### Session state machine

| State            | Meaning                                                            |
|------------------|-------------------------------------------------------------------|
| `QUEUED`         | Registered; daemon will launch on next poll.                      |
| `RUNNING`        | A `claude` child process is working.                              |
| `BLOCKED`        | Limit hit (or transient error); waiting until `wake_at`.          |
| `NEEDS_APPROVAL` | Agent flagged a risky step (`NEEDS_USER_APPROVAL`); paused.       |
| `DONE`           | Run completed cleanly (exit 0).                                   |
| `MAX_RESUMES`    | Hit the resume cap; stopped to avoid loops.                       |
| `STOPPED`        | Stopped by you.                                                   |

---

## Requirements

Already satisfied on this machine — verified during setup:

- `bash` (Git Bash / MSYS2) and GNU `date`
- `node` (for JSON state handling) — the watchdog finds it on `PATH`
- `claude` CLI on `PATH` (v2.1+)

No tmux, no python, no jq required.

---

## Quick start

```bash
cd ~/Downloads/steinberg-app/.claude-watchdog

# (optional) configure — copy the template and edit
cp config.env.example config.env

# always run the tests first (uses simulated logs + a mock claude, no real usage)
./watchdog.sh test

# start a tracked session (auto-starts the daemon)
./watchdog.sh start security-audit "Audit the app for security issues and write findings to SECURITY.md. Commit when done."

# see what's happening
./watchdog.sh status
```

The daemon launches the task within `POLL_INTERVAL` seconds (default 30s) and
from then on supervises it: if it gets limited, the daemon waits for the reset
and resumes automatically — even if your terminal is closed.

---

## Commands

| Command | Description |
|---|---|
| `./watchdog.sh start <name> "<prompt>" [--repo PATH] [--max-resumes N]` | Register & launch a tracked session. |
| `./watchdog.sh list` | List sessions and statuses. |
| `./watchdog.sh status` | Daemon state + sessions + recent ledger. |
| `./watchdog.sh logs <name> [-f]` | Show / follow a session's current run log. |
| `./watchdog.sh ledger` | Print the full task ledger. |
| `./watchdog.sh resume <name> [--force]` | Manually resume; `--force` bypasses gates. |
| `./watchdog.sh approve <name>` | Clear a `NEEDS_USER_APPROVAL` pause and resume. |
| `./watchdog.sh stop-session <name>` | Stop one session. |
| `./watchdog.sh stop` | Stop the daemon (running tasks keep going). |
| `./watchdog.sh install-startup` | Auto-start the daemon at every logon (survives reboots). |
| `./watchdog.sh uninstall-startup` | Remove the logon auto-start. |
| `./watchdog.sh boot` | Recover sessions interrupted by shutdown, then start the daemon. |
| `./watchdog.sh test` | Run the simulated-log + mock-claude test suite. |
| `./watchdog.sh daemon` | Run the daemon in the foreground (debugging). |

### Start a tracked session
```bash
./watchdog.sh start refactor-api "Refactor the API layer to use async handlers. Keep tests green."
```
Names must match `[A-Za-z0-9._-]+`. A session name that's already active is
refused (no duplicate work). Target another repo with `--repo /path/to/repo`.

### List / inspect sessions
```bash
./watchdog.sh list      # quick table
./watchdog.sh status    # daemon + table + last ledger lines
./watchdog.sh logs refactor-api -f   # live-follow the current run
```

### Resume manually
```bash
./watchdog.sh resume refactor-api            # queue a resume (safety gates apply)
./watchdog.sh resume refactor-api --force    # resume now, bypass gates
```
You rarely need this — the daemon resumes automatically after a reset. Use it to
retry sooner, or after fixing something yourself.

### Stop the watchdog
```bash
./watchdog.sh stop                  # stop the daemon; in-flight claude runs finish
./watchdog.sh stop-session <name>   # stop a single session and its run
```
Stopping the daemon leaves running tasks alone. Restart it any time with any
`start`/`resume`/`approve` command, or `./watchdog.sh status` then a `start`; it
re-attaches to live runs by their tracked pids and never double-launches.

### Survive reboots (auto-start at logon)

```bash
./watchdog.sh install-startup     # once
```

This installs a hidden launcher in your Windows **Startup folder** (no admin
required) that runs `./watchdog.sh boot` at every logon. `boot`:

1. **Recovers interrupted work** — any session left `RUNNING` when the machine
   went down lost its child process, so it's requeued for a clean resume.
2. Starts the detached daemon (and is a no-op if one is already running).

So after a reboot you log in and tracked tasks pick up automatically. Remove it
with `./watchdog.sh uninstall-startup`. To start it immediately without logging
out, the install command prints the exact `wscript.exe ...` line to run.

> Why the Startup folder and not Task Scheduler? Creating a scheduled task
> requires elevation on this machine (UAC); the Startup-folder launcher needs no
> admin rights and achieves the same logon auto-start.

---

## Running 3 parallel Claude Code sessions

One daemon supervises all of them. Just start three named sessions:

```bash
cd ~/Downloads/steinberg-app/.claude-watchdog

./watchdog.sh start security-audit \
  "Perform a security audit of the Firebase rules and client code. Write findings to SECURITY.md. Do not change production config."

./watchdog.sh start test-coverage \
  "Raise unit-test coverage for src/ above 80%. Add tests only; do not modify app logic. Run the suite and report coverage."

./watchdog.sh start docs-refresh \
  "Update README and inline docs to match current features. Docs only — no code changes."

./watchdog.sh status
```

Example `list` output while all three run, one blocked:

```
NAME                STATUS        RSM   PID     WAKE/RESET            LAST ACTIVITY
--------------------------------------------------------------------------------------------
security-audit      RUNNING       0/5   48213   -                     6/14/2026, 10:42:11 AM
test-coverage       BLOCKED       1/5   -       6/14/2026, 3:00:00 PM  6/14/2026, 10:55:02 AM
docs-refresh        DONE          0/5   -       -                     6/14/2026, 10:50:33 AM
```

`test-coverage` hit a limit; the daemon will resume it at ~3pm (+ safety buffer)
without any action from you. Each session has independent logs, resume counts,
and ledger entries, so parallel work never collides.

---

## Testing before real use

The suite exercises detection, reset-time parsing, the JSON store, and a full
**block → wait → resume → done** cycle using a *mock* `claude` (no real usage,
no real limits):

```bash
./watchdog.sh test
# => RESULT: 23 passed, 0 failed   ALL GREEN ✅
```

Simulated log fixtures live in `tests/fixtures/`. Add your own (e.g. paste a real
limit message you've seen) and extend `tests/run-tests.sh` to harden detection
for your account's exact wording.

---

## Safety model

- **Never evades limits.** The watchdog only waits for the official reset and
  resumes. It does not rotate accounts, change identity, or retry to dodge a
  limit.
- **Default-deny tools.** Runs use `--permission-mode acceptEdits` plus an
  allow-list (`ALLOWED_TOOLS`) and a destructive-command block-list
  (`DISALLOWED_TOOLS`, which always wins). Out of the box it blocks `rm`,
  `git push --force`, `git reset --hard`, `git clean`, `sudo`, `dd`, `mkfs`,
  `npm publish`, anything matching `deploy`/`migrate`/`drop`, etc. Tune both in
  `config.env`.
- **Human approval gate.** Every run gets a safety system-prompt instructing the
  agent to refuse destructive/irreversible steps and instead write
  `NEEDS_USER_APPROVAL: <description>` to the ledger and its final message. The
  watchdog detects that, sets the session to `NEEDS_APPROVAL`, and **pauses**.
  Review the ledger, then `./watchdog.sh approve <name>` to continue.
- **No duplicate work.** A session is launched only when no live child pid exists
  for it; active session names can't be re-registered.
- **Bounded retries.** `max_resumes` (default 5) caps auto-resumes per session;
  the session then stops as `MAX_RESUMES` instead of looping forever.
- **Auditable.** Every decision is timestamped in `task-ledger.md`, and full
  terminal output is kept per run under `logs/`.

> ⚠️ The tool block-list is a safety net, not a sandbox. Keep `PERMISSION_MODE`
> at `acceptEdits` (never `bypassPermissions`) for unattended runs, and review
> `ALLOWED_TOOLS`/`DISALLOWED_TOOLS` for your project before leaving it running.

---

## Notifications

Terminal output is always printed and logged. Optionally enable more
(all best-effort, `NOTIFY_DESKTOP=1` by default):

- **Desktop:** macOS `osascript`, Linux `notify-send`, or a Windows balloon toast.
- **Slack:** set `SLACK_WEBHOOK_URL` (in `config.env` or your shell env).
- **Telegram:** set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

Secrets are never hardcoded; `config.env` is gitignored. Prefer exporting webhook
secrets in your shell environment over writing them to disk.

---

## Files

```
.claude-watchdog/
├── watchdog.sh            # CLI + supervising daemon
├── config.env.example     # copy to config.env and edit
├── sessions.json          # tracked sessions (source of truth; gitignored)
├── task-ledger.md         # human-readable task journal (gitignored)
├── logs/                  # per-session run logs + daemon.log (gitignored)
├── lib/
│   ├── json.cjs           # atomic JSON state helper (node)
│   └── detect.sh          # limit detection + reset-time parsing (bash)
└── tests/
    ├── run-tests.sh       # detection + parsing + JSON + e2e tests
    ├── mock-claude.sh     # fake claude for the e2e test
    └── fixtures/          # simulated limit logs
```

---

## Configuration reference

See `config.env.example` for every knob. Most-used:

| Key | Default | Purpose |
|---|---|---|
| `POLL_INTERVAL` | `30` | Seconds between daemon checks. |
| `SAFETY_BUFFER_SECONDS` | `60` | Extra wait after a detected reset. |
| `BACKOFF_BASE_SECONDS` / `BACKOFF_MAX_SECONDS` | `600` / `3600` | Retry backoff when no reset time is found. |
| `DEFAULT_MAX_RESUMES` | `5` | Auto-resume cap per session. |
| `PERMISSION_MODE` | `acceptEdits` | Claude permission mode for runs. |
| `ALLOWED_TOOLS` / `DISALLOWED_TOOLS` | see file | Tool policy (block-list wins). |
| `MODEL` / `FALLBACK_MODEL` / `MAX_BUDGET_USD` | empty | Model & cost controls. |
| `CLAUDE_BIN` | `claude` | Path to the CLI. |

---

## Limitations & notes

- **Timezones in messages are ignored** when parsing a clock time like
  "resets at 3pm (America/New_York)" — it's interpreted in the machine's local
  timezone. The self-correcting retry loop and safety buffer absorb the skew; for
  exactness, prefer accounts/messages that include an epoch or ISO timestamp.
- **The daemon must be running** for auto-resume. `start`/`resume`/`approve`
  auto-start it, and `./watchdog.sh install-startup` makes it come back at every
  logon (recovering interrupted sessions). `./watchdog.sh status` shows whether
  it's up. Note: it restarts at *logon*, not at unattended boot — if the machine
  reboots while you're away, auto-resume continues once you (or autologon) sign
  in.
- **Detection is wording-based.** If your account shows a limit phrase not in
  `lib/detect.sh`'s `LIMIT_PATTERNS`, add it (and a fixture) so it's caught.
```
