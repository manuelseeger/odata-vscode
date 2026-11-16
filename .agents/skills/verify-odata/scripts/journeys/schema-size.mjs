export default async function (vs, ev) {
    await vs.requireSelectedProfile("Mock");
    const pane = await vs.profilesView();
    const row = pane.locator(".monaco-list-row", { hasText: "Mock" }).first();
    await row.hover();
    await row.locator('.action-label[aria-label="Edit HTTP Profile"]').click();
    const form = await vs.webviewFrame("#profileForm");
    await form.locator("#schemaFitInfo", { hasText: "Fits the configured maximum of 32000 tokens." }).waitFor();
    const tokens = await form.locator("#tokenCountInfo").innerText();
    ev.check("summary size is numeric", /^\d+$/.test(tokens), tokens);
    await ev.shot("fits-default");

    await vs.runCommand("Preferences: Open Workspace Settings (JSON)");
    const original = (await vs.editorText()).trim();
    if (!/^\{\s*\}$/.test(original)) throw new Error("Expected empty workspace settings");
    async function saveSettings(text) {
        await vs.focusEditor();
        await vs.kb.press("Control+a");
        await vs.kb.press("Backspace");
        await vs.kb.insertText(text);
        await vs.kb.press("Control+s");
        await vs.page.getByRole("button", { name: "Close Modal Editor (Escape)", exact: true }).click();
    }
    async function profileTab() {
        await vs.page.locator(".tabs-container .tab", { hasText: "Edit Profile: Mock" }).first().click();
        return vs.webviewFrame("#profileForm");
    }
    try {
        await saveSettings('{"odata.chat.schema.maxTokens": 1}');
        let current = await profileTab();
        await current.locator("#schemaFitInfo", { hasText: "Exceeds the configured maximum of 1 token." }).waitFor();
        ev.check("changing the maximum updates the open profile", true, await current.locator("#schemaFitInfo").innerText());
        ev.check("changing the maximum does not truncate the summary", await current.locator("#tokenCountInfo").innerText() === tokens);
        await ev.shot("exceeds-maximum");
        await vs.runCommand("Preferences: Open Workspace Settings (JSON)");
        await saveSettings(original);
        current = await profileTab();
        await current.locator("#schemaFitInfo", { hasText: "Fits the configured maximum of 32000 tokens." }).waitFor();
        ev.check("restoring the maximum updates the open profile", true);
        await ev.shot("fits-restored");
    } finally {
        await vs.runCommand("Preferences: Open Workspace Settings (JSON)");
        await saveSettings(original);
        await vs.closeAllEditors();
    }
}
