import * as assert from "assert";
import * as vscode from "vscode";
import { IMetadataModelService } from "../../contracts/IMetadataModelService";
import { AuthKind, Profile } from "../../contracts/types";
import { ODataDiagnosticProvider } from "../../diagnostics";
import { Location, LocationRange, SyntaxError, SyntaxParser } from "../../parser/syntaxparser";
import { MetadataModelService } from "../../services/MetadataModelService";
import { setupTests } from "./testutil";

suite("ODataDiagnosticProvider", () => {
    let diagnosticProvider: ODataDiagnosticProvider;

    let context: vscode.ExtensionContext;
    let profile: Profile;

    setup(async () => {
        ({ profile, context } = await setupTests());
        const metadataService = new MetadataModelService();
        diagnosticProvider = new ODataDiagnosticProvider(metadataService, context);
    });

    test("should initialize diagnostic collection", () => {
        assert.ok(diagnosticProvider.diagnostics);
        assert.strictEqual(diagnosticProvider.diagnostics.name, "odata");
    });

    test("should handle syntax errors", () => {
        const uri = vscode.Uri.parse("file:///test.odata");
        const syntaxError: SyntaxError = new SyntaxError(
            "Syntax Error: expected '$' but got ';'",
            [],
            null,
            {
                start: { line: 1, column: 5 } as Location,
                end: { line: 1, column: 6 } as Location,
            } as LocationRange,
        );

        diagnosticProvider.handleSyntaxError(uri, syntaxError);

        const diagnostics = diagnosticProvider.diagnostics.get(uri);
        assert.strictEqual(diagnostics?.length, 1);
        assert.strictEqual(diagnostics![0].message, "Syntax Error: expected '$' but got ';'");
        assert.strictEqual(diagnostics![0].range.start.line, 0);
        assert.strictEqual(diagnostics![0].range.start.character, 4);
        assert.strictEqual(diagnostics![0].range.end.line, 0);
        assert.strictEqual(diagnostics![0].range.end.character, 5);
    });

    test("should handle parse success with valid metadata and no warnings", async () => {
        // arrange
        const parser = new SyntaxParser();
        const odata = `${profile.baseUrl}Orders?$filter=OrderDate gt 2023-01-01`;
        const result = parser.processText(odata);

        const queryDocument = await vscode.workspace.openTextDocument({
            content: odata,
        });

        // act
        await diagnosticProvider.handleParseSucess(queryDocument.uri, result!);

        // assert
        const diagnostics = diagnosticProvider.diagnostics.get(queryDocument.uri);
        assert.strictEqual(diagnostics?.length, 0);
    });

    test("should generate warning on non-existant container entity", async () => {
        // arrange
        const parser = new SyntaxParser();
        // https://example.com/odata/NonExistants?$filter=OrderDate gt 2023-01-01
        const odata = `${profile.baseUrl}NonExistants?$filter=OrderDate gt 2023-01-01`;
        const result = parser.processText(odata);

        const queryDocument = await vscode.workspace.openTextDocument({
            content: odata,
        });

        // act
        await diagnosticProvider.handleParseSucess(queryDocument.uri, result!);

        // assert
        const diagnostics = diagnosticProvider.diagnostics.get(queryDocument.uri);
        assert.strictEqual(diagnostics?.length, 1);
        assert.strictEqual(
            diagnostics![0].message,
            "Resource path 'NonExistants' not found in the entity container of profile TestProfile.",
        );
        assert.strictEqual(diagnostics![0].severity, vscode.DiagnosticSeverity.Warning);
        assert.strictEqual(diagnostics![0].range.start.line, 0);
        assert.strictEqual(diagnostics![0].range.start.character, 26);
        assert.strictEqual(diagnostics![0].range.end.line, 0);
        assert.strictEqual(diagnostics![0].range.end.character, 38);
    });

    test("should generate warning for non-existing expand property", async () => {
        // arrange
        const parser = new SyntaxParser();
        // https://example.com/odata/Orders?$expand=NonExistantProperty
        const odata = `${profile.baseUrl}Orders?$expand=NonExistantProperty`;
        const result = parser.processText(odata);

        const queryDocument = await vscode.workspace.openTextDocument({
            content: odata,
        });

        // act
        await diagnosticProvider.handleParseSucess(queryDocument.uri, result!);

        // assert
        const diagnostics = diagnosticProvider.diagnostics.get(queryDocument.uri);
        assert.strictEqual(diagnostics?.length, 1);
        assert.strictEqual(
            diagnostics![0].message,
            `'Resource Orders doesn't have a navigational property NonExistantProperty in profile TestProfile.`,
        );
        assert.strictEqual(diagnostics![0].severity, vscode.DiagnosticSeverity.Warning);
    });
});
