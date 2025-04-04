import * as assert from "assert";

import * as vscode from "vscode";

async function setTabSize(size: number) {
    const config = vscode.workspace.getConfiguration("editor");
    await config.update("tabSize", size, vscode.ConfigurationTarget.Global);
}

async function setEOL(eol: string) {
    const config = vscode.workspace.getConfiguration("files");
    await config.update("eol", eol, vscode.ConfigurationTarget.Global);
}

suite("Document Formatter", () => {
    setup(async () => {
        await setTabSize(4);
        await setEOL("\n");
    });

    test("Should format document correctly", async () => {
        // arrange
        const expectedText = `https://services.necromancerstore.net/service/\n    Orders?\n        $expand=Customer&\n        $filter=Customer/City eq 'Berlin'`;
        let document = await vscode.workspace.openTextDocument({
            language: "odata",
            content:
                "https://services.necromancerstore.net/service/Orders?$expand=Customer&$filter=Customer/City eq 'Berlin'",
        });
        // Test suite doesn't set the language on open document for some reason
        document = await vscode.languages.setTextDocumentLanguage(document, "odata");
        await vscode.window.showTextDocument(document);

        // act
        await vscode.commands.executeCommand("editor.action.formatDocument");

        const formattedText = document.getText();

        // Assert
        assert.strictEqual(formattedText, expectedText, "Document was not formatted correctly");
    });

    test("Should not format erroneous document", async () => {
        // arrange
        const expectedText = `https://api.kingdomtraders.com/customer/\nCustomers?$fi lter=startswith(Name, 'A')`;
        let document = await vscode.workspace.openTextDocument({
            language: "odata",
            content:
                "https://api.kingdomtraders.com/customer/\nCustomers?$fi lter=startswith(Name, 'A')",
        });
        // Test suite doesn't set the language on open document for some reason
        document = await vscode.languages.setTextDocumentLanguage(document, "odata");

        // act
        await vscode.commands.executeCommand("editor.action.formatDocument");

        const formattedText = document.getText();

        // Assert
        assert.strictEqual(formattedText, expectedText, "Document was not formatted");
    });
});
