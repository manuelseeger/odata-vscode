# OData extension verification map

This directory is the maintained source for verifying the user-facing, non-Copilot behavior of the OData VS Code extension. Read this index before you drive, then use the applicable feature file as the recipe. The `@odata` chat participant and the Copilot tools are out of scope.

## Baseline preconditions

- Start an instance with `scripts/launch.sh $RUN_ID`. It builds `dist/`, starts the mock OData service at `http://127.0.0.1:<MOCK_PORT>/odata/`, and starts headless VS Code with this checkout as the development extension.
- `scripts/doctor.sh $RUN_ID` shows only `OK` lines.
- The mock service has entity sets `Orders` (Order: `OrderID`, `OrderDate`, `CustomerName`, navigation property `Items`) and `Items` (Item: `ItemID`, `ItemName`, `Quantity`). `Orders` has 3 rows (the first row has `CustomerName` `Alfreds`), and `Items` has 2 rows.
- The metadata-aware features (completions, diagnostics, hover-signature, run-copy) require profile `Mock` to be listed and selected. Only the `profiles` journey creates it. Run `profiles` first on each new instance.
- Do not drive an instance that this run did not start.

## Driving conventions

- Run every journey with `RUN_ID=$RUN_ID scripts/drive.mjs <journey>`. Run them in sequence on the same instance, `profiles` first.
- Use command palette titles, view names, aria-labels, and webview element ids. Do not use positions.
- Type into editors with the keyboard. Diagnostics and trigger-character completions occur only when you type.
- Each journey closes its editors when it ends. It keeps profile `Mock` and the files in `ws/`.

## Proof and skip reporting

- Each journey writes screenshots, observed values, and `result.json` to `~/.cache/verify-odata/evidence/$RUN_ID/<journey>/`.
- HTTP side effects are in `~/.cache/verify-odata/evidence/$RUN_ID/requests.jsonl`.
- Report a failed precondition (for example, no `Mock` profile) as a failure with the reason. Do not report it as a pass through a different path.
- When a feature file names an entry point that its journey does not drive, that entry point is not verified. Report it as not verified.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph that describes the user-visible behavior. Then it has these four H2 sections, in this sequence: `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.mjs`, `Gotchas`.

## Features

- [Endpoint profiles](./profiles.md): create, request metadata, list and select, Get Metadata, edit, and delete. Journey `profiles`.
- [Language support](./language.md): language mode, TextMate highlighting, and the document formatter. Journey `language`.
- [Completions](./completions.md): entity sets, system query options, properties, navigation properties, and `$format` values. Journey `completions`.
- [Diagnostics](./diagnostics.md): syntax errors and metadata-aware warnings in the editor and in Problems. Journey `diagnostics`.
- [Hovers and signature help](./hover-signature.md): entity set hover, profile and query hover, and function signatures. Journey `hover-signature`.
- [Run and copy query](./run-copy.md): `OData: Run` against the service, error handling, and `OData: Copy Query to Clipboard`. Journey `run-copy`.
