import * as vscode from "vscode";
import { SyntaxLocation, SyntaxParser } from "./parser/syntaxparser";

export class ODataDocumentFormatter implements vscode.DocumentFormattingEditProvider {
    constructor(
        private readonly syntaxParser: SyntaxParser,
        private readonly context: vscode.ExtensionContext,
    ) {}

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        const edits: vscode.TextEdit[] = [];

        const text = document.getText();

        const result = this.syntaxParser.process(document);

        if (!result) {
            return edits;
        }

        const visit = (node: any, depth: number = 0): any => {
            if (Array.isArray(node)) {
                node.map((item) => visit(item, depth));
            } else if (typeof node === "string") {
                // Handle string nodes if necessary
                //return node;
            } else if (typeof node === "object" || node !== null) {
                // Check if the node has a location property = is a named syntax location
                if (node.span) {
                    const syntaxNode = node as SyntaxLocation;
                    let goOn = false;
                    let newline = "\n";
                    switch (syntaxNode.type) {
                        case "serviceRoot":
                            depth = 0;
                            goOn = true;
                            break;
                        case "resourcePath":
                            depth = 1;
                            goOn = true;
                            break;
                        case "systemQueryOption":
                            depth = 2;
                            goOn = true;
                            break;
                        default:
                            goOn = false;
                            break;
                    }
                    if (goOn) {
                        const start = document.positionAt(syntaxNode.span.start.offset);
                        const end = document.positionAt(syntaxNode.span.end.offset);

                        // Calculate indentation based on depth
                        const indent = " ".repeat(options.tabSize * depth);

                        // Look back in the text to remove all leading whitespace
                        let leadingStartOffset = syntaxNode.span.start.offset;
                        while (leadingStartOffset > 0 && /\s/.test(text[leadingStartOffset - 1])) {
                            leadingStartOffset--;
                        }
                        const leadingStart = document.positionAt(leadingStartOffset);
                        const leadingWhitespaceRange = new vscode.Range(leadingStart, start);

                        // Replace all leading whitespace with proper indentation
                        edits.push(
                            vscode.TextEdit.replace(leadingWhitespaceRange, `${newline}${indent}`),
                        );

                        // Replace the node content with trimmed content
                        edits.push(
                            vscode.TextEdit.replace(
                                new vscode.Range(start, end),
                                `${text.substring(syntaxNode.span.start.offset, syntaxNode.span.end.offset).trim()}`,
                            ),
                        );

                        // Increase depth only after making an edit
                        depth++;
                    }
                }
                Object.keys(node).forEach((key) => {
                    visit(node[key], depth);
                });
            }
        };
        visit(result.tree);

        return edits;
    }
}

export function combineODataUrl(input: string): string {
    // Remove line breaks and condense to a single line
    const singleLine: string = input.replace(/\s*\n\s*/g, "");

    // Split the URL into host/resource path and query parameters
    const [baseUrl, queryParams] = singleLine.split("?");

    if (!baseUrl || !queryParams) {
        throw new Error("Invalid OData URL format");
    }

    // Remove all whitespace from the base URL
    const cleanedBaseUrl: string = baseUrl.replace(/\s+/g, "");

    // Trim and normalize query parameters
    const formattedParams: string = queryParams
        .split("&")
        .map((param) => {
            const [key, value] = param.split("=");
            if (!key || !value) {
                throw new Error(`Invalid query parameter: ${param}`);
            }
            const trimmedKey: string = key.trim();
            const trimmedValue: string = value.trim().replace(/\s+/g, " "); // Condense whitespace
            return `${trimmedKey}=${trimmedValue}`;
        })
        .join("&");

    // Combine the cleaned base URL and formatted query parameters
    return `${cleanedBaseUrl}?${formattedParams}`;
}
