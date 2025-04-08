import {
    ParsedTree,
    ParseResult,
    ParseSuccessHandler,
    ParseSyntaxErrorHandler,
} from "../parser/syntaxparser";
import * as vscode from "vscode";

export interface ISyntaxParser {
    // Processes document changes (debounced).
    handleChangeTextDocument(document: vscode.TextDocument): void;
    // Parses text and returns a syntax tree.
    parse(text: string): ParsedTree | null;
    // Registers a syntax error handler.
    onSyntaxError(handler: ParseSyntaxErrorHandler): void;
    // Registers a parsing success handler.
    onParseSuccess(handler: ParseSuccessHandler): void;
    // Process the document immediately and return the result.
    process(document: vscode.TextDocument, force?: boolean): ParseResult | null;
}
