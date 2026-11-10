import * as assert from "assert";
import * as vscode from "vscode";

suite("Core activation without chat", function () {
    suiteSetup(async function () {
        const extension = vscode.extensions.getExtension("manuelseeger.odata");
        assert.ok(extension, "Extension not found");
        assert.ok(!extension.isActive, "This suite requires a fresh extension host");
        const original = vscode.chat.createChatParticipant;
        vscode.chat.createChatParticipant = () => {
            throw new Error("Chat provider unavailable");
        };
        try {
            await extension.activate();
        } finally {
            vscode.chat.createChatParticipant = original;
        }
    });

    test("registers core commands when optional chat registration fails", async function () {
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
    });

    test("opens the profile webview without chat", async function () {
        await vscode.commands.executeCommand("odata.addProfile");
    });
});
