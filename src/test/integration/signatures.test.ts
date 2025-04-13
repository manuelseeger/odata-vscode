import * as assert from "assert";
import * as vscode from "vscode";
import { SignatureHelpProvider } from "../../signatures";

import { odata } from "../../contracts/types";

suite("SignatureHelpProvider Integration Tests", () => {
    let signatureHelpProvider: SignatureHelpProvider;

    suiteSetup(async () => {
        const context = {} as vscode.ExtensionContext; // Mock context
        const ref = {
            v4: {
                functions: [
                    {
                        name: "testFunction",
                        params: [{ name: "param1", type: "Edm.String" }],
                        doc: "Test function documentation.",
                    },
                    {
                        name: "nestedFunction",
                        params: [
                            { name: "param1", type: "Edm.Int32" },
                            { name: "param2", type: "Edm.Boolean" },
                        ],
                        doc: "Nested function documentation.",
                    },
                    {
                        name: "testFunction2",
                        params: [{ name: "param1", type: "Edm.String" }],
                        doc: "Test function 2 documentation.",
                    },
                    {
                        name: "tripleFunction",
                        params: [
                            { name: "param1", type: "Edm.Int32" },
                            { name: "param2", type: "Edm.String" },
                            { name: "param3", type: "Edm.Boolean" },
                        ],
                        doc: "Triple function documentation.",
                    },
                ],
            },
        } as odata.Reference;
        signatureHelpProvider = new SignatureHelpProvider(context, ref);
    });

    test("should provide signature help for a valid function call", async () => {
        const document = await vscode.workspace.openTextDocument({
            content: `testFunction('value')`,
            language: "odata",
        });
        const position = new vscode.Position(0, 13); // Position inside the function call
        const context = {
            triggerKind: vscode.SignatureHelpTriggerKind.Invoke,
        } as vscode.SignatureHelpContext;

        const signatureHelp = await signatureHelpProvider.provideSignatureHelp(
            document,
            position,
            {} as vscode.CancellationToken,
            context,
        );

        assert.ok(signatureHelp.signatures, "Expected signature help to be provided.");

        assert.strictEqual(
            signatureHelp.signatures[signatureHelp.activeSignature].label,
            "testFunction(param1: Edm.String)",
            "Signature label mismatch.",
        );

        assert.strictEqual(
            signatureHelp.signatures[signatureHelp.activeSignature].parameters[0].label,
            "param1: Edm.String",
            "Parameter label mismatch.",
        );
    });

    test("should not provide signature help when canceled", async () => {
        const document = await vscode.workspace.openTextDocument({
            content: `testFunction()`,
            language: "odata",
        });
        const position = new vscode.Position(0, 12); // Position after the closing parenthesis
        const context = {
            triggerKind: vscode.SignatureHelpTriggerKind.Invoke,
            isRetrigger: true,
        } as vscode.SignatureHelpContext;

        const signatureHelp = await signatureHelpProvider.provideSignatureHelp(
            document,
            position,
            {} as vscode.CancellationToken,
            context,
        );

        assert.ok(
            !signatureHelp || signatureHelp.signatures.length === 0,
            "Expected no signature help to be provided.",
        );
    });

    test("should provide signature help for multiline content with line breaks after opening brackets or commas", async () => {
        const document = await vscode.workspace.openTextDocument({
            content: `testFunction(
                'value1',
                'value2'
            )`,
            language: "odata",
        });
        const position = new vscode.Position(2, 20); // Position inside the second argument
        const context = {
            triggerKind: vscode.SignatureHelpTriggerKind.Invoke,
        } as vscode.SignatureHelpContext;

        const signatureHelp = await signatureHelpProvider.provideSignatureHelp(
            document,
            position,
            {} as vscode.CancellationToken,
            context,
        );

        assert.ok(signatureHelp.signatures, "Expected signature help to be provided.");
        assert.strictEqual(
            signatureHelp.signatures[signatureHelp.activeSignature].label,
            "testFunction(param1: Edm.String)",
            "Signature label mismatch.",
        );
    });

    test("should provide signature help for multiple function calls in one line", async () => {
        const document = await vscode.workspace.openTextDocument({
            content: `testFunction1('value1'), testFunction2('value2')`,
            language: "odata",
        });
        const position = new vscode.Position(0, 43); // Position inside the second function call
        const context = {
            triggerKind: vscode.SignatureHelpTriggerKind.Invoke,
        } as vscode.SignatureHelpContext;

        const signatureHelp = await signatureHelpProvider.provideSignatureHelp(
            document,
            position,
            {} as vscode.CancellationToken,
            context,
        );

        assert.ok(signatureHelp.signatures, "Expected signature help to be provided.");
        assert.strictEqual(
            signatureHelp.signatures[signatureHelp.activeSignature].label,
            "testFunction2(param1: Edm.String)",
            "Signature label mismatch.",
        );
    });

    test("should provide signature help for function calls with nested parenthesis in the arguments", async () => {
        const document = await vscode.workspace.openTextDocument({
            content: `testFunction(nestedFunction('value'))`,
            language: "odata",
        });
        const position = new vscode.Position(0, 30); // Position inside the nested function call
        const context = {
            triggerKind: vscode.SignatureHelpTriggerKind.Invoke,
        } as vscode.SignatureHelpContext;

        const signatureHelp = await signatureHelpProvider.provideSignatureHelp(
            document,
            position,
            {} as vscode.CancellationToken,
            context,
        );

        assert.ok(signatureHelp.signatures, "Expected signature help to be provided.");
        assert.strictEqual(
            signatureHelp.signatures[signatureHelp.activeSignature].label,
            "nestedFunction(param1: Edm.Int32, param2: Edm.Boolean)",
            "Signature label mismatch.",
        );
    });

    test("should provide signature help for tripleFunction with active parameter", async () => {
        const document = await vscode.workspace.openTextDocument({
            content: `tripleFunction(1, 'hello', true)`,
            language: "odata",
        });
        // Set the position within the second argument to highlight it (active parameter index should be 1)
        const position = new vscode.Position(0, 17);
        const context = {
            triggerKind: vscode.SignatureHelpTriggerKind.Invoke,
        } as vscode.SignatureHelpContext;

        const signatureHelp = await signatureHelpProvider.provideSignatureHelp(
            document,
            position,
            {} as vscode.CancellationToken,
            context,
        );

        assert.ok(signatureHelp.signatures, "Expected signature help to be provided.");
        assert.strictEqual(
            signatureHelp.signatures[signatureHelp.activeSignature].label,
            "tripleFunction(param1: Edm.Int32, param2: Edm.String, param3: Edm.Boolean)",
            "Signature label mismatch.",
        );
        assert.strictEqual(signatureHelp.activeParameter, 1, "Active parameter index mismatch.");
    });
});
