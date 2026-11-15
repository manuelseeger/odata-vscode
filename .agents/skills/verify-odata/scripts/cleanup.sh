#!/usr/bin/env bash
# Tear down the instance of RUN_ID: kill only the process sessions launch.sh started, then
# remove /tmp/verify-odata/RUN_ID. Evidence in ~/.cache/verify-odata/evidence/RUN_ID is kept;
# the VS Code logs are copied there first.
# Usage: cleanup.sh RUN_ID
set -uo pipefail
RUN_ID="${1:?usage: cleanup.sh RUN_ID}"
ROOT="/tmp/verify-odata/$RUN_ID"
STATE="$ROOT/state.env"
if [[ ! -f "$STATE" ]]; then
    echo "nothing to clean: $STATE missing"
    exit 0
fi
# shellcheck disable=SC1090
source "$STATE"

# Keep logs as evidence.
mkdir -p "$EVIDENCE/logs"
cp -r "$ROOT/ud/logs" "$EVIDENCE/logs/vscode" 2>/dev/null || true
cp "$ROOT"/*.log "$EVIDENCE/logs/" 2>/dev/null || true

# Both processes were started with setsid, so their pid is also the session id. Kill the session.
for pid in "$CODE_PID" "$MOCK_PID"; do
    members="$(ps -eo pid=,sid= | awk -v s="$pid" '$2==s{print $1}')"
    [[ -n "$members" ]] && kill $members 2>/dev/null
done
sleep 2
for pid in "$CODE_PID" "$MOCK_PID"; do
    members="$(ps -eo pid=,sid= | awk -v s="$pid" '$2==s{print $1}')"
    [[ -n "$members" ]] && kill -9 $members 2>/dev/null
done

rm -rf "$ROOT"
echo "cleaned $ROOT; evidence kept in $EVIDENCE"
