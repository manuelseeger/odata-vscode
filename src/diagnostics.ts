import * as vscode from 'vscode';
import { parse, SyntaxError, LocationRange } from './parser/parser.js';

function rangeFromPeggyRange(span: LocationRange): vscode.Range {
    return new vscode.Range(
        new vscode.Position(span.start.line - 1, span.start.column - 1),
        new vscode.Position(span.end.line - 1, span.end.column - 1));
}


export class ODataDiagnosticProvider {
    private _debounceTimer: NodeJS.Timeout | undefined;
    private _lastDocument: vscode.TextDocument | null = null;


    constructor(private diagnostics: vscode.DiagnosticCollection) {

    }

    public onDidChangeTextDocument(document: vscode.TextDocument) {
        if (document.languageId !== 'odata') {
            return;
        }
        this._lastDocument = document;
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._updateDiagnostics(this._lastDocument!);
        }, 500);
    }

    private _updateDiagnostics(document: vscode.TextDocument) {
        if (document.languageId !== 'odata') {
            return;
        }
        const text = document.getText();

        if (text.length === 0) {
            this.diagnostics.set(document.uri, []);
            return;
        }
        const diagnostics: vscode.Diagnostic[] = [];

        try {
            const parsed = parse(text);
        } catch (error) {
            if (error instanceof SyntaxError) {
                const range = rangeFromPeggyRange(error.location);
                const diagnostic = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
                diagnostics.push(diagnostic);
            } else {
                console.error('Unexpected error:', error);
            }
        }

        this.diagnostics.set(document.uri, diagnostics);
    }
}