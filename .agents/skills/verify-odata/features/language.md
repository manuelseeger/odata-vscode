# Language support

Files with the `.odata` extension open in language mode "OData" and get TextMate highlighting from `syntaxes/odata.tmLanguage.json` (scope `source.odata`). "Format Document" puts a valid query on separate lines (service root, resource path, one line for each query option). An invalid query stays unchanged. No profile is necessary.

## Sub-features

- `lang-mode` sets the language mode to OData for `*.odata` (status bar).
- `lang-highlight` gives tokens `*.odata` TextMate scopes (for example, `keyword.control.odata` on `$filter`).
- `lang-format` changes a one-line query to the multi-line layout.
- `lang-format-invalid` keeps a query that has a syntax error unchanged.

## How to get to it (user POV)

- Open or create any `*.odata` file. You can also set the language mode to "OData" for an untitled editor.
- Command palette: `Format Document`. Keyboard: Shift+Alt+F.
- Command palette: `Developer: Inspect Editor Tokens and Scopes` shows the highlighting scopes.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` shows only OK lines.

- **Open file.** `vs.openWorkspaceFile("language.odata", <one-line query>)`. The status bar item `status.editor.mode` shows `OData`.
- **Inspect scopes.** Put the cursor in `$filter` and run `Developer: Inspect Editor Tokens and Scopes`. `.token-inspect-widget` contains `source.odata` and `keyword.control.odata`.
- **Format.** Run `Format Document`. The editor text is equal to the multi-line layout (indentation of 4 and 8 spaces, `&` at line ends).
- **Format invalid.** Open `language-bad.odata` with `$fi lter=…` and run `Format Document`. The text does not change.
- Command: `RUN_ID=$RUN_ID scripts/drive.mjs language`. Evidence: `language/02-token-inspect.png`, `token-inspect.txt`, `03-formatted.png`, `formatted.txt`, `result.json`.

## Gotchas

- The formatter uses `editor.tabSize`. `launch.sh` sets it to 4. The expected text depends on it.
- After the journey, `language.odata` stays in `ws/`. When a profile is selected, its `Customer` navigation property gives two warnings in Problems. These warnings are expected (the mock metadata has no `Customer`).
