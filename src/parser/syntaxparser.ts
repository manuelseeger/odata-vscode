import { parse, SyntaxError, LocationRange, ParserTracer } from './parser.js';
import * as vscode from 'vscode';

export type ParseSyntaxErrorHandler = (uri: vscode.Uri, error: SyntaxError) => void;
export type ParseSuccessHandler = (uri: vscode.Uri, result: ParseResult) => void;

export interface ODataRoot {
    odataUri?: ParsedTree;
    header?: any;
    primitiveValue?: any;
}

export interface ParsedTree {
    serviceRoot: ServiceRoot;
    odataRelativeUri?: ODataRelativeUri;
}

export interface ParseResult {
    tree: ParsedTree;
    locations: SyntaxLocation[];
}

export interface SyntaxLocation {
    value: string;
    span: LocationRange;
    type: SyntaxLocationType;
}
export interface ServiceRoot extends SyntaxLocation { }
export interface ResourcePath extends SyntaxLocation { }

export interface SelectItem extends SyntaxLocation { }
export interface PropertyPath extends SyntaxLocation { }

export interface ODataRelativeUri {
    resourcePath: ResourcePath;
    queryOptions?: any;
}

export type SyntaxLocationType = "resourcePath" | "selectItem" | "propertyPath" | "serviceRoot";

export class SyntaxParser {


    private _debounceTimer: NodeJS.Timeout | undefined;
    private _lastDocument: vscode.TextDocument | null = null;
    private _instance: SyntaxParser | null = null;
    private _lastQuery: string | null = null;
    private _lastTree: ParsedTree | null = null;
    private _lastResult: ParseResult | null = null;
    private _syntaxErrorHandlers: Array<ParseSyntaxErrorHandler> = [];
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

        this._lastTree = parse(text) as unknown as ParsedTree;
        return this._lastTree;
    }

    public onSyntaxError(handler: ParseSyntaxErrorHandler) {
        this._syntaxErrorHandlers.push(handler);
    }

    public onParseSuccess(handler: ParseSuccessHandler) {
        this._parseSuccessHandlers.push(handler);
    }

    public process(document: vscode.TextDocument): ParseResult | null {
        if (document.getText().length === 0) {
            return null;
        }
        this._process(document);
        return this._lastResult;
    }

    private _process(document: vscode.TextDocument) {
        if (document.languageId !== 'odata') {
            return;
        }
        const text = document.getText();

        try {
            this._lastTree = this.parse(text);
            this._lastResult = this._postProcess(this._lastTree!);

            if (this._lastResult) {
                this._parseSuccessHandlers.forEach(handler => handler(document.uri, this._lastResult!));
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                this._syntaxErrorHandlers.forEach(handler => handler(document.uri, error));
            } else {
                console.error('Unexpected parsing error:', error);
            }
        }
    }

    private _postProcess(tree: ParsedTree): ParseResult {

        const locations: SyntaxLocation[] = [];

        const processNode = (node: any): any => {
            if (Array.isArray(node)) {
                return node
                    .map(item => processNode(item))
                    .filter(item => item !== null && item !== undefined);
            } else if (node !== null && typeof node === 'object') {
                const cleaned: Record<string, any> = {};
                if (node.span) {
                    locations.push(node as unknown as SyntaxLocation);
                }
                Object.keys(node).forEach(key => {
                    const value = processNode(node[key]);
                    if (value !== null && value !== undefined) {
                        cleaned[key] = value;
                    }
                });
                return cleaned;
            }
            return node;
        };
        const cleanedTree = processNode(tree) as ParsedTree;
        return { tree: cleanedTree, locations: locations };
    }
}

function rangeFromPeggyRange(span: LocationRange): vscode.Range {
    return new vscode.Range(
        new vscode.Position(span.start.line - 1, span.start.column - 1),
        new vscode.Position(span.end.line - 1, span.end.column - 1));
}

export * from './parser.js';
