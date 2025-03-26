import { parse, SyntaxError, LocationRange } from './parser.js';
import * as vscode from 'vscode';

export type SyntaxErrorHandler = (uri: vscode.Uri, error: SyntaxError) => void;
export type ParseSuccessHandler = (uri: vscode.Uri, result: ParsedTree) => void;

export interface ODataRoot {
    odataUri?: ParsedTree;
    header?: any;
    primitiveValue?: any;
}

export interface ParsedTree {
    serviceRoot: ServiceRoot;
    odataRelativeUri?: ODataRelativeUri;
}

export interface SyntaxLocation {
    value: string;
    span: LocationRange;
}
export interface ServiceRoot extends SyntaxLocation { }
export interface ResourcePath extends SyntaxLocation { }

export interface NamedSyntaxLocation extends SyntaxLocation {
    type: string;
}
export interface SelectItem extends NamedSyntaxLocation { }
export interface PropertyPath extends NamedSyntaxLocation { }

export interface ODataRelativeUri {
    resourcePath: ResourcePath;
    queryOptions?: any;
}

export class SyntaxParser {

    private _debounceTimer: NodeJS.Timeout | undefined;
    private _lastDocument: vscode.TextDocument | null = null;
    private _instance: SyntaxParser | null = null;
    private _lastQuery: string | null = null;
    private _lastTree: ParsedTree | null = null;
    private _syntaxErrorHandlers: Array<SyntaxErrorHandler> = [];
    private _parseSuccessHandlers: Array<ParseSuccessHandler> = [];

    constructor() {
    }

    public getInstance() {
        if (!this._instance) {
            this._instance = new SyntaxParser();
        }
        return this._instance;
    }

    public handleChangeTextDocument(document: vscode.TextDocument) {
        if (document.languageId !== 'odata') {
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

    parse(text: string): ParsedTree | null {
        if (text.length === 0) {
            return null;
        }
        if (text === this._lastQuery) {
            return this._lastTree;
        }
        this._lastQuery = text;
        this._lastTree = parseODataQuery(text);
        return this._lastTree;
    }

    public onSyntaxError(handler: SyntaxErrorHandler) {
        this._syntaxErrorHandlers.push(handler);
    }

    public onParseSuccess(handler: ParseSuccessHandler) {
        this._parseSuccessHandlers.push(handler);
    }

    private _process(document: vscode.TextDocument) {
        if (document.languageId !== 'odata') {
            return;
        }
        const text = document.getText();

        try {
            this._lastTree = this.parse(text);

            if (this._lastTree) {
                this._parseSuccessHandlers.forEach(handler => handler(document.uri, this._lastTree!));
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                this._syntaxErrorHandlers.forEach(handler => handler(document.uri, error));
            } else {
                console.error('Unexpected error:', error);
            }
        }
    }
}

// Recursively remove null and undefined values
function removeNullsFromObject<T>(obj: T): T {
    if (Array.isArray(obj)) {
        return (obj
            .map(item => removeNullsFromObject(item))
            .filter(item => item !== null && item !== undefined) as unknown) as T;
    } else if (obj !== null && typeof obj === 'object') {
        const cleaned: Record<string, any> = {};
        Object.keys(obj as Record<string, any>).forEach(key => {
            const value = removeNullsFromObject((obj as Record<string, any>)[key]);
            if (value !== null && value !== undefined) {
                cleaned[key] = value;
            }
        });
        return cleaned as T;
    }
    return obj;
}

function rangeFromPeggyRange(span: LocationRange): vscode.Range {
    return new vscode.Range(
        new vscode.Position(span.start.line - 1, span.start.column - 1),
        new vscode.Position(span.end.line - 1, span.end.column - 1));
}


function parseODataQuery(query: string) {
    return removeNullsFromObject(parse(query)) as unknown as ParsedTree;
}

export * from './parser.js';
export {
    parseODataQuery as parse,
};
