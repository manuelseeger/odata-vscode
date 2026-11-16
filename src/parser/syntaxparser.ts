import * as vscode from "vscode";
import { ISyntaxParser } from "../contracts/ISyntaxParser";
import { ODataUri } from "./ast";
import { parseDocument, SyntaxError } from "./parse";

export type ParseSyntaxErrorHandler = (uri: vscode.Uri, error: SyntaxError) => void;
export type ParseSuccessHandler = (uri: vscode.Uri, result: ParseResult) => void;

export interface ParseResult {
    /** The text that was parsed. */
    text: string;
    /** Syntax tree. A best-effort tree with recovery nodes if `error` is set. */
    tree: ODataUri;
    /** The first syntax error in the text, if any. */
    error?: SyntaxError;
}

export class SyntaxParser implements ISyntaxParser {
    private _debounceTimer: NodeJS.Timeout | undefined;
    private _lastDocument: vscode.TextDocument | null = null;
    private _lastText: string | null = null;
    private _lastResult: ParseResult | null = null;
    private _lastError: SyntaxError | undefined;
    private _syntaxErrorHandlers: Array<ParseSyntaxErrorHandler> = [];
    private _parseSuccessHandlers: Array<ParseSuccessHandler> = [];

    constructor() {}

    public handleChangeTextDocument(document: vscode.TextDocument) {
        if (document.languageId !== "odata") {
            return;
        }
        this._lastDocument = document;
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._process(this._lastDocument!);
        }, 500);
    }

    public onSyntaxError(handler: ParseSyntaxErrorHandler) {
        this._syntaxErrorHandlers.push(handler);
    }

    public onParseSuccess(handler: ParseSuccessHandler) {
        this._parseSuccessHandlers.push(handler);
    }

    public process(document: vscode.TextDocument, force: boolean = false): ParseResult | null {
        if (document.getText().length === 0) {
            return null;
        }
        if (force) {
            this._lastText = null;
        }
        this._process(document);
        return this._lastResult;
    }

    public processText(text: string): ParseResult | null {
        if (text.length === 0) {
            return null;
        }
        if (text !== this._lastText) {
            const { tree, error } = parseDocument(text);
            this._lastText = text;
            this._lastError = error;
            this._lastResult = tree ? { text, tree, error } : null;
        }
        return this._lastResult;
    }

    private _process(document: vscode.TextDocument) {
        if (document.languageId !== "odata") {
            return;
        }
        let result: ParseResult | null;
        try {
            result = this.processText(document.getText());
        } catch (error) {
            console.error("Unexpected parsing error:", error);
            return;
        }
        // A syntax error is reported first; a tree that could be recovered despite the error
        // is then passed on like any other, so that it can still be checked against metadata.
        if (this._lastError) {
            const error = this._lastError;
            this._syntaxErrorHandlers.forEach((handler) => handler(document.uri, error));
        }
        if (result) {
            const parsed = result;
            this._parseSuccessHandlers.forEach((handler) => handler(document.uri, parsed));
        }
    }
}

export { SyntaxError } from "./parse";
export type { Location, LocationRange } from "./parser.js";
