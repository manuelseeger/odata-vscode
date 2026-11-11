# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-11-11

### Breaking changes

- The minimum VS Code version is 1.146.0.
- Authentication and custom headers require an HTTPS endpoint. Requests with credentials to an HTTP endpoint fail. Anonymous HTTP requests are available.
- Redirects are blocked, including same-origin redirects.
- A query URL must use the origin of the selected endpoint. Endpoint and query URLs with user information or a fragment are rejected.
- A request stops after 30 seconds. A response body is limited to 10 MiB.
- In an untrusted workspace, requests, secret reads, certificate reads, profile selection, profile edits, and chat are not available. Language tools, Copy Query, and profile inspection are available.
- A profile with an invalid URL, header, certificate path, or certificate combination cannot be saved or used for requests. The profile stays editable.

### Added

- Cancellable progress for Run and Get Metadata
- Recovery of malformed profile data in the profile editor
- Troubleshooting note for TLS inspection proxies (`NODE_EXTRA_CA_CERTS`)

### Fixed

- Line breaks between tokens in a multiline query become a space in the combined URL (#6)
- Signature help shows before the closing parenthesis is typed

### Changed

- Custom headers are stored in the VS Code secret storage. Existing profiles migrate automatically when the workspace is trusted.
- Maintenance: updated dependencies and build tooling

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
