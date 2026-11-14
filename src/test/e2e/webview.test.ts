import * as assert from "assert";
import * as vscode from "vscode";

suite("Core activation without Copilot tools", function () {
    suiteSetup(async function () {
        const extension = vscode.extensions.getExtension("manuelseeger.odata");
        assert.ok(extension, "Extension not found");
        assert.ok(!extension.isActive, "This suite requires a fresh extension host");
        const original = vscode.lm.registerTool;
        vscode.lm.registerTool = () => {
            throw new Error("Language model tools unavailable");
        };
        try {
            await extension.activate();
        } finally {
            vscode.lm.registerTool = original;
        }
    });

    test("registers core commands when optional tool registration fails", async function () {
        const commands = await vscode.commands.getCommands();
        for (const command of [
            "odata.run",
            "odata.copy",
            "odata.getMetadata",
            "odata.selectProfile",
            "odata.addProfile",
        ]) {
            assert.ok(commands.includes(command), command);
        }
        assert.ok(!commands.includes("odata.getSelectedProfileWithSecrets"));
        assert.ok(!commands.includes("odata.requestMetadata"));
    });

    test("opens the profile webview without Copilot tools", async function () {
        await vscode.commands.executeCommand("odata.addProfile");
    });
});
