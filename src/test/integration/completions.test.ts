import * as assert from "assert";
import * as vscode from "vscode";
import { MetadataCompletionItemProvider } from "../../completions";
import { IMetadataModelService } from "../../contracts/IMetadataModelService";
import { Profile } from "../../contracts/types";
import { setupTests } from "./testutil";
import { MetadataModelService } from "../../services/MetadataModelService";

suite("DefaultCompletionItemProvider", () => {
    let completionProvider: MetadataCompletionItemProvider;
    let context: vscode.ExtensionContext;
    let profile: Profile;
    let metadataService: IMetadataModelService;

    setup(async () => {
        ({ profile, context } = await setupTests());
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
        // at the end of the line, after the "="
        const position = new vscode.Position(0, odata.length);

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

    async function labelsAt(query: string): Promise<string[] | undefined> {
        const odata = `${profile.baseUrl}${query}`;
        const document = await vscode.workspace.openTextDocument({ content: odata });
        const completions = await completionProvider.provideCompletionItems(
            document,
            document.positionAt(odata.length),
            {} as vscode.CancellationToken,
        );
        return completions?.items.map((item) => item.label as string);
    }

    test("should provide completion items inside nested $expand options", async () => {
        const item = ["ItemID", "ItemName", "Quantity"];
        assert.deepStrictEqual(await labelsAt("Orders?$expand=Items($select="), item);
        assert.deepStrictEqual(await labelsAt("Orders?$expand=Items($select=ItemID;$filter="), item);
    });

    test("should provide completion items for lambda variables", async () => {
        assert.deepStrictEqual(await labelsAt("Orders?$filter=Items/any(i: i/"), [
            "ItemID",
            "ItemName",
            "Quantity",
        ]);
    });

    test("should provide navigation properties for $expand and resources for the path", async () => {
        assert.deepStrictEqual(await labelsAt("Orders?$expand="), ["Items"]);
        assert.deepStrictEqual(await labelsAt(""), ["Orders", "Items"]);
        assert.deepStrictEqual(await labelsAt("Orders(1)/"), [
            "OrderID",
            "OrderDate",
            "CustomerName",
            "Items",
        ]);
    });

    test("should not provide names inside string literals", async () => {
        assert.strictEqual(await labelsAt("Orders?$filter=CustomerName eq 'a"), undefined);
    });
});
