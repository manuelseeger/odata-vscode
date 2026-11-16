// Feature: diagnostics (features/diagnostics.md).
// Syntax errors and metadata-aware warnings appear in the editor and the Problems panel while
// typing, and clear when the query is fixed.
import { sleep } from "../vscode.mjs";

const FILE = "diagnostics.odata";

async function problemsFor(vs, re, timeout = 8000) {
    const deadline = Date.now() + timeout;
    let rows = [];
    do {
        rows = await vs.problemsInFile(FILE);
        if (re.test(rows.join("\n"))) break;
        await sleep(500);
    } while (Date.now() < deadline);
    return rows;
}

async function replaceAll(vs, text) {
    await vs.focusEditor();
    await vs.kb.press("Control+A");
    await vs.kb.press("Delete");
    await vs.type(text, 5);
    await sleep(1000);
}

export default async function (vs, ev, state) {
    await vs.requireSelectedProfile("Mock");
    await vs.closeAllEditors();
    await vs.openWorkspaceFile(FILE, "");

    // Unknown entity set.
    await replaceAll(vs, `${state.MOCK_URL}Orderz?$top=1`);
    let rows = await problemsFor(vs, /Resource path 'Orderz' not found/);
    ev.check("unknown entity set -> \"Resource path 'Orderz' not found ... profile Mock\"",
        rows.some((r) => /Resource path 'Orderz' not found in the entity container of profile Mock/.test(r)), rows);
    ev.check("editor shows a warning squiggle", (await vs.squiggles("warning")) > 0);
    await ev.shot("unknown-entity-set");

    // Unknown $select property.
    await replaceAll(vs, `${state.MOCK_URL}Orders?$select=OrderID,Nope`);
    rows = await problemsFor(vs, /Nope/);
    ev.check("unknown $select item -> \"Select item 'Nope' not found\"",
        rows.some((r) => /Select item 'Nope' not found in the resource Orders of profile Mock/.test(r)), rows);
    await ev.shot("unknown-select");

    // Unknown property in $filter.
    await replaceAll(vs, `${state.MOCK_URL}Orders?$filter=Missing eq 1`);
    rows = await problemsFor(vs, /Missing/);
    ev.check("unknown $filter property -> \"Property 'Missing' not found\"",
        rows.some((r) => /Property 'Missing' not found in the resource Orders of profile Mock/.test(r)), rows);
    await ev.shot("unknown-filter-property");

    // Syntax error (odata.strictParser=true by default -> Error severity).
    await replaceAll(vs, `${state.MOCK_URL}Orders?$fi lter=OrderID eq 1`);
    rows = await problemsFor(vs, /Error/i);
    ev.write("syntax-error-problems.json", rows);
    ev.check("syntax error is reported with Error severity", rows.some((r) => /^Error: Expected .* but "\$" found/.test(r)), rows);
    ev.check("editor shows an error squiggle", (await vs.squiggles("error")) > 0);
    await ev.shot("syntax-error");

    // Valid query -> no problems.
    await replaceAll(vs, `${state.MOCK_URL}Orders?$select=OrderID,CustomerName&$expand=Items&$top=2`);
    await sleep(1000);
    rows = await vs.problemsInFile(FILE);
    ev.check("valid query clears all problems", rows.length === 0, rows);
    await ev.shot("valid-query");
    await ev.aria("problems-panel", vs.page.locator(".markers-panel"));

    await vs.runCommand("File: Save");
    await vs.closeAllEditors();
}
