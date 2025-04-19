import { CommandProvider } from "../../commands";
import { IMetadataModelService } from "../../contracts/IMetadataModelService";
import { IQueryRunner } from "../../contracts/IQueryRunner";
import { Profile } from "../../contracts/types";
import { MetadataModelService } from "../../services/MetadataModelService";
import { setupTests } from "./testutil";
import * as vscode from "vscode";
import * as assert from "assert";
import { QueryRunner } from "../../services/QueryRunner";
import { anything, verify } from "ts-mockito";

suite("CommandProvider", () => {
    let commandProvider: CommandProvider;
    let context: vscode.ExtensionContext;
    let profile: Profile;
    let metadataService: IMetadataModelService;
    let queryRunner: IQueryRunner;
    let runnerMock: QueryRunner;

    setup(async () => {
        const queryResponses = {
            "https://example.com/odata/Orders?$select=OrderID,OrderDate": `{
                "@odata.context": "https://example.com/odata/$metadata#Orders(OrderID,OrderDate)",
                "value": [
                    {
                        "OrderID": 1,
                        "OrderDate": "2025-04-10T00:00:00Z"
                    },
                    {
                        "OrderID": 2,
                        "OrderDate": "2025-04-09T00:00:00Z"
                    }
                ]
}`,
        };
        ({ profile, context, queryRunner, runnerMock } = await setupTests(queryResponses));
        metadataService = new MetadataModelService();

        commandProvider = new CommandProvider(context, queryRunner, false);
    });

    suite("Runner commands", () => {
        test("should run current editor query", async () => {
            // Arrange
            const odata = `${profile.baseUrl}Orders?$select=OrderID,OrderDate`;
            const document = await vscode.workspace.openTextDocument({
                content: odata,
                language: "odata",
            });
            await vscode.window.showTextDocument(document);

            // Act
            await commandProvider.runEditorQuery();
            // wait for result-document to be updated by vscode instance
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Assert
            const result = await commandProvider.resultDocument?.getText();

            // assert result document is expected, formatted
            assert.ok(result);
            assert.deepStrictEqual(
                JSON.parse(result),
                JSON.parse(`{
    "@odata.context": "https://example.com/odata/$metadata#Orders(OrderID,OrderDate)",
    "value": [
        {
            "OrderID": 1,
            "OrderDate": "2025-04-10T00:00:00Z"
        },
        {
            "OrderID": 2,
            "OrderDate": "2025-04-09T00:00:00Z"
        }
    ]
}`),
            );
        });

        test("should not run if no active editor", async () => {
            // Arrange
            await vscode.commands.executeCommand("workbench.action.closeAllEditors");

            // Act
            const result = await commandProvider.runEditorQuery();

            // Assert
            verify(runnerMock.run(anything(), anything())).never();
        });

        test("should not run if document is not OData", async () => {
            // Arrange
            const notOdata = `https://github.com/NagRock/ts-mockito?tab=readme-ov-file`;
            const document = await vscode.workspace.openTextDocument({
                content: notOdata,
                language: "plaintext",
            });
            await vscode.window.showTextDocument(document);

            // Act
            const result = await commandProvider.runEditorQuery();

            // Assert
            verify(runnerMock.run(anything(), anything())).never();
        });

        test("should get metadata for profile", async () => {
            // Act
            const metadata = await commandProvider.getEndpointMetadata();
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Assert
            verify(
                runnerMock.fetch("https://example.com/odata/$metadata", anything(), anything()),
            ).once();
            assert.ok(metadata);
        });

        test("should not invoke runner if disabled", async function () {
            // Arrange
            this.skip();
            const config = vscode.workspace.getConfiguration("myExtension");
            const query = `GET ${profile.baseUrl}MyCollection`;

            // Set a configuration value
            await config.update("odata.disableRunner", true, vscode.ConfigurationTarget.Workspace);

            // Act
            await commandProvider.openAndRunQuery(query);

            // Assert
            verify(runnerMock.run(anything(), anything())).never();
        });
    });

    suite("Chat invoked commands", () => {
        test("shoud open incorrect query", async () => {
            // Arrange
            const query = `GET ${profile.baseUrl}DoesNotExist`;
            const expected = `DoesNotExist`;

            // Act
            await commandProvider.openAndRunQuery(query);
            // wait for vscode to open and format the query document
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Assert
            const editor = vscode.window.activeTextEditor;
            assert.ok(editor);
            assert.strictEqual(editor.document.languageId, "odata");
            assert.strictEqual(editor.document.getText().includes(expected), true);
        });
    });

    suite("Copy query command", () => {
        test("Should copy combined OData URL to clipboard", async () => {
            // Arrange
            const baseUrl = "https://services.odata.org/northwind/northwind.svc/";
            const query = "Products?$filter=Price gt 100&$orderby=Name asc";
            const expectedCombinedUrl = `${baseUrl}${query}&$format=json`;

            const document = await vscode.workspace.openTextDocument({
                language: "odata",
                content: `${baseUrl}\n${query}`,
            });
            await vscode.languages.setTextDocumentLanguage(document, "odata");
            await vscode.window.showTextDocument(document);

            // Act
            await commandProvider.copyQueryToClipboard();
            // Wait for clipboard to be updated
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Assert
            const clipboardContent = await vscode.env.clipboard.readText();
            assert.strictEqual(
                clipboardContent,
                expectedCombinedUrl,
                "Clipboard content does not match the expected combined URL",
            );
        });

        test("Should show message if no active editor", async () => {
            // Arrange
            await vscode.commands.executeCommand("workbench.action.closeAllEditors");

            // Act
            const result = await commandProvider.copyQueryToClipboard();
            // Wait for clipboard to be updated
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Assert
            assert.strictEqual(
                result,
                undefined,
                "Command should not execute without an active editor",
            );
        });

        test("Should show message if document is not OData", async () => {
            // Arrange
            const document = await vscode.workspace.openTextDocument({
                language: "plaintext",
                content: "This is not an OData query",
            });
            await vscode.window.showTextDocument(document);
            const notExpected = "This is not an OData query";

            // Act
            const result = await commandProvider.copyQueryToClipboard();
            // Wait for clipboard to be updated
            await new Promise((resolve) => setTimeout(resolve, 50));

            const clipboardContent = await vscode.env.clipboard.readText();
            // Assert
            assert.strictEqual(
                result,
                undefined,
                "Command should not execute for non-OData documents",
            );
            assert.notStrictEqual(
                clipboardContent,
                notExpected,
                "Editor content should not be copied to clipboard",
            );
        });

        test("Should combine multi-line OData query into one line in clipboard", async () => {
            // Arrange
            const baseUrl = "https://services.odata.org/northwind/northwind.svc/";
            const query = `
                Products?
                    $filter=Price gt 100 &
                    $orderby=Name asc`;
            const expectedCombinedUrl = `${baseUrl}Products?$filter=Price gt 100&$orderby=Name asc&$format=json`;
            const document = await vscode.workspace.openTextDocument({
                language: "odata",
                content: `${baseUrl}\n${query}`,
            });
            await vscode.languages.setTextDocumentLanguage(document, "odata");
            await vscode.window.showTextDocument(document);

            // Act
            await commandProvider.copyQueryToClipboard();
            // Wait for clipboard to be updated
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Assert
            const clipboardContent = await vscode.env.clipboard.readText();
            assert.strictEqual(
                clipboardContent,
                expectedCombinedUrl,
                "Clipboard content does not match the expected combined one-line URL",
            );
        });

        test("Should copy OData query with default format", async () => {
            const baseUrl = "https://services.odata.org/northwind/northwind.svc/";
            const query = `  
    Orders? 
        $orderby=CreationOn desc& 
        $top=1`;
            const expectedCombinedUrl = `${baseUrl}Orders?$orderby=CreationOn desc&$top=1&$format=json`;
            const document = await vscode.workspace.openTextDocument({
                language: "odata",
                content: `${baseUrl}\n${query}`,
            });
            await vscode.languages.setTextDocumentLanguage(document, "odata");
            await vscode.window.showTextDocument(document);

            // Act
            await commandProvider.copyQueryToClipboard();
            // Wait for clipboard to be updated
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Assert
            const clipboardContent = await vscode.env.clipboard.readText();
            assert.strictEqual(
                clipboardContent,
                expectedCombinedUrl,
                "Clipboard content does not match the expected combined one-line URL",
            );
        });
    });
});
