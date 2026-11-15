# Diagnostics

While a user edits a query, the extension reports syntax errors as errors (as warnings when `odata.strictParser` is false). It also reports names that are not in the metadata of the selected profile as warnings. The diagnostics show as squiggles in the editor and as rows in the Problems panel, and they clear when the query is valid.

## Sub-features

- `diag-syntax` reports a parser error (`Expected … but "$" found.`) with Error severity.
- `diag-resource` reports an unknown entity set: `Resource path 'X' not found in the entity container of profile Mock.`
- `diag-select` reports an unknown `$select` item: `Select item 'X' not found in the resource Orders of profile Mock.`
- `diag-property` reports an unknown property in `$filter`: `Property 'X' not found in the resource Orders of profile Mock.`
- `diag-expand` reports an unknown navigation parent or child (`Parent 'X' not found as a navigational property …`).
- `diag-clear` removes all problems for the file when the query is valid.
- `diag-strict` uses Warning instead of Error for syntax errors when `odata.strictParser` is false.

## How to get to it (user POV)

- Type in an `*.odata` editor and look at the squiggles. Hover a squiggle to see the message.
- Problems panel: Ctrl+Shift+M, or the error and warning counts in the status bar.
- Settings UI: `OData › Strict Parser`.

## Driving it with drive.mjs

Preconditions:

- Profile `Mock` is listed and selected (run `profiles` first).

- **Unknown entity set.** In `diagnostics.odata`, replace the text with `MOCK_URL` + `Orderz?$top=1`. Problems for the file show `Warning: Resource path 'Orderz' not found in the entity container of profile Mock.`, and the editor has a warning squiggle.
- **Unknown select.** Type `…Orders?$select=OrderID,Nope`. Problems show `Select item 'Nope' not found in the resource Orders of profile Mock.`
- **Unknown filter property.** Type `…Orders?$filter=Missing eq 1`. Problems show `Property 'Missing' not found in the resource Orders of profile Mock.`
- **Syntax error.** Type `…Orders?$fi lter=OrderID eq 1`. Problems show `Error: Expected … but "$" found.`, and the editor has an error squiggle.
- **Valid.** Type `…Orders?$select=OrderID,CustomerName&$expand=Items&$top=2`. Problems for the file are empty.
- Command: `RUN_ID=$RUN_ID scripts/drive.mjs diagnostics`. Evidence: `diagnostics/01-unknown-entity-set.png` … `05-valid-query.png`, `06-problems-panel.aria.txt`, `syntax-error-problems.json`, `result.json`.

## Gotchas

- Diagnostics run only on text changes. Opening a file does not produce diagnostics. Type into it (`replaceAll` in the journey selects all, deletes, and types).
- Problems keep the entries of other files, also when those files are closed. Use `vs.problemsInFile(name)`.
- An unknown `$expand` navigation property gives two warnings. One of them has a stray leading quote: `'Resource Orders doesn't have a navigational property Customer …`. This is a cosmetic defect in the message text.
- The journey does not drive `diag-strict`. To verify it, change `OData › Strict Parser` in the Settings UI (palette `Preferences: Open Settings (UI)`, search `odata.strictParser`), and then repeat the syntax error step and expect `Warning:`.
