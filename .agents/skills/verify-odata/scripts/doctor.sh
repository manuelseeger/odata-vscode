#!/usr/bin/env bash
# Read-only health check for the instance of RUN_ID. Exit 0 only if every check passes.
# Usage: doctor.sh RUN_ID
set -uo pipefail
RUN_ID="${1:?usage: doctor.sh RUN_ID}"
STATE="/tmp/verify-odata/$RUN_ID/state.env"
[[ -f "$STATE" ]] || { echo "FAIL no state file $STATE"; exit 1; }
# shellcheck disable=SC1090
source "$STATE"
rc=0
ok() { echo "OK   $*"; }
bad() { echo "FAIL $*"; rc=1; }

kill -0 "$MOCK_PID" 2>/dev/null && ok "mock server pid $MOCK_PID alive" || bad "mock server pid $MOCK_PID dead"
kill -0 "$CODE_PID" 2>/dev/null && ok "vscode pid $CODE_PID alive" || bad "vscode pid $CODE_PID dead"

# Ports are owned by our pids (not by some other process).
owner() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }
mo="$(owner "$MOCK_PORT")"; [[ "$mo" == "$MOCK_PID" ]] && ok "port $MOCK_PORT owned by mock" || bad "port $MOCK_PORT owner=$mo (expected $MOCK_PID)"
co="$(owner "$CDP_PORT")"
if [[ -n "$co" ]] && { [[ "$co" == "$CODE_PID" ]] || [[ "$(ps -o sid= -p "$co" | tr -d ' ')" == "$CODE_PID" ]]; }; then
    ok "CDP port $CDP_PORT owned by vscode session $CODE_PID"
else
    bad "CDP port $CDP_PORT owner=$co (expected session $CODE_PID)"
fi

code="$(curl -s -o /dev/null -w '%{http_code}' "${MOCK_URL}\$metadata")"
[[ "$code" == 200 ]] && ok "GET ${MOCK_URL}\$metadata -> 200" || bad "GET ${MOCK_URL}\$metadata -> $code"

title="$(curl -s "http://127.0.0.1:$CDP_PORT/json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const p=JSON.parse(s).find(t=>t.url.includes("workbench.html"));console.log(p?p.title:"")}catch{console.log("")}})')"
[[ "$title" == *"Visual Studio Code"* ]] && ok "workbench page: $title" || bad "workbench page not found (title='$title')"

# The running VS Code loads the extension from this checkout.
if { tr '\0' ' ' <"/proc/$CODE_PID/cmdline"; } 2>/dev/null | grep -q -- "--extensionDevelopmentPath=$REPO"; then
    ok "extensionDevelopmentPath=$REPO"
else
    bad "vscode not started with --extensionDevelopmentPath=$REPO"
fi

# The build is not older than src/ (a stale build verifies old code). Generated parser files are excluded.
newest_src="$(find "$REPO/src" -type f -not -path '*/test/*' -not -name 'parser.js' -not -name 'parser.d.ts' -printf '%T@\n' | sort -n | tail -1)"
if [[ ${newest_src%.*} -le ${BUILD_STAMP:-0} ]]; then ok "build is current (src not changed since build)"; else bad "src/ changed after the build - cleanup and relaunch without SKIP_BUILD"; fi

grep -q "Activating extension 'manuelseeger.odata' failed" "$ROOT/ud/logs"/*/window*/exthost/exthost.log 2>/dev/null \
    && bad "extension activation failed (see exthost.log)" || ok "no activation failure in exthost.log"

exit $rc
