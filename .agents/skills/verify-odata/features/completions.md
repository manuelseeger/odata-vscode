# Completions

While a user types a query, the suggest widget offers items from the metadata of the selected profile: entity sets after the service root, properties after `$select=` / `$filter=`, navigation properties after `$expand=`, system query options after `$`, `json` / `xml` after `$format=`, and OData functions (V2, plus V4 for V4 services).

## Sub-features

- `complete-resource` lists entity sets (`Orders`, `Items`) when no resource path is present.
- `complete-system-options` lists `$select`, `$filter`, `$expand`, `$orderby` and the other options when you type `$`. Accepting an item inserts the name.
- `complete-select-props` lists the properties of the resource entity type after `$select=`.
- `complete-expand` lists only navigation properties after `$expand=`.
- `complete-format` offers `json` and `xml` after `$format=`.
- `complete-functions` lists OData functions (for example, `contains`) in other places.

## How to get to it (user POV)

- Type in an `*.odata` editor. The trigger characters are `$ . = , ( / '`.
- Ctrl+Space anywhere in an `*.odata` editor.

## Driving it with drive.mjs

Preconditions:

- Profile `Mock` is listed and selected (run `profiles` first).

- **Resource.** In an empty `completions.odata`, type `MOCK_URL`, then press Ctrl+Space. The rows include `Orders` and `Items`.
- **System options.** Type `Orders?$`. The rows include `$select`, `$filter`, `$expand`, and `$orderby`. Type `sel` and press Enter. The line ends with `Orders?$select`.
- **Select properties.** Type `=`. The rows are `OrderID`, `OrderDate`, `CustomerName`, and `Items`, and not `ItemName`.
- **Expand.** Type `OrderID&$expand=`. The rows include `Items` and not `OrderID`.
- **Format.** In `completions-format.odata`, type `MOCK_URL` + `Orders?$format=` and press Ctrl+Space. The rows include `json` and `xml`.
- Command: `RUN_ID=$RUN_ID scripts/drive.mjs completions`. Evidence: `completions/01-entity-sets.png` … `05-format-values.png`, `result.json`.

## Gotchas

- Known defect: when `$select=` is earlier on the same line, `$format=` gets no `json` / `xml` items. The `$select=.*` check in the default provider matches to the end of the line and returns null. This is why the journey tests `$format` on a separate query line. Multi-line (formatted) queries are not affected.
- The suggest list is virtualized. Only about 12 rows are rendered. Do not assert items that are lower in the list.
- The `$format=` list also contains the entity properties, because the metadata provider also contributes items.
- Completions use the metadata that is stored in the profile. If you change the mock service, you must run `OData: Get Metadata` again.
