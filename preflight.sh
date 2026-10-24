#!/usr/bin/env bash
# Checks every key and service in parallel (<60s) and prints a PASS/FAIL/SKIP table. Exit 1 if anything FAILs.
cd "$(dirname "$0")" && exec node scripts/preflight.js "$@"
