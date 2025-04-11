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
    });

    suite("Chat invoked commands", () => {
        test("shoud open incorrect query", async () => {
            // Arrange
            const query = `GET ${profile.baseUrl}DoesNotExist`;
            const expected = `${profile.baseUrl}\n    DoesNotExist`;

            // Act
            await commandProvider.openAndRunQuery(query);
            // wait for vscode to open and format the query document
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Assert
            const editor = vscode.window.activeTextEditor;
            assert.ok(editor);
            assert.strictEqual(editor.document.languageId, "odata");
            assert.strictEqual(editor.document.getText(), expected);
        });
    });
});
