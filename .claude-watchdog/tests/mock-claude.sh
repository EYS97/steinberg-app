#!/usr/bin/env bash
# mock-claude.sh — stand-in for the real `claude` CLI, used only by the test
# suite so we can exercise the full block -> wait -> resume -> done cycle
# WITHOUT consuming real usage or hitting real limits.
#
# Behaviour:
#   - initial run (no --resume/-r): print a usage-limit message with a reset
#     epoch ~3s in the future, then exit non-zero (simulates being blocked).
#   - resumed run (--resume/-r present): print success and exit 0.
is_resume=0
for a in "$@"; do
  case "$a" in -r|--resume) is_resume=1 ;; esac
done

if [ "$is_resume" = 1 ]; then
  echo "[mock-claude] resumed session; finishing the task."
  echo "All steps complete."
  exit 0
else
  echo "[mock-claude] starting task..."
  reset="$(date -d '+3 seconds' +%s)"
  echo "Claude usage limit reached. Your limit will reset at ${reset}."
  exit 1
fi
