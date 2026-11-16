import * as vscode from "vscode";
import { Span } from "./parser/ast";
import { ParseResult, ParseSyntaxErrorHandler, SyntaxError } from "./parser/syntaxparser";

import { getConfig, getSelectedPublicProfile } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { analyze } from "./language/analyze";
import { DataModel } from "./odata2ts/data-model/DataModel";
import { Disposable } from "./provider";
import { getBaseUrl } from "./util";

/**
 * Provides diagnostics for OData queries.
 *
 * Syntax errors are reported as they come from the parser. Queries that could be parsed,
 * also tolerantly despite a syntax error, are analyzed against the metadata of the selected
 * profile: names of resources, properties and functions that the service does not know are
 * reported as warnings, at any nesting depth of the query.
 */
export class ODataDiagnosticProvider extends Disposable {
    public _id: string = "ODataDiagnosticProvider";
    private _diagnostics: vscode.DiagnosticCollection;
    /** Latest analysis started per document, to drop results that were overtaken. */
    private _runs = new Map<string, number>();

    public get diagnostics(): vscode.DiagnosticCollection {
        return this._diagnostics;
    }
    constructor(
        private metadataService: IMetadataModelService,
        private context: vscode.ExtensionContext,
    ) {
        super();
        this._diagnostics = vscode.languages.createDiagnosticCollection("odata");
        this.subscriptions = [this._diagnostics];
    }

    /**
     * Set the syntax error from parsing a document as its diagnostics.
     *
     * @param uri vscode.Uri of the document to set the diagnostics for
     * @param error SyntaxError to set as a diagnostic
     */
    public handleSyntaxError: ParseSyntaxErrorHandler = (uri: vscode.Uri, error: SyntaxError) => {
        this.nextRun(uri);
        this.diagnostics.set(uri, [syntaxDiagnostic(error)]);
    };

    /**
     * Set the diagnostics of a document that could be parsed: its syntax error, if it was
     * parsed tolerantly, and warnings for everything that does not match the metadata of the
     * selected profile.
     *
     * @param uri vscode.Uri of the document to set the diagnostics for
     * @param result the parsed OData query
     */
    public async handleParseSucess(uri: vscode.Uri, result: ParseResult) {
        const run = this.nextRun(uri);
        const diagnostics: vscode.Diagnostic[] = result.error ? [syntaxDiagnostic(result.error)] : [];

        const profile = getSelectedPublicProfile(this.context);
        let model: DataModel | undefined;
        if (profile) {
            try {
                model = await this.metadataService.getModel(profile);
            } catch {
                // no usable metadata: syntax diagnostics only
            }
        }
        if (this._runs.get(uri.toString()) !== run) {
            return;
        }

        const analysis = analyze(result.tree, result.text, {
            model,
            baseUrl: profile ? getBaseUrl(profile.baseUrl) : undefined,
            profileName: profile?.name,
        });
        for (const d of analysis.diagnostics) {
            const diagnostic = new vscode.Diagnostic(
                spanToRange(d.span),
                d.message,
                vscode.DiagnosticSeverity.Warning,
            );
            diagnostic.code = d.code;
            diagnostic.source = "odata";
            diagnostics.push(diagnostic);
        }
        this.diagnostics.set(uri, diagnostics);
    }

    private nextRun(uri: vscode.Uri): number {
        const run = (this._runs.get(uri.toString()) ?? 0) + 1;
        this._runs.set(uri.toString(), run);
        return run;
    }
}

function syntaxDiagnostic(error: SyntaxError): vscode.Diagnostic {
    return new vscode.Diagnostic(
        spanToRange(error.location),
        error.message,
        getConfig().strictParser
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning,
    );
}

/**
 * Convert the span of a syntax node to a vscode.Range.
 *
 * Spans are 1-based, while vscode.Range is 0-based.
 */
export function spanToRange(span: Span): vscode.Range {
    return new vscode.Range(
        new vscode.Position(span.start.line - 1, span.start.column - 1),
        new vscode.Position(span.end.line - 1, span.end.column - 1),
    );
}
