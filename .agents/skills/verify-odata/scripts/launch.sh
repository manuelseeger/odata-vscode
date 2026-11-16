#!/usr/bin/env bash
# Launch one isolated verification instance: mock OData service + headless VS Code with the
# extension loaded from this checkout. Prints the state file path on success.
# Usage: launch.sh [RUN_ID]          (env SKIP_BUILD=1 skips `npm run compile`)
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$SKILL_DIR/../../.." && pwd)"
RUN_ID="${1:-$(date +%Y%m%d-%H%M%S)-$$}"
ROOT="/tmp/verify-odata/$RUN_ID"
EVIDENCE="$HOME/.cache/verify-odata/evidence/$RUN_ID"
TOOLS="$HOME/.cache/verify-odata/tools"
STATE="$ROOT/state.env"

if [[ -f "$STATE" ]]; then
    echo "refusing: $STATE exists. Run cleanup.sh $RUN_ID first or pick another RUN_ID." >&2
    exit 1
fi
mkdir -p "$ROOT"/{home,ud/User,ext,ws} "$EVIDENCE"

# 1. Build the extension (dist/extension.js + dist/webview/*).
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
    (cd "$REPO" && npm run compile >"$ROOT/build.log" 2>&1) || { echo "build failed, see $ROOT/build.log" >&2; exit 1; }
    BUILD_STAMP="$(date +%s)"   # webpack does not rewrite unchanged assets, so dist mtimes can stay old
else
    BUILD_STAMP="$(stat -c %Y "$REPO/dist/extension.js")"
fi

# 2. Tools: VS Code stable (cached in .vscode-test/) and playwright-core (cached in $TOOLS).
CODE_BIN="$(cd "$REPO" && node -e 'require("@vscode/test-electron").downloadAndUnzipVSCode("stable").then(p=>console.log(p))' 2>/dev/null | tail -1)"
[[ -x "$CODE_BIN" ]] || { echo "VS Code download failed" >&2; exit 1; }
if [[ ! -d "$TOOLS/node_modules/playwright-core" ]]; then
    mkdir -p "$TOOLS" && (cd "$TOOLS" && npm init -y >/dev/null && npm i playwright-core >/dev/null 2>&1)
fi

# 3. Free ports.
read -r MOCK_PORT CDP_PORT < <(node -e '
const net=require("net");const get=()=>new Promise(r=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>r(p));});});
Promise.all([get(),get()]).then(a=>console.log(a.join(" ")));')

# 4. Mock OData service.
setsid node "$SKILL_DIR/scripts/mock-odata-server.mjs" "$MOCK_PORT" "$EVIDENCE/requests.jsonl" \
    >"$ROOT/mock.log" 2>&1 &
MOCK_PID=$!

# 5. VS Code user settings: no welcome page, no AI, no updates, no telemetry.
cat >"$ROOT/ud/User/settings.json" <<'JSON'
{
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.enableExperiments": false,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "extensions.autoCheckUpdates": false,
  "extensions.autoUpdate": false,
  "security.workspace.trust.enabled": false,
  "chat.disableAIFeatures": true,
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "git.enabled": false,
  "window.restoreWindows": "none",
  "window.dialogStyle": "custom",
  "window.newWindowDimensions": "maximized",
  "editor.tabSize": 4,
  "files.eol": "\n"
}
JSON

# 6. Headless VS Code. HOME is redirected so ~/.vscode-shared and keyrings stay inside $ROOT.
HOME="$ROOT/home" setsid "$CODE_BIN" \
    --extensionDevelopmentPath="$REPO" \
    --disable-extensions \
    --user-data-dir="$ROOT/ud" \
    --extensions-dir="$ROOT/ext" \
    --password-store=basic \
    --ozone-platform=headless --ozone-override-screen-size=1600,1000 --disable-gpu \
    --remote-debugging-port="$CDP_PORT" \
    --skip-welcome --skip-release-notes --disable-workspace-trust \
    --new-window "$ROOT/ws" >"$ROOT/code.log" 2>&1 &
CODE_PID=$!

cat >"$STATE" <<EOF
RUN_ID=$RUN_ID
REPO=$REPO
ROOT=$ROOT
WS=$ROOT/ws
EVIDENCE=$EVIDENCE
TOOLS=$TOOLS
CODE_BIN=$CODE_BIN
MOCK_PORT=$MOCK_PORT
MOCK_URL=http://127.0.0.1:$MOCK_PORT/odata/
MOCK_PID=$MOCK_PID
CDP_PORT=$CDP_PORT
CODE_PID=$CODE_PID
BUILD_STAMP=$BUILD_STAMP
EOF

# 7. Ready = workbench rendered AND the OData extension contributes its commands.
if ! RUN_ID="$RUN_ID" node "$SKILL_DIR/scripts/drive.mjs" wait-ready >"$ROOT/ready.log" 2>&1; then
    echo "not ready, see $ROOT/ready.log $ROOT/code.log" >&2
    exit 1
fi
echo "$STATE"
