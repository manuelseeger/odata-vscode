# Run and copy query

`OData: Run` combines the (multi-line) query of the active OData editor into one URL and adds `$format=<odata.defaultFormat>` if absent, except for a query ending in `$count`. Then it sends the request with the auth and headers of the selected profile and opens the response as a formatted document beside the query (JSON or XML language). An error status gives an error toast. `OData: Copy Query to Clipboard` copies the combined one-line URL, adding `$format` only if absent.

## Sub-features

- `run-success` opens a formatted JSON result in a second editor group. The service gets one combined GET with `$format=json`.
- `run-error` shows the toast `Running query failed: 404 Not Found` with a `Show Response` button for a non-2xx status with a body.
- `run-palette-scope` shows `OData: Run` and `OData: Copy Query to Clipboard` in the palette only for OData editors.
- `copy-query` copies the one-line URL with `&$format=json` and shows the toast `Query copied to clipboard.`
- `run-settings` controls the result pane (`odata.openResultInNewPane`), turns the runner off (`odata.disableRunner`), and sets the format (`odata.defaultFormat` json|xml).

## How to get to it (user POV)

- Command palette in an `*.odata` editor: `OData: Run`, `OData: Copy Query to Clipboard`.
- Settings UI: `OData › Open Result In New Pane`, `OData › Disable Runner`, `OData › Default Format`.

## Driving it with drive.mjs

Preconditions:

- Profile `Mock` is listed and selected (run `profiles` first). The mock service is up (`doctor.sh`).

- **Palette scope.** Open `run.odata` (a multi-line query: `MOCK_URL` / `Orders?` / `$select=OrderID,CustomerName&` / `$top=2`). `vs.paletteEntries("OData:")` includes `OData: Run` and `OData: Copy Query to Clipboard`.
- **Run.** Run `OData: Run`. A second editor group shows pretty-printed JSON with 2 rows (the first row has `CustomerName` `Alfreds`), and the status bar language is `JSON`. `requests.jsonl` has `/odata/Orders?%24select=OrderID%2CCustomerName&%24top=2&%24format=json`.
- **Run error.** Open `run-404.odata` with `MOCK_URL` + `DoesNotExist` and run `OData: Run`. The toast `Running query failed: 404 Not Found` shows with a `Show Response` button.
- **Copy.** Open `run.odata` again and run `OData: Copy Query to Clipboard`. The toast `Query copied to clipboard.` shows. When you paste into a new untitled editor, you get `MOCK_URL` + `Orders?$select=OrderID,CustomerName&$top=2&$format=json`.
- Command: `RUN_ID=$RUN_ID scripts/drive.mjs run-copy`. Evidence: `run-copy/01-run-result.png`, `result.txt`, `run-requests.json`, `02-run-404.png`, `03-copy.png`, `clipboard.txt`, `result.json`, and `../requests.jsonl`.

## Gotchas

- The result document is an untitled, dirty document. Use `vs.closeAllEditors()`, which clicks "Don't Save". `launch.sh` sets `window.dialogStyle: custom` because a native dialog kills headless VS Code.
- The extension uses the same result document for all runs in a session. A second run replaces its content.
- The request URL in `requests.jsonl` is percent-encoded (`%24select`). Decode it before you compare.
- The journey does not drive `run-settings`. To verify it, change the setting in the Settings UI, then repeat **Run**. For `disableRunner`, `requests.jsonl` must not get a new line. For `openResultInNewPane=false`, the result must open in group 1. For `defaultFormat=xml`, the request must have `$format=xml`.
- The mock service sends a JSON body with each 404, so `Show Response` always shows. A 404 with an empty body shows no button. The journey does not drive that case.
