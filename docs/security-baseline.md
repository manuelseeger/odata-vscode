# Security baseline

## Supported versions

The minimum VS Code version is 1.109.0. The API types are pinned to 1.109.0. CI runs extension-host tests on 1.109.0 and the current stable release without Copilot or other installed extensions.

VS Code 1.109.0 uses Electron 39.3.0 and Node.js 22.21.1, so the bundle targets Node.js 22. Development and CI use Node.js 26.13.0 and npm 11.20.0. `mise.toml` pins Node.js, and `engines.node` requires it. `package-lock.json` supports reproducible `npm ci` installs.

TypeScript stays on 5.9.3. The TypeScript ESLint parser supports TypeScript versions below 6.1.0. The optional Copilot integration uses the existing chat participant API and prompt-tsx 0.3 API.

## Request policy

`QueryRunner` owns all query and metadata network requests. Its result contains the HTTP status, status text, content type, and bounded UTF-8 text. Callers cannot consume an unbounded transport response.

Requests require a trusted workspace. Query URLs must use the selected endpoint's origin. Endpoint and query URLs accept HTTP or HTTPS and reject user information and fragments. Redirects are blocked, including same-origin redirects.

Authentication and custom headers require HTTPS. There is no HTTP credential exception. Anonymous HTTP requests are available for local-network services.

A request has a 30-second total deadline and a 10 MiB decoded body limit. The limit applies during streamed reads, including compressed responses. Run and Get Metadata show cancellable progress. Request-owned certificate agents, response readers, timers, and cancellation listeners are released after completion or failure. Certificate paths use file URI filesystem paths.

## Restricted mode

Language tools, Copy Query, and public profile inspection remain available in an untrusted workspace. Requests, secret reads, certificate reads, profile selection, profile edits, and chat require workspace trust. Core language and profile registration precede optional chat registration. Model discovery failures do not prevent profile editing or metadata display.

## Profile storage and webviews

Profiles retain their names as their identity. Public storage contains endpoint settings, authentication kind, certificate file references, and metadata. Passwords, bearer tokens, certificate passphrases, and all custom headers use VS Code SecretStorage. The public header map is empty. Stored secret fields cannot replace endpoint or metadata edits.

Storage parsing preserves editable drafts separately from request validation. Legacy HTTP authentication, invalid header names, incomplete certificate pairs, and invalid Basic usernames remain visible and editable. Malformed source objects use a recovery entry. SecretStorage retains the complete source, and the trusted editor displays it under Recovered source data. Recovery entries cannot execute requests. A valid save replaces the recovery data.

Trusted startup, a workspace trust grant, and each trusted storage operation migrate public credentials before mutation or secret loading. Migration secures every profile and the selected snapshot. An orphan selected snapshot becomes an editable profile. Existing canonical secrets take precedence over a stale selected snapshot. Migration retries after failure and performs no public rewrite until all required secret writes succeed. Saves, deletes, selection writes, and migration use one queue. Mutations retain drafts that fail request validation.

The save and request boundary validates HTTP URLs, header tokens and values, local certificate paths, and certificate combinations. Invalid profiles cannot be saved or requested. Updates and renames keep the selected profile current. Private metadata requests use a direct callback, not a global command argument.

Each profile panel owns its message listener and cancellation signal. A disposed panel cannot receive asynchronous results. File dialogs accept only certificate, key, or PFX fields. Webview resources are restricted to `dist/webview`. Scripts use a nonce-based content security policy. Header values, recovered source data, and model labels use DOM properties, not HTML interpolation. Certificate fields receive encoded URI strings, so reserved characters and literal percent sequences survive editing.

## Dependency audit

`npm audit --audit-level=low` checks the full locked dependency tree. The baseline has no accepted advisory exceptions. Overrides select patched minimatch, glob, and serialize-javascript versions, and the direct Mocha version also supplies the host test runner. The validation tests check these tool integrations.

## Validation and distribution

`npm run validate` runs lint, type checks, unit tests, the production build, the dependency audit, and VSIX validation. `npm run test:host` compiles and runs the extension-host and webview smoke tests. `VSCODE_VERSION` selects the host release. `VSCODE_HEADLESS=1` selects Electron's headless platform on Linux. CI uses Xvfb.

Production packaging regenerates the parser. `scripts/check-vsix.mjs` reads the actual archive with `unzip`. It derives resource paths from the extension manifest and checks the webview scripts, stylesheet, and font references. It rejects source files, local agent data, development directories, test output, credential files, and private key material.

Pull requests and releases use `.github/workflows/validate.yml`. Releases publish the validated archive only after both host versions pass. Release checkout does not persist Git credentials, and release dependency installation disables lifecycle scripts. The production VSIX contains no test tooling or source maps.
