# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-16

### Added

- Metadata-aware diagnostics and completions work at any depth of a query: nested `$expand` and `$select` options, property paths, type casts, `any`/`all` lambda expressions with their range variables, `$apply`, `$compute` aliases, `$root` and `$it`. (#27)
- The parser accepts `any`/`all`, `$apply`, `$compute`, `$search` expressions, `in`, `has`, `divby`, `case`, JSON parameter values, enumeration and typed literals, key-as-segment paths, 4.01 query options without `$`, and OData V2 literals (`datetime'..'`, `guid'..'`, `1.5m`, `X'..'`). (#27)
- Special paths (`/$count`, `/$value`, `/$ref`, `/$metadata`, `/$batch`, `/$crossjoin(..)`) are recognized as part of the resource path. (#27)
- Warnings for unknown and duplicate system query options, unknown functions, a wrong number of function arguments, key names that are no key properties, `$expand` of a property that is no navigation property, and `any`/`all` on a single value. (#27)
- Completions for resource path segments, operators after an operand, `asc`/`desc`, query options inside `$expand(..)`, and lambda range variables. Built-in functions are only offered where an operand can start. (#27)
- Hover shows the type of a property anywhere in the query. (#27)
- A query with a syntax error is still checked against the metadata, as far as it can be read. (#27)

### Changed

- Metadata warnings name the type a property was looked up on, for example `Property 'Nope' not found on type 'NS.Customer'.` (#27)
- Syntax error messages list what was expected in condensed form. (#27)
- Completing a system query option inserts the `=` as well. (#27)
- The service root of a query is taken from the selected profile's base URL, so resource paths of more than one segment are checked from their first segment. (#27)

### Fixed

- Queries that Copilot opens show readable text, for example spaces, quotes, and Unicode, when the decoded query gives the same request URL. (#29)
- A syntax error stayed in the Problems view after it was fixed, if no profile was selected. (#27)
- Operator precedence in `$filter` expressions follows the specification. (#27)

## [0.5.0] - 2026-11-16

### Added

- `odata.chat.schema.maxTokens`, with a default of `32000`, limits the schema size. Summaries above the maximum return no schema. The profile editor shows the summary size and whether it fits. (#24)
- Built-in function hovers show overload signatures, descriptions, and parameters, including when no endpoint profile is selected. (#20)

### Changed

- Use the explicit `/odata` Copilot skill to draft queries. Enable `odata.chat.tools.enabled` to use its tools. (#22)
- The metadata filter settings `odata.metadata.filterNs`, `odata.metadata.filterXPath`, and `odata.metadata.xpathDefaultNsPrefix` are removed. (#24)
- Metadata-aware completions, diagnostics, and hovers resolve qualified types and inherited members in OData V2 and V4 services. Hovers show qualified type names. (#26)
- Queries drafted by Copilot must use the selected service root before they can open for review. (#24)

### Fixed

- Syntax and metadata diagnostics are available when an OData document opens, including documents already open when the extension activates. (#19)
- Profile selection and deletion show extension error messages in Restricted Mode. Profile selection checks workspace trust before it opens the picker. (#21)
- Completions, diagnostics, and hovers use updated metadata when the schema changes at the same service root. (#26)

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
