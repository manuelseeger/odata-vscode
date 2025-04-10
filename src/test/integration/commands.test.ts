import { CommandProvider } from "../../commands";
import { IMetadataModelService } from "../../contracts/IMetadataModelService";
import { IQueryRunner } from "../../contracts/IQueryRunner";
import { Profile } from "../../contracts/types";
import { MetadataModelService } from "../../services/MetadataModelService";
import { setupTests } from "./testutil";
import * as vscode from "vscode";
import * as assert from "assert";

suite("CommandProvider", () => {
    let commandProvider: CommandProvider;
    let context: vscode.ExtensionContext;
    let profile: Profile;
    let metadataService: IMetadataModelService;
    let queryRunner: IQueryRunner;

    setup(() => {
        const queryResponses = {
            "https://example.com/odata/Orders?$select=OrderID,OrderDate&$format=json": `{
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
        ({ profile, context, queryRunner } = setupTests(queryResponses));
        metadataService = new MetadataModelService();

        commandProvider = new CommandProvider(context, queryRunner, false);
    });

    test("should run current editor query", async () => {
        const odata = `${profile.baseUrl}Orders?$select=OrderID,OrderDate`;
        const document = await vscode.workspace.openTextDocument({
            content: odata,
            language: "odata",
        });
        await vscode.window.showTextDocument(document);

        await commandProvider.runEditorQuery();

        const result = await commandProvider.resultDocument?.getText();

        assert.strictEqual(
            commandProvider.resultDocument?.getText(),
            `{
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
        );
    });
});
