# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking changes

- Replace the `@odata` Copilot chat participant with the explicit `/odata` skill.

### Added

- Add opt-in Copilot tools to share filtered metadata and open a drafted query for review. Enable `odata.chat.tools.enabled` to use them. Opening a query never runs it. Use **OData: Run** to execute it.

## [0.4.1] - 2026-11-13

### Breaking changes

- A profile with authentication or custom headers must use an HTTPS endpoint. Only anonymous profiles without custom headers can use HTTP.
- Endpoint and query URLs must use HTTP or HTTPS and cannot contain user information or a fragment.
- A custom `Authorization` header cannot be used together with profile authentication.
- Custom headers cannot use the names `Host`, `Connection`, `Content-Length`, `Transfer-Encoding`, `Upgrade`, or names that start with `Proxy-` or `Sec-`.
- A Basic authentication username cannot contain a colon. A bearer token must contain only printable ASCII characters.
- Client certificate paths must be absolute local file paths. A client certificate profile uses either a PFX file or a certificate and key pair, not both.
- A profile that does not obey these rules cannot be saved or used for requests. Existing profiles of this type stay in the list and you can edit them.

### Added

- Language tools, Copy Query, and profile viewing are available in Restricted Mode. Requests, profile selection, profile edits, and chat require workspace trust.
- Run shows a progress notification. You can cancel Run and Get Metadata.
- Malformed stored profiles show as recovered profiles. The profile editor shows the recovered source data. Repair a recovered profile before you use it.
- Troubleshooting note for TLS inspection proxies (`NODE_EXTRA_CA_CERTS`)

### Fixed

- Line breaks between tokens in a multiline query become a space in the combined URL (#6)
- Signature help shows when the cursor is next to a closing parenthesis
- Client certificate authentication with a certificate and key pair uses the passphrase for an encrypted key

### Changed

- The minimum VS Code version is 1.145.0.
- Redirects are blocked, including same-origin redirects.
- A query URL must use the origin of the selected endpoint.
- A request stops after 30 seconds. A response body is limited to 10 MiB.
- Custom headers are stored in the VS Code secret storage. Existing profiles migrate automatically when the workspace is trusted.
- Maintenance: updated dependencies

## [0.3.1] - 2025-04-25

### Added

- Click to open query in mouse hover
- Add `odata.openResultInNewPane` setting to control if query results open in a new pane (new default) or the active pane

### Fixed

- Profile UI not updating after new profile selection
- Credentials synced between VSCode profiles; Now stored in local secret store

## [0.3.0] - 2025-04-19

### Added

- Option to disable query runner
- Progress indicator when requesting metadata from profile
- Option to filter metadata based on XPath expressions
- Default XPath filter for Annotations
- Add default format when copying query to clipboard
- Provide hover texts for EntityType and selected profile

### Fixed

- Model dependent token limits instead of hardcoded limits
- Request metadata from treeview fixed
- Trim profile endpoint URL
- Trim trailing spaces when combining URL
- Result document didn't always show correct language
- Profile tree UI didn't update on metadata retrieval

### Removed

- Settings `odata.removeAnnotations` removed, this is now default behavior and implemented via XPath

## [0.2.0] - 2025-04-13

### Added

- Allow filtering of metadata for profile
- Copy Query command: Add current combined single-line query to clipboard
- OData function signature help
- Show response on query runner failure

### Fixed

- Register commands only for odata language
- Property names in output from diagnostics fixed

## [0.1.5] - 2025-04-06

### Added

- Marketplace integration improvements

## [0.1.4] - 2025-04-04

### Fixed

- Missing stylesheets on endpoint profile UI

## [0.1.1] - 2025-04-04

### Added

- Github Copilot integration
- Multiline OData query parser
- Query runner / HTTP client
- Endpoint profiles with maintenance UI
- Metadata-aware code completion
- Metadata-aware diagnostics
- OData Query formatter
- Syntax highlighting
