import * as assert from "assert";
import * as vscode from "vscode";
import { HoverProvider } from "../../hovers";
import { IMetadataModelService } from "../../contracts/IMetadataModelService";
import { Profile } from "../../contracts/types";
import { MetadataModelService } from "../../services/MetadataModelService";
import { setupTests } from "./testutil";

suite("HoverProvider Integration", () => {
    let hoverProvider: HoverProvider;
    let context: vscode.ExtensionContext;
    let profile: Profile;
    let metadataService: IMetadataModelService;

    setup(async () => {
        ({ profile, context } = await setupTests());
        metadataService = new MetadataModelService();
        hoverProvider = new HoverProvider(metadataService, context);
    });

    test("should return hover for matching entity set", async () => {
        // Arrange
        const odata = `${profile.baseUrl}Orders?$select=OrderID,OrderDate`;
        const document = await vscode.workspace.openTextDocument({ content: odata });
        // Find the position of 'Orders' in the document
        const idx = odata.indexOf("Orders");
        const position = new vscode.Position(0, idx + 1); // inside the word

        // Act
        const hover = await hoverProvider.provideHover(document, position, {} as any);

        // Assert
        assert.ok(hover instanceof vscode.Hover);
        const contents = (hover as vscode.Hover).contents[0] as vscode.MarkdownString;
        assert.ok(contents.value.includes("**Entity Set**: Orders"));
        assert.ok(contents.value.includes("OrderID (Edm.Int32)"));
        assert.ok(contents.value.includes("OrderDate (Edm.DateTimeOffset)"));
    });

    test("should return undefined if no profile", async () => {
        // Arrange
        // Remove selectedProfile from globalState
        const globalState = context.globalState as any;
        globalState.get = () => undefined;
        const odata = `${profile.baseUrl}Orders?$select=OrderID,OrderDate`;
        const document = await vscode.workspace.openTextDocument({ content: odata });
        const idx = odata.indexOf("Orders");
        const position = new vscode.Position(0, idx + 1);

        // Act
        const hover = await hoverProvider.provideHover(document, position, {} as any);

        // Assert
        assert.strictEqual(hover, undefined);
    });

    test("should return undefined if no metadata", async () => {
        // Arrange
        // Patch metadataService.getModel to return undefined
        (hoverProvider as any).metadataService.getModel = async () => undefined;
        const odata = `${profile.baseUrl}Orders?$select=OrderID,OrderDate`;
        const document = await vscode.workspace.openTextDocument({ content: odata });
        const idx = odata.indexOf("Orders");
        const position = new vscode.Position(0, idx + 1);

        // Act
        const hover = await hoverProvider.provideHover(document, position, {} as any);

        // Assert
        assert.strictEqual(hover, undefined);
    });

    test("should return hover for selected profile", async () => {
        // Arrange
        const odata = `${profile.baseUrl}Orders?$select=OrderID,OrderDate`;
        const document = await vscode.workspace.openTextDocument({ content: odata });
        const position = new vscode.Position(0, 0);

        // Act
        const hover = await hoverProvider.provideHover(document, position, {} as any);

        // Assert
        assert.ok(hover instanceof vscode.Hover);
        const contents = (hover as vscode.Hover).contents[0] as vscode.MarkdownString;
        assert.ok(contents.value.includes("**Selected Profile**: TestProfile"));
        assert.ok(contents.value.includes("**Base URL**: https://example.com/odata/"));
    });
});
