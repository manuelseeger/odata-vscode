import * as vscode from "vscode";
import { Disposable } from "./provider";
import { ODataMode } from "./configuration";
import { odata } from "./contracts";

export class SignatureHelpProvider extends Disposable implements vscode.SignatureHelpProvider {
    public _id: string = "SignatureHelpProvider";
    public triggerCharacters = [",", "("];
    private signatures: vscode.SignatureInformation[];
    constructor(
        private context: vscode.ExtensionContext,
        private ref: odata.Reference,
    ) {
        super();
        this.signatures = this.getSignatures();
        this.subscriptions = [
            vscode.languages.registerSignatureHelpProvider(
                ODataMode,
                this,
                ...this.triggerCharacters,
            ),
        ];
    }

    public async provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.SignatureHelpContext,
    ): Promise<vscode.SignatureHelp> {
        if (this.shouldCancelSignatureHelp(document, position, context)) {
            return new vscode.SignatureHelp();
        }
        const funcInfo = this.findFunctionCallStart(document, position);
        if (funcInfo) {
            const help = new vscode.SignatureHelp();
            help.signatures = this.signatures;
            const foundIndex = this.signatures.findIndex((sig) =>
                sig.label.includes(`${funcInfo.name}(`),
            );
            if (foundIndex >= 0) {
                help.activeSignature = foundIndex;
                const signature = this.signatures[foundIndex];
                // Changed code below to support multiple lines
                const start = new vscode.Position(
                    funcInfo.position.line,
                    funcInfo.position.character + funcInfo.name.length,
                );
                const paramSubstr = document.getText(new vscode.Range(start, position));
                const commaCount = (paramSubstr.match(/,/g) || []).length;
                help.activeParameter = Math.min(commaCount, signature.parameters.length - 1);
                return help;
            }
        }
        return new vscode.SignatureHelp();
    }

    /**
     * Check if the signature help should be canceled.
     *
     * This method checks the character before and after the current position
     * to determine if the signature help should be canceled.
     *
     * @param document The text document being edited.
     * @param position The current position in the document.
     * @param context The context of the signature help.
     * @returns {boolean} True if the signature help should be canceled, false otherwise.
     */
    private shouldCancelSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.SignatureHelpContext,
    ): boolean {
        const charBefore =
            position.character > 0
                ? document.getText(new vscode.Range(position.translate(0, -1), position))
                : "";

        const charAfter = document.getText(new vscode.Range(position, position.translate(0, 1)));

        return (
            charBefore === ")" || charAfter === ")" || (context.isRetrigger && charAfter === ")")
        );
    }

    /**
     * Find the start of a function call in the document.
     *
     * This method searches backwards from the given position to find the opening
     * parenthesis of a function call. It captures the function name and starting
     * position.
     *
     * @param document The text document to search in.
     * @param position The position to start searching from.
     * @returns {string, vscode.Position} The name of the function and its starting position.
     */
    private findFunctionCallStart(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): { name: string; position: vscode.Position } | undefined {
        let balance = 0;
        for (let ln = position.line; ln >= 0; ln--) {
            const text = document.lineAt(ln).text;
            const limit = ln === position.line ? position.character : text.length;
            for (let i = limit - 1; i >= 0; i--) {
                const char = text[i];
                if (char === "(") {
                    balance--;
                    if (balance < 0) {
                        // Look back for the function name preceding the '('
                        const prefix = text.substring(0, i);
                        const match = prefix.match(/(\w+)\s*$/);
                        if (match) {
                            return {
                                name: match[1],
                                position: new vscode.Position(ln, match.index!),
                            };
                        }
                    }
                } else if (char === ")") {
                    balance++;
                }
            }
        }
        return undefined;
    }

    /**
     * Build a list of signature help strings for all function in the
     * OData reference.
     *
     * @returns {vscode.SignatureInformation[]} The signature help details.
     */
    private getSignatures(): vscode.SignatureInformation[] {
        const signatures: vscode.SignatureInformation[] = [];
        // we provide signatures for v4 functions even if the document
        // might be v2; this saves us parsing the document to check
        for (const func of this.ref.v4.functions) {
            const parameters = func.params
                ? func.params.map((param) => `${param.name}: ${param.type}`).join(", ")
                : "";
            const label = `${func.name}(${parameters})`;
            const signature = new vscode.SignatureInformation(label, func.doc);
            signature.parameters =
                func.params?.map((param) => {
                    return new vscode.ParameterInformation(
                        `${param.name}: ${param.type}`,
                        param.description,
                    );
                }) ?? [];
            signatures.push(signature);
        }
        return signatures;
    }
}
