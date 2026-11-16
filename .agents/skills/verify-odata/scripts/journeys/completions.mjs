// Feature: metadata-aware completion (features/completions.md).
// Types a query character by character against profile "Mock" and reads the suggest widget.
import { sleep } from "../vscode.mjs";

export default async function (vs, ev, state) {
    await vs.requireSelectedProfile("Mock");
    await vs.closeAllEditors();
    await vs.openWorkspaceFile("completions.odata", "");
    await vs.focusEditor();

    // 1. Resource path: after the service root, Ctrl+Space lists entity sets.
    await vs.type(state.MOCK_URL);
    await sleep(300);
    const sets = await vs.triggerSuggest();
    ev.check("Ctrl+Space after service root lists entity sets Orders, Items",
        sets.includes("Orders") && sets.includes("Items"), sets);
    await ev.shot("entity-sets");
    await vs.kb.press("Escape");

    // 2. System query options: typing `$` opens the list.
    await vs.type("Orders?$");
    const opts = await vs.suggestions();
    ev.check("typing '$' lists system query options", ["$select", "$filter", "$expand", "$orderby"].every((o) => opts.includes(o)), opts);
    await ev.shot("system-query-options");

    // Accept $select via filter text + Enter.
    await vs.type("sel");
    await sleep(300);
    await vs.kb.press("Enter");
    await sleep(200);
    const line = (await vs.editorText()).trim();
    ev.check("accepting the item inserts '$select'", line.endsWith("Orders?$select"), line);

    // 3. Properties: `=` after $select lists the Order properties.
    await vs.type("=");
    const props = await vs.suggestions();
    ev.check("'$select=' lists Order properties",
        ["OrderID", "OrderDate", "CustomerName", "Items"].every((p) => props.includes(p)) && !props.includes("ItemName"), props);
    await ev.shot("select-properties");
    await vs.kb.press("Escape");

    // 4. $expand lists navigation properties only.
    await vs.type("OrderID&$expand=");
    const exp = await vs.suggestions();
    ev.check("'$expand=' lists navigation property Items only", exp.includes("Items") && !exp.includes("OrderID"), exp);
    await ev.shot("expand");
    await vs.kb.press("Escape");

    ev.write("final-text.txt", await vs.editorText());
    await vs.runCommand("File: Save");

    // 5. $format value completion (own line: see Gotchas about $select earlier on the same line).
    await vs.openWorkspaceFile("completions-format.odata", "");
    await vs.focusEditor();
    await vs.type(`${state.MOCK_URL}Orders?$format=`);
    const fmt = await vs.triggerSuggest();
    ev.check("'$format=' offers json and xml", fmt.includes("json") && fmt.includes("xml"), fmt);
    await ev.shot("format-values");
    await vs.kb.press("Escape");
    await vs.runCommand("File: Save");
    await vs.closeAllEditors();
}
