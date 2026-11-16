export default async function (vs, ev) {
    const before = await vs.profileRows();
    if (!before.some((row) => row.label === "Second") || !before.some((row) => row.checked)) {
        throw new Error("Create Mock and Second profiles before this journey.");
    }
    await vs.clearNotifications();
    await vs.runCommand("OData: Select Endpoint Profile");
    const selectionMessage = await vs.waitForNotification(/Cannot select|Trust this workspace/);
    ev.check("selection explains workspace trust", /select.*profile.*trust|trust.*select.*profile/i.test(selectionMessage), selectionMessage);
    ev.check("selection does not open a picker", !(await vs.page.locator(".quick-input-widget").isVisible()));
    ev.check("selection preserves profiles", JSON.stringify(await vs.profileRows()) === JSON.stringify(before));
    await ev.shot("selection-blocked");
    await vs.clearNotifications();
    const pane = await vs.profilesView();
    const row = pane.locator(".monaco-list-row", { hasText: "Second" }).first();
    await row.hover();
    await row.locator('.action-label[aria-label="Delete HTTP Profile"]').click();
    const deletionMessage = await vs.waitForNotification(/Cannot delete|Trust this workspace/);
    ev.check("deletion explains workspace trust", /delete.*profile.*trust|trust.*delete.*profile/i.test(deletionMessage), deletionMessage);
    ev.check("deletion has no generic command error", !deletionMessage.includes("Error running command"), deletionMessage);
    ev.check("deletion preserves profiles", JSON.stringify(await vs.profileRows()) === JSON.stringify(before));
    await ev.shot("deletion-blocked");
}
