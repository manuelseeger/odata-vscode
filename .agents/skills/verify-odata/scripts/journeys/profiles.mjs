// Feature: endpoint profiles (features/profiles.md).
// Creates profile "Mock" through the "OData: Add Endpoint Profile" webview, requests metadata
// from the mock service, and proves the profile is listed, selected, and persisted.
export const PROFILE = "Mock";

export default async function (vs, ev, state) {
    const before = vs.requestLog().length;

    // Open the form from the command palette.
    await vs.runCommand("OData: Add Endpoint Profile");
    await vs.page.locator(".tabs-container .tab.active", { hasText: "Create HTTP Profile" }).waitFor({ timeout: 15000 });
    const form = await vs.webviewFrame("#profileForm");
    await form.locator("#formTitle", { hasText: "Create Profile" }).waitFor({ timeout: 10000 });
    ev.check("palette opens 'Create HTTP Profile' webview", true);
    await ev.shot("form-open");

    // Fill name + service URL like a user (change fires on blur -> auto-save).
    await form.locator("#name").click();
    await form.locator("#name").pressSequentially(PROFILE, { delay: 20 });
    await form.locator("#name").press("Tab");
    await form.locator("#baseUrl").click();
    await form.locator("#baseUrl").pressSequentially(state.MOCK_URL, { delay: 5 });
    await form.locator("#baseUrl").press("Tab");
    await ev.shot("form-filled");

    // Request metadata from the service.
    await form.locator("#requestMetadataButton").click();
    await form.locator("#metadata").evaluate(
        (el) => new Promise((res, rej) => {
            const t = setInterval(() => el.value.includes("<edmx:Edmx") && (clearInterval(t), res()), 200);
            setTimeout(() => (clearInterval(t), rej(new Error("metadata textarea stayed empty"))), 15000);
        }),
    );
    const md = await form.locator("#metadata").inputValue();
    ev.check("Request Metadata fills the Metadata textarea", md.includes('EntitySet Name="Orders"'), md.length);
    const tokens = await form.locator("#tokenCountInfo").innerText();
    ev.check("compact schema token count is shown", /^\d+$/.test(tokens.trim()), tokens);
    const fit = await form.locator("#schemaFitInfo").innerText();
    ev.check("compact schema fits the configured maximum", fit.includes("Fits the configured maximum of 32000 tokens"), fit);
    const formText = await form.locator("body").innerText();
    ev.check("retired filter advice is absent", !formText.includes("Use filtering in Settings"));
    ev.check("Copilot models table is absent", !formText.includes("Copilot Models") && (await form.locator("#modelInfo").count()) === 0);
    await ev.shot("metadata-received");

    const reqs = vs.requestLog().slice(before).map((r) => r.url);
    ev.check("mock service received GET /odata/$metadata", reqs.includes("/odata/$metadata"), reqs);

    // Profile appears in the explorer view, selected (check icon) because it is the first profile.
    const rows = await vs.profileRows((r) => r.some((x) => x.label === PROFILE && x.checked));
    ev.check("profile listed and selected in 'OData Endpoint Profiles' view",
        rows.some((r) => r.label === PROFILE && r.checked), rows);
    await ev.shot("profiles-view");
    await ev.aria("profiles-view", await vs.profilesView());

    // Select Endpoint Profile quick pick lists it.
    await vs.runCommand("OData: Select Endpoint Profile");
    const picks = await vs.quickPickRows();
    ev.check("'OData: Select Endpoint Profile' lists the profile", picks.includes(PROFILE), picks);
    await ev.shot("select-profile-pick");
    await vs.pickQuickPick(PROFILE);

    // Get Metadata command (palette) refreshes metadata for the selected profile.
    const n2 = vs.requestLog().length;
    await vs.runCommand("OData: Get Metadata");
    const msg = await vs.waitForNotification(/Metadata updated successfully/);
    ev.check("'OData: Get Metadata' reports success", msg.includes(PROFILE), msg);
    ev.check("Get Metadata hit the service again",
        vs.requestLog().slice(n2).some((r) => r.url === "/odata/$metadata"));
    await ev.shot("get-metadata");
    await vs.clearNotifications();

    // Reopen through the inline Edit action: persisted values come back.
    await vs.closeAllEditors();
    const pane = await vs.profilesView();
    const row = pane.locator(".monaco-list-row", { hasText: PROFILE }).first();
    await row.hover();
    await row.locator('.action-label[aria-label="Edit HTTP Profile"]').click();
    await vs.page.locator(".tabs-container .tab.active", { hasText: `Edit Profile: ${PROFILE}` }).waitFor({ timeout: 15000 });
    const edit = await vs.webviewFrame("#profileForm");
    await edit.locator("#formTitle", { hasText: "Edit Profile" }).waitFor({ timeout: 10000 });
    const vals = {
        name: await edit.locator("#name").inputValue(),
        baseUrl: await edit.locator("#baseUrl").inputValue(),
        metadataHasOrders: (await edit.locator("#metadata").inputValue()).includes("Orders"),
    };
    ev.check("Edit HTTP Profile shows persisted name, URL, metadata",
        vals.name === PROFILE && vals.baseUrl === state.MOCK_URL && vals.metadataHasOrders, vals);
    await ev.shot("edit-profile");
    await vs.closeAllEditors();

    // Second profile "Scratch": added unselected, then removed with the inline Delete action.
    await vs.runCommand("OData: Add Endpoint Profile");
    const f2 = await vs.webviewFrame("#profileForm");
    await f2.locator("#formTitle", { hasText: "Create Profile" }).waitFor({ timeout: 10000 });
    await f2.locator("#name").click();
    await f2.locator("#name").pressSequentially("Scratch", { delay: 20 });
    await f2.locator("#name").press("Tab");
    await f2.locator("#baseUrl").click();
    await f2.locator("#baseUrl").pressSequentially("http://127.0.0.1:9/none/", { delay: 5 });
    await f2.locator("#baseUrl").press("Tab");
    let rows2 = await vs.profileRows((r) => r.some((x) => x.label === "Scratch"));
    ev.check("second profile is listed but Mock stays selected",
        rows2.some((x) => x.label === "Scratch" && !x.checked) && rows2.some((x) => x.label === PROFILE && x.checked), rows2);
    await ev.shot("two-profiles");
    await vs.closeAllEditors();
    const p2 = await vs.profilesView();
    const scratch = p2.locator(".monaco-list-row", { hasText: "Scratch" }).first();
    await scratch.hover();
    await scratch.locator('.action-label[aria-label="Delete HTTP Profile"]').click();
    rows2 = await vs.profileRows((r) => !r.some((x) => x.label === "Scratch"));
    ev.check("Delete HTTP Profile removes it; Mock remains selected",
        !rows2.some((x) => x.label === "Scratch") && rows2.some((x) => x.label === PROFILE && x.checked), rows2);
    await ev.shot("after-delete");
}
