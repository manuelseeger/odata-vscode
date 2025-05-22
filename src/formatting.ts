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

                        const indent = " ".repeat(options.tabSize * depth);

                        // Look back in the text and replace any leading whitespace with indentation
                        let leadingStartOffset = syntaxNode.span.start.offset;
                        while (leadingStartOffset > 0 && /\s/.test(text[leadingStartOffset - 1])) {
                            leadingStartOffset--;
                        }
                        const leadingStart = document.positionAt(leadingStartOffset);
                        const leadingWhitespaceRange = new vscode.Range(leadingStart, start);
                        edits.push(vscode.TextEdit.replace(leadingWhitespaceRange, `\n${indent}`));

                        // Determine if this node is followed by a separator
                        const contentStartPos = start;
                        const nodeEndOffset = syntaxNode.span.end.offset;

                        let sepOffset = nodeEndOffset;
                        while (sepOffset < text.length && /\s/.test(text[sepOffset])) {
                            sepOffset++;
                        }
                        // Identify the next non-whitespace character
                        const nextChar = sepOffset < text.length ? text[sepOffset] : "";
                        const isSeparator =
                            (depth === 1 && nextChar === "?") || (depth === 2 && nextChar === "&");
                        // Determine replacement end position (include separator if present)
                        const contentEndPos = isSeparator
                            ? document.positionAt(sepOffset + 1)
                            : end;
                        let raw = text
                            .substring(syntaxNode.span.start.offset, syntaxNode.span.end.offset)
                            .trim();
                        if (isSeparator) {
                            raw += nextChar;
                        }
                        // Replace the node content (and its separator) with trimmed content and proper separator
                        edits.push(
                            vscode.TextEdit.replace(
                                new vscode.Range(contentStartPos, contentEndPos),
                                raw,
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
