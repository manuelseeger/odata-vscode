---
name: verify-odata
description: Drive the OData VS Code extension (this repo) in a real, headless VS Code through its workbench UI and capture proof. Use to verify language mode, highlighting, formatting, diagnostics, completions, hovers, signature help, endpoint profiles (webview + explorer view), and the Run / Copy / Get Metadata / Select Profile commands after a change. Does not cover the Copilot chat participant (@odata) or Copilot tools.
---

# verify-odata

Proves the non-Copilot features of the `odata` extension by driving a real VS Code window. The window has the extension loaded from this checkout and talks to a local mock OData v4 service. All input goes through the workbench UI: command palette, keyboard, mouse, webview form, explorer view, Problems panel. There are no internal setters and no test-only commands.

- Surface: VS Code extension (language `odata`, `*.odata` files). Other surfaces: the `@odata` chat participant and Copilot tools are out of scope.
- Harness: VS Code stable (downloaded to `.vscode-test/`) runs with `--ozone-platform=headless`, so no X server or sudo is necessary. `playwright-core` connects over CDP. The helpers are in `scripts/`.
- Feature map: [`features/README.md`](features/README.md). Read it before you drive.

All paths below are relative to this skill directory (`.pi/skills/verify-odata/`).

## Launch

```bash
RUN_ID=v$(date +%H%M%S)            # pick one per run; every artifact is keyed by it
scripts/launch.sh "$RUN_ID"         # prints /tmp/verify-odata/$RUN_ID/state.env on success
```

`launch.sh` does these steps in sequence:
1. It runs `npm run compile` in the repo (peggy and webpack produce `dist/extension.js` and `dist/webview/*`). Log: `/tmp/verify-odata/$RUN_ID/build.log`. Use `SKIP_BUILD=1` only when `dist/` is current. `doctor.sh` then compares `src/` with the mtime of `dist/extension.js`.
2. It makes sure that VS Code stable is in `.vscode-test/` (the first run downloads about 360 MB) and that `playwright-core` is in `~/.cache/verify-odata/tools/`.
3. It starts `scripts/mock-odata-server.mjs` on a free port at `127.0.0.1`. The service serves `/odata/$metadata` (from `fixtures/metadata.xml`, entity sets `Orders` and `Items`) and `/odata/Orders` and `/odata/Items` (with `$top` and `$select` support). Other paths return 404 with a JSON body. The service writes each request as a JSON line to `$EVIDENCE/requests.jsonl`.
4. It starts VS Code with `--extensionDevelopmentPath=<repo>`, `--disable-extensions`, a new `--user-data-dir`, `--extensions-dir`, and `HOME` below `/tmp/verify-odata/$RUN_ID/`, plus `--password-store=basic`, a 1600x1000 virtual screen, and a free `--remote-debugging-port`. The workspace folder is `/tmp/verify-odata/$RUN_ID/ws`. User settings disable the welcome page, AI and chat features, updates, and telemetry, and set `window.dialogStyle: custom`. Native dialogs crash headless VS Code.
5. The instance is ready when the workbench page renders, the status bar shows, and the command palette lists `OData: Add Endpoint Profile`. This proves that the extension contributed its commands. Log: `/tmp/verify-odata/$RUN_ID/ready.log`.

A new instance has no endpoint profiles. Run the `profiles` journey first: it creates profile `Mock` through the UI. The other metadata-aware journeys require it.

Instances are isolated: ports, user data, extensions, HOME, and workspace are all per `RUN_ID`. Two runs can operate at the same time. Do not drive an instance that this run did not start.

## Doctor

```bash
scripts/doctor.sh "$RUN_ID"
```

This check is read-only. All lines must be `OK`. It checks: both pids are alive, the mock port and the CDP port belong to our processes, `$metadata` returns 200, the workbench page exists, VS Code runs with `--extensionDevelopmentPath` set to this repo, the build is newer than the last `src/` change, and `exthost.log` has no activation failure. Run it first when anything looks wrong. If a line fails, run cleanup and launch again. Do not repair a live instance by hand.

## Drive

```bash
RUN_ID=$RUN_ID scripts/drive.mjs list                         # journeys available
RUN_ID=$RUN_ID scripts/drive.mjs profiles                     # one journey
RUN_ID=$RUN_ID scripts/drive.mjs profiles language completions diagnostics hover-signature run-copy
RUN_ID=$RUN_ID scripts/drive.mjs eval 'return await vs.paletteEntries("OData:")'   # ad-hoc step
```

Each journey (`scripts/journeys/<name>.mjs`) writes `PASS/FAIL <journey>: <check> -> <observed>` lines and a final `OK` or `FAILED` line. The exit code is 1 if a check fails or a step throws. One `features/<name>.md` file documents each journey.

For new steps, use `scripts/vscode.mjs` (the `vs` object in `eval` and in journeys). Main helpers:

| Helper | What it does (user path) |
|---|---|
| `vs.runCommand(title)` | F1, types `>title`, clicks the exact palette row (`.quick-input-list .label-name`) |
| `vs.paletteEntries(filter)` | palette labels that match `filter` |
| `vs.quickPickRows()` / `vs.pickQuickPick(label)` | read or choose rows of an open quick pick |
| `vs.openWorkspaceFile(name, content?)` | writes `ws/<name>` (optional), opens it with Ctrl+P and the absolute path |
| `vs.focusEditor()`, `vs.type(text)`, `vs.kb.press(key)` | keyboard input into the active editor |
| `vs.editorText(editorLocator?)` | rendered text of an editor (`.view-line`, NBSP changed to space) |
| `vs.triggerSuggest()` / `vs.suggestions()` | Ctrl+Space, or wait for the suggest widget, and return the visible `.label-name` rows |
| `vs.hoverAtText(text, index)` | moves the mouse onto the character `index` of `text` in the editor and returns the `.monaco-hover` text |
| `vs.signatureHelp()` | text of `.parameter-hints-widget` |
| `vs.problemsInFile(name)` | opens Problems (Ctrl+Shift+M) and returns the rows for that file (`Warning: … at line N …`) |
| `vs.squiggles("error"\|"warning")` | count of squiggles in the active editor |
| `vs.waitForNotification(re)` / `vs.clearNotifications()` | toast messages |
| `vs.profileRows()` / `vs.profilesView()` | rows of the explorer view "OData Endpoint Profiles" (`label`, `checked` = check icon = selected) |
| `vs.webviewFrame("#profileForm")` | the frame of the profile webview (`#name`, `#baseUrl`, `#authKind`, `#requestMetadataButton`, `#metadata`, `#tokenCountInfo`) |
| `vs.clipboardViaPaste()` | pastes the clipboard into a new untitled editor, reads it, and closes it |
| `vs.closeAllEditors()` | View: Close All Editors, and clicks "Don't Save" for untitled results |
| `vs.requestLog()` | entries of `requests.jsonl` (what the extension sent to the service) |
| `vs.requireSelectedProfile("Mock")` | precondition: throws when profile `Mock` is not listed and selected |

Stable handles: command titles from `package.json` (`OData: Run`, `OData: Copy Query to Clipboard`, `OData: Add Endpoint Profile`, `OData: Get Metadata`, `OData: Select Endpoint Profile`), view name `OData Endpoint Profiles`, inline actions `Edit HTTP Profile` and `Delete HTTP Profile` (aria-label), webview element ids, and the status bar item `status.editor.mode`. Do not use coordinates, except for `hoverAtText`, which calculates them from the rendered text.

## Evidence

All proof is in `~/.cache/verify-odata/evidence/$RUN_ID/`:
- `<journey>/NN-<step>.png`: screenshots in step sequence. They show the action and the resulting state.
- `<journey>/*.aria.txt`: ARIA snapshots (profiles view, Problems panel).
- `<journey>/*.txt|*.json`: observed values (editor text, hover text, clipboard, Problems rows, requests).
- `<journey>/result.json`: all checks with pass/fail and observed detail.
- `requests.jsonl`: every HTTP request that the extension sent to the mock service. This is the side-effect proof for Run and metadata.
- `logs/`: VS Code logs (including `exthost.log`), build, mock, and ready logs. `cleanup.sh` copies them here.

Proof standards:
- Use the real user path: palette, keyboard, mouse, and webview form. Do not call `vscode.commands.executeCommand` for extension internals, do not write `globalState`, and do not make the extension skip input.
- For each claim, capture the action and the result (screenshot before or after, plus the observed value).
- Verify side effects in addition to the screen: `requests.jsonl` for HTTP, the clipboard read back by paste, and profile persistence by opening the profile again in Edit.
- The mock service is the only mock. It replaces a remote OData service at the HTTP boundary. Everything inside VS Code is real.
- A failed precondition (for example, no `Mock` profile) is a failure. Report it. Do not change the journey to pass.

## Cleanup

```bash
scripts/cleanup.sh "$RUN_ID"
```

This kills only the two process sessions that `launch.sh` started (pids in `state.env`, started with `setsid`). It does not kill by name. Then it removes `/tmp/verify-odata/$RUN_ID/`. Before it removes anything, it copies the logs to the evidence directory. Evidence stays in `~/.cache/verify-odata/evidence/$RUN_ID/`. Run cleanup after every run, also after a failed run. Do not use `pkill -f` with a pattern that is also in your own shell command line, because it kills the shell.

## Gotchas

- The extension declares only `onChatParticipant` as an activation event. VS Code activates it from contributions (opening an `.odata` file, the view, or a command). The ready check waits for the palette entries for this reason.
- `OData: Run` and `OData: Copy Query to Clipboard` show in the palette only when the active editor is `odata`.
- Diagnostics run only on document changes. A file that is open but not edited shows no problems. Type into it.
- Diagnostics stay in Problems for closed files. Filter with `problemsInFile`.
- Query results open as dirty untitled JSON documents. Close them with `closeAllEditors()`, which answers "Don't Save". A native save dialog would kill headless VS Code.
- The suggest list is virtualized: `suggestions()` returns only the rendered rows (about 12).
- The profile webview saves automatically on `change` (blur). Type, then press Tab. `fill()` alone does not save.
- `$metadata` is fetched again by `OData: Get Metadata` and by the `Request Metadata` button only. Completions use the stored metadata.
