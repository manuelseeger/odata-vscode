import * as vscode from "vscode";
import { SyntaxLocation, SyntaxParser } from "./parser/syntaxparser";
import { Disposable } from "./provider";
import { ODataMode } from "./configuration";

export class ODataDocumentFormatter
    extends Disposable
    implements vscode.DocumentFormattingEditProvider
{
    public _id: string = "ODataDocumentFormatter";
    constructor(private readonly syntaxParser: SyntaxParser) {
        super();
        this.subscriptions = [
            vscode.languages.registerDocumentFormattingEditProvider(ODataMode, this),
        ];
    }

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        const edits: vscode.TextEdit[] = [];

        const text = document.getText();

        const result = this.syntaxParser.process(document, true);

        if (!result) {
            return edits;
        }

        const visit = (node: any): any => {
            if (Array.isArray(node)) {
                node.forEach((item) => visit(item));
            } else if (node && typeof node === "object") {
                // Check if the node has a location property = is a named syntax location
                if (node.span) {
                    const syntaxNode = node as SyntaxLocation;

                    let depth = 0;
                    if (node.type === "resourcePath") {
                        depth = 1;
                    } else if (node.type === "systemQueryOption") {
                        depth = 2;
                    } else {
                        depth = 0;
                    }

                    if (depth > 0) {
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
                        edits.push(vscode.TextEdit.replace(leadingWhitespaceRange, `\n${indent}`));

                        // Replace the node content with trimmed content
                        edits.push(
                            vscode.TextEdit.replace(
                                new vscode.Range(start, end),
                                `${text.substring(syntaxNode.span.start.offset, syntaxNode.span.end.offset).trim()}`,
                            ),
                        );
                    }
                }
                Object.values(node).forEach((value) => visit(value));
            }
        };
        visit(result.tree);

        return edits;
    }
}
