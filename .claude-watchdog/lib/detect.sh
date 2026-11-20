#!/usr/bin/env bash
# detect.sh — limit detection + reset-time parsing.
# Sourced by watchdog.sh. Pure bash + GNU `date`. No external interpreter.

# Phrases that indicate a Claude Code run was blocked by a usage/rate/token limit.
# Case-insensitive, extended-regex, anchored loosely so we catch CLI + API wording.
LIMIT_PATTERNS='usage limit|rate limit|rate.?limited|token limit|limit reset|limit will reset|resets at|reset at|current session resets|try again|wait until|too many requests|429|quota exceeded|insufficient quota|out of (usage|tokens|credits)'

# A run-completion marker the supervised claude run writes on clean exit (see watchdog.sh).
DONE_MARKER='__WD_RUN_COMPLETE__'

# A marker the agent (or the run wrapper) writes when a risky step needs a human.
APPROVAL_MARKER='NEEDS_USER_APPROVAL'

# log_is_blocked <logfile>  -> exit 0 if the log shows a limit block.
log_is_blocked() {
  local f="$1"
  [ -f "$f" ] || return 1
  # Only inspect the tail; limit messages appear at the end of a blocked run.
  tail -c 8000 "$f" 2>/dev/null | grep -qiE "$LIMIT_PATTERNS"
}

# log_needs_approval <logfile> -> exit 0 if a NEEDS_USER_APPROVAL marker is present.
log_needs_approval() {
  local f="$1"
  [ -f "$f" ] || return 1
  grep -qF "$APPROVAL_MARKER" "$f" 2>/dev/null
}

# parse_reset_time <logfile>
# Prints a future epoch (seconds) for when the limit resets, or nothing if it
# can't be determined. Strategy, most-specific first:
#   1) explicit unix epoch in the text (10-digit, year ~2023-2033)
#   2) "try again in N seconds|minutes|hours"
#   3) ISO-8601 datetime  (YYYY-MM-DD[ T]HH:MM[:SS])
#   4) clock time after a reset/until keyword ("3pm", "3:30pm", "15:00", "10:00 PM")
# NOTE: timezone names in messages (e.g. "(America/New_York)") are ignored; the
# clock time is interpreted in the machine's local timezone. A misparse is
# self-correcting: if we wake too early the next run hits the limit again, is
# re-detected, and we wait again. The safety buffer absorbs small skew.
parse_reset_time() {
  local f="$1"
  [ -f "$f" ] || return 0
  local text now epoch
  text="$(tail -c 8000 "$f" 2>/dev/null | tr '\n' ' ')"
  now="$(date +%s)"

  # 1) explicit epoch
  epoch="$(grep -oE '\b1[6-9][0-9]{8}\b' <<<"$text" | head -n1)"
  if [ -n "$epoch" ]; then echo "$epoch"; return 0; fi

  # 2) relative "try again in N unit"
  local rel
  rel="$(grep -oiE 'try again in (about )?[0-9]+ (second|minute|hour)s?' <<<"$text" | head -n1)"
  if [ -n "$rel" ]; then
    local n unit
    n="$(grep -oE '[0-9]+' <<<"$rel" | head -n1)"
    unit="$(grep -oiE '(second|minute|hour)' <<<"$rel" | head -n1 | tr 'A-Z' 'a-z')"
    epoch="$(date -d "+${n} ${unit}s" +%s 2>/dev/null)"
    if [ -n "$epoch" ]; then echo "$epoch"; return 0; fi
  fi

  # 3) ISO datetime
  local iso
  iso="$(grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?' <<<"$text" | head -n1)"
  if [ -n "$iso" ]; then
    iso="${iso/T/ }"
    epoch="$(date -d "$iso" +%s 2>/dev/null)"
    if [ -n "$epoch" ] && [ "$epoch" -gt "$now" ]; then echo "$epoch"; return 0; fi
  fi

  # 4) clock time after a reset/until keyword
  local clk
  clk="$(grep -oiE '(reset[s]?( at| will be at)?|resets|until|available again at)[: ]+[0-9]{1,2}(:[0-9]{2})? ?(am|pm)?' <<<"$text" | head -n1)"
  if [ -n "$clk" ]; then
    local tok
    tok="$(grep -oiE '[0-9]{1,2}(:[0-9]{2})? ?(am|pm)?$' <<<"$clk" | head -n1 | tr 'A-Z' 'a-z' | sed 's/ //g')"
    if [ -n "$tok" ]; then
      epoch="$(date -d "$tok" +%s 2>/dev/null)"
      if [ -n "$epoch" ]; then
        # if that clock time already passed today, it means tomorrow
        if [ "$epoch" -le "$now" ]; then epoch=$((epoch + 86400)); fi
        echo "$epoch"; return 0
      fi
    fi
  fi

  return 0  # nothing parseable -> caller falls back to exponential backoff
}
