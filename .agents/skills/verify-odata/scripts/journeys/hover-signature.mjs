// Feature: hovers and signature help (features/hover-signature.md).
import { sleep } from "../vscode.mjs";

export default async function (vs, ev, state) {
    await vs.requireSelectedProfile("Mock");
    await vs.closeAllEditors();
    const query = `${state.MOCK_URL}Orders?$select=OrderID`;
    await vs.openWorkspaceFile("hover.odata", query + "\n");
    await vs.kb.press("Escape");

    // Hover over the entity set name.
    let hover = await vs.hoverAtText("Orders", 2);
    ev.write("hover-entity-set.txt", hover);
    ev.check("hover on 'Orders' shows entity set, type, and properties",
        /Entity Set: Orders/.test(hover) && /Entity Type: Order/.test(hover) && /OrderID \(Edm\.Int32\)/.test(hover), hover);
    await ev.shot("hover-entity-set");
    await vs.page.mouse.move(5, 500);
    await sleep(500);

    // Hover anywhere else shows the selected profile and the combined query URL.
    hover = await vs.hoverAtText("$select", 3);
    ev.write("hover-profile.txt", hover);
    ev.check("hover elsewhere shows selected profile, base URL and query",
        /Selected Profile: Mock/.test(hover) && hover.includes(`Base URL: ${state.MOCK_URL}`) && hover.includes("Query:"), hover);
    await ev.shot("hover-profile");
    await vs.page.mouse.move(5, 500);

    // Signature help: typing `contains(` in $filter shows the function signature.
    await vs.openWorkspaceFile("signature.odata", "");
    await vs.focusEditor();
    await vs.type(`${state.MOCK_URL}Orders?$filter=contains(`);
    let sig = await vs.signatureHelp();
    ev.write("signature-open.txt", sig);
    ev.check("'contains(' shows the contains signature", /contains\(/.test(sig), sig);
    const active1 = await vs.page.locator(".parameter-hints-widget .signature .parameter.active").innerText().catch(() => "");
    await ev.shot("signature-first-param");

    await vs.type("CustomerName,");
    sig = await vs.signatureHelp();
    const active2 = await vs.page.locator(".parameter-hints-widget .signature .parameter.active").innerText().catch(() => "");
    ev.check("active parameter advances after ','", active1 && active2 && active1 !== active2, { active1, active2 });
    await ev.shot("signature-second-param");
    await vs.kb.press("Escape");

    await vs.runCommand("File: Save");
    await vs.closeAllEditors();
}
