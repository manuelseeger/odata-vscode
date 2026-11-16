# Hovers and signature help

When a user hovers an entity set name in a query, the extension shows the entity set, its entity type, and its typed properties from the metadata of the selected profile. Hovering a recognized function name shows its documentation and parameters; other eligible hovers show the selected profile, its base URL, and the combined one-line query as a link. When the user types an OData function call such as `contains(`, signature help shows the parameters and highlights the active parameter.

## Sub-features

- `hover-entity-set` shows `Entity Set: Orders`, `Entity Type: Order`, and `OrderID (Edm.Int32)` and the other properties.
- `hover-profile` shows `Selected Profile: Mock`, `Base URL: …`, and `Query: <combined url>`.
- `sig-open` shows `contains(string: Edm.String, substring: Edm.String)` after `contains(`.
- `sig-active-param` moves the active parameter to the next parameter after each `,`.

## How to get to it (user POV)

- Move the mouse over text in an `*.odata` editor. You can also put the cursor there and run `Show or Focus Hover`.
- Type `(` or `,` in a function call. You can also press Ctrl+Shift+Space (`Trigger Parameter Hints`).

## Driving it with drive.mjs

Preconditions:

- Profile `Mock` is listed and selected (run `profiles` first).

- **Entity set hover.** Open `hover.odata` with `MOCK_URL` + `Orders?$select=OrderID` and run `vs.hoverAtText("Orders", 2)`. The hover contains `Entity Set: Orders`, `Entity Type: Order`, and `OrderID (Edm.Int32)`.
- **Profile hover.** Run `vs.hoverAtText("$select", 3)`. The hover contains `Selected Profile: Mock`, `Base URL: MOCK_URL`, and `Query:`.
- **Signature.** In an empty `signature.odata`, type `MOCK_URL` + `Orders?$filter=contains(`. `.parameter-hints-widget` shows `contains(string: Edm.String, substring: Edm.String)`, and the active parameter is `string: Edm.String`.
- **Next parameter.** Type `CustomerName,`. The active parameter is `substring: Edm.String`.
- Command: `RUN_ID=$RUN_ID scripts/drive.mjs hover-signature`. Evidence: `hover-signature/01-hover-entity-set.png` … `04-signature-second-param.png`, `hover-entity-set.txt`, `hover-profile.txt`, `signature-open.txt`, `result.json`.

## Gotchas

- Monaco renders the full URL (including `Orders`) as one token span. Hover by character position (`hoverAtText`). Do not hover a span element.
- The URL is a detected link, so each hover also contains "Follow link (ctrl + click)".
- Move the mouse away between hovers (`hoverAtText` does this), because a hover that is still open shows the old content.
- The signature widget lists all functions (`01/39`). Assert the active signature label, not the count.
