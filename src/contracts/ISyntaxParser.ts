import { ParseResult, ParseSuccessHandler, ParseSyntaxErrorHandler } from "../parser/syntaxparser";
import * as vscode from "vscode";

/**
 * Interface for a syntax parser that processes and analyzes text documents.
 */
export interface ISyntaxParser {
    /**
     * Processes document changes in a debounced manner.
     * @param document - The text document that has changed.
     */
    handleChangeTextDocument(document: vscode.TextDocument): void;

    /**
     * Registers a handler for syntax errors encountered during parsing.
     * @param handler - The function to handle syntax errors.
     */
    onSyntaxError(handler: ParseSyntaxErrorHandler): void;

    /**
     * Registers a handler for successful parsing events.
     * @param handler - The function to handle successful parsing results.
     */
    onParseSuccess(handler: ParseSuccessHandler): void;

    /**
     * Processes the document immediately and returns the parsing result.
     * @param document - The text document to process.
     * @param force - Optional flag to force processing even if not required.
     * @returns The result of the parsing operation, or null if parsing failed.
     */
    process(document: vscode.TextDocument, force?: boolean): ParseResult | null;

    /**
     * Processes a given text string and returns the parsing result.
     * @param text - The text to process.
     * @returns The result of the parsing operation, or null if parsing failed.
     */
    processText(text: string): ParseResult | null;
}
