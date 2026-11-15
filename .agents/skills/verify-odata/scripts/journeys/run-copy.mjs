// Feature: run query and copy query (features/run-copy.md).
// OData: Run sends the editor query to the mock service and opens the formatted response beside;
// OData: Copy Query to Clipboard copies the combined one-line URL.
import { sleep } from "../vscode.mjs";

export default async function (vs, ev, state) {
    await vs.requireSelectedProfile("Mock");
    await vs.closeAllEditors();

    // Multi-line query (the formatter layout) is combined into one URL before sending.
    const query = `${state.MOCK_URL}\n    Orders?\n        $select=OrderID,CustomerName&\n        $top=2`;
    await vs.openWorkspaceFile("run.odata", query + "\n");

    // Run / Copy are only in the palette for OData editors.
    const entries = await vs.paletteEntries("OData:");
    ev.check("palette shows 'OData: Run' and 'OData: Copy Query to Clipboard' in an OData editor",
        entries.includes("OData: Run") && entries.includes("OData: Copy Query to Clipboard"), entries);

    const before = vs.requestLog().length;
    await vs.focusEditor();
    await vs.runCommand("OData: Run");
    // Result opens in a second editor group (odata.openResultInNewPane=true by default).
    const group2 = vs.page.locator(".editor-group-container").nth(1);
    await group2.waitFor({ state: "visible", timeout: 15000 });
    await sleep(1500);
    const resultEditor = group2.locator(".editor-instance .monaco-editor").first();
    const result = await vs.editorText(resultEditor);
    ev.write("result.txt", result);
    let parsed;
    try { parsed = JSON.parse(result); } catch { parsed = undefined; }
    ev.check("result opens beside as formatted JSON with 2 rows",
        parsed && parsed.value.length === 2 && parsed.value[0].CustomerName === "Alfreds" && result.includes("\n    "), result.slice(0, 200));
    const lang = await vs.languageStatus();
    ev.check("result editor language is JSON", lang.trim() === "JSON", lang);
    const reqs = vs.requestLog().slice(before).map((r) => r.url);
    ev.write("run-requests.json", reqs);
    ev.check("service received one combined GET with $select, $top and $format=json",
        reqs.some((u) => (u = decodeURIComponent(u)).startsWith("/odata/Orders?") && u.includes("$select=OrderID,CustomerName") && u.includes("$top=2") && u.includes("$format=json")), reqs);
    await ev.shot("run-result");

    // Error path: unknown entity set -> 404 notification with "Show Response".
    await vs.closeAllEditors();
    await vs.openWorkspaceFile("run-404.odata", `${state.MOCK_URL}DoesNotExist\n`);
    await vs.focusEditor();
    await vs.runCommand("OData: Run");
    const msg = await vs.waitForNotification(/Running query failed: 404/);
    ev.check("404 response -> 'Running query failed: 404 Not Found' notification", /404 Not Found/.test(msg), msg);
    const showBtn = vs.page.locator(".notifications-toasts .notification-toast .monaco-button", { hasText: "Show Response" });
    ev.check("notification offers 'Show Response'", (await showBtn.count()) > 0);
    await ev.shot("run-404");
    await vs.clearNotifications();

    // Copy query: combined single-line URL + default $format, read back by pasting.
    await vs.closeAllEditors();
    await vs.openWorkspaceFile("run.odata");
    await vs.focusEditor();
    await vs.runCommand("OData: Copy Query to Clipboard");
    const note = await vs.waitForNotification(/Query copied to clipboard/);
    ev.check("copy shows 'Query copied to clipboard.'", !!note, note);
    await vs.clearNotifications();
    const pasted = (await vs.clipboardViaPaste()).trim();
    ev.write("clipboard.txt", pasted);
    ev.check("clipboard holds the one-line URL with &$format=json",
        pasted === `${state.MOCK_URL}Orders?$select=OrderID,CustomerName&$top=2&$format=json`, pasted);
    await ev.shot("copy");
    await vs.closeAllEditors();
}
