import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { registerDocumentParsing } from "../../extension";
import { ODataDiagnosticProvider } from "../../diagnostics";
import { SyntaxParser } from "../../parser/syntaxparser";
import { MetadataModelService } from "../../services/MetadataModelService";
import { setupTests } from "./testutil";

suite("Open document diagnostics", () => {
    test("diagnoses existing documents at activation and on opening", async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "odata-open-"));
        const subscriptions: vscode.Disposable[] = [];
        try {
            const { context } = await setupTests();
            const testContext = {
                globalState: context.globalState,
                secrets: context.secrets,
                subscriptions,
            } as vscode.ExtensionContext;
            const files = ["startup-syntax", "startup-metadata", "open-syntax", "open-metadata"];
            const texts = [
                "https://example.com/odata/Orders?$",
                "https://example.com/odata/NonExistants",
                "https://example.com/odata/Orders?$",
                "https://example.com/odata/NonExistants",
            ];
            const uris = files.map((name) => vscode.Uri.file(path.join(dir, `${name}.odata`)));
            await Promise.all(uris.map((uri, i) => fs.writeFile(uri.fsPath, texts[i])));
            for (const uri of uris.slice(0, 2)) {
                await vscode.languages.setTextDocumentLanguage(
                    await vscode.workspace.openTextDocument(uri),
                    "odata",
                );
            }
            const parser = new SyntaxParser();
            const diagnostics = new ODataDiagnosticProvider(
                new MetadataModelService(),
                testContext,
            );
            subscriptions.push(diagnostics);
            parser.onSyntaxError(diagnostics.handleSyntaxError.bind(diagnostics));
            parser.onParseSuccess(diagnostics.handleParseSucess.bind(diagnostics));
            registerDocumentParsing(testContext, parser);
            for (const uri of uris.slice(2)) {
                await vscode.languages.setTextDocumentLanguage(
                    await vscode.workspace.openTextDocument(uri),
                    "odata",
                );
            }
            const deadline = Date.now() + 3000;
            while (
                Date.now() < deadline &&
                uris.some((uri) => (diagnostics.diagnostics.get(uri)?.length ?? 0) === 0)
            ) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            for (let i = 0; i < uris.length; i++) {
                assert.ok(
                    diagnostics.diagnostics
                        .get(uris[i])
                        ?.some(
                            (d) =>
                                d.severity ===
                                (i % 2 === 0
                                    ? vscode.DiagnosticSeverity.Error
                                    : vscode.DiagnosticSeverity.Warning),
                        ),
                    files[i],
                );
            }
        } finally {
            subscriptions.forEach((subscription) => subscription.dispose());
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
});
