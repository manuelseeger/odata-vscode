import * as assert from "assert";

import { setupTestEnvironment } from "./testutil";

import * as vscode from "vscode";

suite("Query Runner", () => {
    test("Should run query and return 5 items in JSON", async () => {
        // arrange
        const { context, baseUrl } = await setupTestEnvironment();
        const query = "Products?$orderby=UnitPrice desc&$top=5&$format=json";

        let document = await vscode.workspace.openTextDocument({
            language: "odata",
            content: baseUrl + query,
        });
        await vscode.languages.setTextDocumentLanguage(document, "odata");
        await vscode.window.showTextDocument(document);

        // act
        await vscode.commands.executeCommand("odata.run");
        // wait for the result document to be opened
        let resultDocument: vscode.TextDocument | undefined;
        await new Promise((resolve) => {
            const interval = setInterval(() => {
                resultDocument = vscode.window.activeTextEditor?.document;
                if (resultDocument && resultDocument.languageId === "json") {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 200);
        });

        // assert
        assert.ok(resultDocument, "Result document was not opened");
        assert.strictEqual(
            resultDocument.languageId,
            "json",
            "Result document is not in JSON format",
        );
        const content = resultDocument.getText();
        // parse result
        const json = JSON.parse(content);
        assert.ok(json.value, "Result document does not contain JSON value");
        assert.strictEqual(json.value.length, 5, "Result document does not contain 5 items");
    });
});
