import { Disposable } from "./provider";
import * as vscode from "vscode";

export class FormatOnCopyProvider extends Disposable implements vscode.DocumentPasteEditProvider {
    public _id: string = "FormatOnCopyProvider";
    constructor(private context: vscode.ExtensionContext) {
        super();
        this.subscriptions = [];
    }

    public prepareDocumentPaste(
        document: vscode.TextDocument,
        ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        token: vscode.CancellationToken,
    ): void | Thenable<void> {}
}
