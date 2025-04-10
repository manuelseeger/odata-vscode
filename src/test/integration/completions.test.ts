import * as assert from "assert";
import * as vscode from "vscode";
import { DefaultCompletionItemProvider, MetadataCompletionItemProvider } from "../../completions";
import { IMetadataModelService } from "../../contracts/IMetadataModelService";
import { Profile } from "../../contracts/types";
import { setupTests } from "./testutil";
import { MetadataModelService } from "../../services/MetadataModelService";
import { ISyntaxParser } from "../../contracts/ISyntaxParser";
import { SyntaxParser } from "../../parser/syntaxparser";

suite("DefaultCompletionItemProvider", () => {
    let completionProvider: MetadataCompletionItemProvider;
    let context: vscode.ExtensionContext;
    let profile: Profile;
    let metadataService: IMetadataModelService;

    setup(() => {
        ({ profile, context } = setupTests());
        metadataService = new MetadataModelService();

        completionProvider = new MetadataCompletionItemProvider(metadataService, context);
    });

    test("should provide completion items for $select", async () => {
        // arrange
        // https://example.com/odata/Orders?$select=
        const odata = `${profile.baseUrl}Orders?$select=`;
        const document = await vscode.workspace.openTextDocument({
            content: odata,
        });
        const position = new vscode.Position(0, 40);

        const completions = await completionProvider.provideCompletionItems(
            document,
            position,
            {} as vscode.CancellationToken,
        );

        assert.ok(completions);
        assert.strictEqual(completions!.items.length, 4);
        assert.strictEqual(completions!.items[0].label, "OrderID");
        assert.strictEqual(completions!.items[1].label, "OrderDate");
        assert.strictEqual(completions!.items[2].label, "CustomerName");
        assert.strictEqual(completions!.items[3].label, "Items");
    });
});
