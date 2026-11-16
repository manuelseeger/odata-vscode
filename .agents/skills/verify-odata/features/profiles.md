# Endpoint profiles

A user creates an endpoint profile (name, service URL, auth, headers) in the "Create HTTP Profile" webview. The user requests `$metadata` from the service into the profile, and then sees the profile in the explorer view "OData Endpoint Profiles". The selected profile has a check icon. The selected profile supplies the metadata for all metadata-aware features and the base for `OData: Run`.

## Sub-features

- `profile-create` opens the form from the palette or from the view title `+` and saves the profile automatically when a field loses focus.
- `profile-metadata` fills the Metadata textarea and the token counts with the "Request Metadata" button.
- `profile-list-select` lists profiles in the view and selects a saved profile when none is selected. `OData: Select Endpoint Profile` changes the selection.
- `profile-get-metadata` refreshes the metadata of the selected profile with `OData: Get Metadata`.
- `profile-edit` opens the inline action "Edit HTTP Profile" with the stored values.
- `profile-delete` removes a profile with the inline action "Delete HTTP Profile". If the deleted profile was selected, the selection moves to the first remaining profile.
- `profile-auth` provides the Basic, Bearer, and Client Cert fields (Auth Type select). Secrets go to VS Code secret storage.

## How to get to it (user POV)

- Command palette: `OData: Add Endpoint Profile`, `OData: Select Endpoint Profile`, `OData: Get Metadata`.
- Explorer view "OData Endpoint Profiles": title action `OData: Add Endpoint Profile` (`+`), and the inline row actions `Edit HTTP Profile` and `Delete HTTP Profile`.
- Webview form: the fields `Name`, `Service URL`, `Auth Type`, the `Headers` `+` button, the `Request Metadata` button, and the `Metadata` textarea.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` shows only OK lines. No profile named `Scratch` exists.

- **Open form.** Run `OData: Add Endpoint Profile` (`vs.runCommand`). The tab "Create HTTP Profile" opens and `#formTitle` is "Create Profile".
- **Fill form.** Type `Mock` into `#name`, then Tab. Type the `MOCK_URL` into `#baseUrl`, then Tab. The form saves the profile automatically.
- **Request metadata.** Click `#requestMetadataButton`. `#metadata` contains `<edmx:Edmx` and `EntitySet Name="Orders"`, and `#tokenCountInfo` shows a number. `requests.jsonl` gets `GET /odata/$metadata`.
- **List and select.** Expand the view "OData Endpoint Profiles". Row `Mock` has the check icon.
- **Select command.** Run `OData: Select Endpoint Profile`. The quick pick lists `Mock`. Choose it.
- **Get Metadata.** Run `OData: Get Metadata`. The toast "Metadata updated successfully for profile Mock." shows, and `requests.jsonl` gets one more `$metadata` request.
- **Edit.** Hover row `Mock` and click `Edit HTTP Profile`. The tab "Edit Profile: Mock" shows the stored name, URL, and metadata.
- **Delete.** Add `Scratch` (URL `http://127.0.0.1:9/none/`) through the form. It is listed without a check. Hover it and click `Delete HTTP Profile`. The row disappears and `Mock` keeps the check.
- Command: `RUN_ID=$RUN_ID scripts/drive.mjs profiles`. Evidence: `profiles/01-form-open.png` … `10-after-delete.png`, `05-profiles-view.aria.txt`, `result.json`.

## Gotchas

- The form saves only on `change` (blur), and only when Name and Service URL are both set. Press Tab after you type.
- Name is the identity. When you create a profile with an existing name, the existing profile is overwritten.
- The tree renders slowly after you expand it. `vs.profileRows(until)` polls for this reason.
- The journey does not drive `profile-auth` (Basic, Bearer, Client Cert) or headers. The mock service does not check auth. To verify auth, add a check of the `authorization` header in `requests.jsonl` and report it separately.
- The Client Cert file pickers open a native file dialog. They do not work in headless mode. Type the path into the field.
- The "Github Copilot Models" section of the form belongs to the Copilot feature. Ignore it.
