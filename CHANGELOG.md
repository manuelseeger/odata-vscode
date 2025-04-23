# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - unreleased

### Added

- Click to open query in mouse hover


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
