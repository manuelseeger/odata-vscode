import * as assert from "assert";
import * as vscode from "vscode";
import { activate } from "../../extension";

suite("Webview End-to-End", function () {
    let extensionContext: vscode.ExtensionContext;

    suiteSetup(async function () {
        // Activate the extension before running tests
        const ext = vscode.extensions.getExtension("manuelseeger.odata");
        assert.ok(ext, "Extension not found");
        if (!ext.isActive) {
            extensionContext = await ext.activate();
        } else {
            extensionContext = ext.exports;
        }
    });

    test("opens add profile webview", async function () {
        // Open the add profile webview
        await vscode.commands.executeCommand("odata.addProfile");
    });
});
