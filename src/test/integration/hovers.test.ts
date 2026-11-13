import * as assert from "assert";
import * as vscode from "vscode";
import { HoverProvider } from "../../hovers";
import { IMetadataModelService } from "../../contracts/IMetadataModelService";
import { Profile } from "../../contracts/types";
import { MetadataModelService } from "../../services/MetadataModelService";
import { setupTests } from "./testutil";
import * as v2 from "../../definitions/odataV2.json";
import * as v4 from "../../definitions/odataV4.json";

suite("HoverProvider Integration", () => {
    let hoverProvider: HoverProvider;
    let context: vscode.ExtensionContext;
    let profile: Profile;
    let metadataService: IMetadataModelService;

    setup(async () => {
        ({ profile, context } = await setupTests());
        metadataService = new MetadataModelService();
        hoverProvider = new HoverProvider(metadataService, context, { v2, v4 });
    });

    teardown(() => hoverProvider.dispose());

    async function hoverText(query: string, word: string) {
        const document = await vscode.workspace.openTextDocument({ content: query });
        const start = query.indexOf(word);
        const hover = await hoverProvider.provideHover(
            document,
            new vscode.Position(0, start + 1),
            {} as any,
        );
        assert.ok(hover instanceof vscode.Hover);
        assert.deepStrictEqual(hover.range, new vscode.Range(0, start, 0, start + word.length));
        return hover.contents.map((part) => (part as vscode.MarkdownString).value);
    }

    test("should return function documentation for filter functions", async () => {
        const query = `${profile.baseUrl}Customers?$filter=startswith(CompanyName, 'A') and contains(City, 'Ber')`;

        const [startswith] = await hoverText(query, "startswith");
        assert.ok(startswith.includes("startswith(string: Edm.String, prefix: Edm.String)"));
        assert.ok(startswith.includes("Determines if a string starts with a specified substring."));
        assert.ok(startswith.includes("The prefix to check."));
        assert.ok(!startswith.includes("Selected Profile"));

        const [contains] = await hoverText(query, "contains");
        assert.ok(contains.includes("contains(string: Edm.String, substring: Edm.String)"));
        assert.ok(contains.includes("Determines if a string contains a specified substring."));
    });

    test("should list every overload of a function", async () => {
        const contents = await hoverText(
            `${profile.baseUrl}Customers?$filter=cast(Edm.String)`,
            "cast",
        );
        assert.strictEqual(contents.length, 2);
        assert.ok(contents[0].includes("cast(type: Edm.String)"));
        assert.ok(contents[1].includes("cast(expression: Edm.Untyped, type: Edm.String)"));
    });

    test("should document OData v2 functions", async () => {
        const [contents] = await hoverText(
            `${profile.baseUrl}Customers?$filter=substringof('A', CompanyName)`,
            "substringof",
        );
        assert.ok(contents.includes("substringof(substring: Edm.String, string: Edm.String)"));
        assert.ok(contents.includes("Determines if a substring exists within a string."));
    });

    test("should return function documentation without a selected profile", async () => {
        hoverProvider.dispose();
        const emptyContext = {
            globalState: { get: () => undefined },
        } as unknown as vscode.ExtensionContext;
        hoverProvider = new HoverProvider(metadataService, emptyContext, { v2, v4 });
        const [contents] = await hoverText("$filter=contains (City, 'Ber')", "contains");
        assert.ok(contents.includes("Determines if a string contains a specified substring."));
    });

    test("should preserve the profile fallback for a property", async () => {
        const query = `${profile.baseUrl}Customers?$filter=startswith(CompanyName, 'A')`;
        const document = await vscode.workspace.openTextDocument({ content: query });
        const hover = await hoverProvider.provideHover(
            document,
            new vscode.Position(0, query.indexOf("CompanyName") + 1),
            {} as any,
        );
        assert.ok(hover instanceof vscode.Hover);
        const contents = hover.contents[0] as vscode.MarkdownString;
        assert.ok(contents.value.includes("**Selected Profile**: TestProfile"));
        assert.ok(contents.value.includes(query));
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

    test("should return profile link if no metadata", async () => {
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
        assert.ok(hover instanceof vscode.Hover);
        const contents = (hover as vscode.Hover).contents[0] as vscode.MarkdownString;
        assert.ok(contents.value.includes("**Base URL**: https://example.com/odata/"));
        assert.ok(contents.value.includes(`${odata}`));
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
