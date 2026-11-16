import * as vscode from "vscode";
import { SyntaxParser } from "./parser/syntaxparser";
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

    /**
     * Put the resource path and each query option on a line of their own, indented below
     * the service root. Documents with syntax errors are left alone.
     */
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        const result = this.syntaxParser.process(document, true);
        if (!result || result.error) {
            return [];
        }
        const text = document.getText();
        const tree = result.tree;

        // offsets at which a new line starts, with their indentation depth
        const breaks: Array<{ offset: number; depth: number }> = [];
        if (tree.resourcePath.length) {
            breaks.push({ offset: tree.resourcePath[0].span.start.offset, depth: 1 });
        }
        for (const option of tree.query ?? []) {
            breaks.push({ offset: option.span.start.offset, depth: 2 });
        }

        return breaks.map(({ offset, depth }) => {
            let start = offset;
            while (start > 0 && /\s/.test(text[start - 1])) {
                start--;
            }
            return vscode.TextEdit.replace(
                new vscode.Range(document.positionAt(start), document.positionAt(offset)),
                `\n${" ".repeat(options.tabSize * depth)}`,
            );
        });
    }
}
