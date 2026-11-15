// Feature: language support (features/language.md).
// .odata files get the OData language mode, TextMate highlighting (source.odata scopes) and the
// document formatter. No profile needed.
import { sleep } from "../vscode.mjs";

const QUERY =
    "https://services.example.org/svc/Orders?$expand=Customer&$filter=Customer/City eq 'Berlin'&$top=5";
const FORMATTED = [
    "https://services.example.org/svc/",
    "    Orders?",
    "        $expand=Customer&",
    "        $filter=Customer/City eq 'Berlin'&",
    "        $top=5",
].join("\n");

export default async function (vs, ev) {
    await vs.closeAllEditors();
    await vs.openWorkspaceFile("language.odata", QUERY + "\n");
    const mode = await vs.languageStatus();
    ev.check("status bar language mode is 'OData' for *.odata", mode.trim() === "OData", mode);
    await ev.shot("opened");

    // Highlighting: Developer: Inspect Editor Tokens and Scopes on `$filter`.
    await vs.focusEditor();
    await vs.kb.press("Control+Home");
    const col = QUERY.indexOf("$filter") + 2;
    for (let i = 0; i < col; i++) await vs.kb.press("ArrowRight");
    await vs.runCommand("Developer: Inspect Editor Tokens and Scopes");
    const inspect = vs.page.locator(".token-inspect-widget");
    await inspect.waitFor({ state: "visible", timeout: 10000 });
    await sleep(500);
    const scopes = await inspect.innerText();
    ev.write("token-inspect.txt", scopes);
    ev.check("token at $filter has a source.odata TextMate scope", scopes.includes("source.odata"), scopes.split("\n").filter((l) => /odata/.test(l)));
    await ev.shot("token-inspect");
    await vs.kb.press("Escape");

    // Formatter: Format Document (Shift+Alt+F) splits the query into lines.
    await vs.focusEditor();
    await vs.runCommand("Format Document");
    await sleep(800);
    const text = (await vs.editorText()).trimEnd();
    ev.write("formatted.txt", text);
    ev.check("Format Document produces the multi-line layout", text === FORMATTED, text);
    await ev.shot("formatted");
    await vs.runCommand("File: Save");

    // Formatter keeps invalid queries unchanged.
    const BAD = "https://services.example.org/svc/Orders?$fi lter=startswith(Name, 'A')";
    await vs.openWorkspaceFile("language-bad.odata", BAD + "\n");
    await vs.focusEditor();
    await vs.runCommand("Format Document");
    await sleep(800);
    const bad = (await vs.editorText()).trimEnd();
    ev.check("Format Document leaves a query with a syntax error unchanged", bad === BAD, bad);
    await vs.runCommand("File: Save");
    await vs.closeAllEditors();
}
