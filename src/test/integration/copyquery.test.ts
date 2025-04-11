import * as assert from "assert";
import * as vscode from "vscode";
import { commands } from "../../configuration";
import { setupTests } from "./testutil";

suite("Copy Query Command", () => {
    setup(async () => {
        await setupTests();
    });

    test("Should copy combined OData URL to clipboard", async () => {
        // Arrange
        const baseUrl = "https://services.odata.org/northwind/northwind.svc/";
        const query = "Products?$filter=Price gt 100&$orderby=Name asc";
        const expectedCombinedUrl = `${baseUrl}${query}`;

        const document = await vscode.workspace.openTextDocument({
            language: "odata",
            content: `${baseUrl}\n${query}`,
        });
        await vscode.languages.setTextDocumentLanguage(document, "odata");
        await vscode.window.showTextDocument(document);

        // Act
        await vscode.commands.executeCommand(commands.copyQuery);
        // Wait for clipboard to be updated
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Assert
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.strictEqual(
            clipboardContent,
            expectedCombinedUrl,
            "Clipboard content does not match the expected combined URL",
        );
    });

    test("Should show message if no active editor", async () => {
        // Arrange
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");

        // Act
        const result = await vscode.commands.executeCommand(commands.copyQuery);
        // Wait for clipboard to be updated
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Assert
        assert.strictEqual(
            result,
            undefined,
            "Command should not execute without an active editor",
        );
    });

    test("Should show message if document is not OData", async () => {
        // Arrange
        const document = await vscode.workspace.openTextDocument({
            language: "plaintext",
            content: "This is not an OData query",
        });
        await vscode.window.showTextDocument(document);
        const notExpected = "This is not an OData query";

        // Act
        const result = await vscode.commands.executeCommand(commands.copyQuery);
        // Wait for clipboard to be updated
        await new Promise((resolve) => setTimeout(resolve, 50));

        const clipboardContent = await vscode.env.clipboard.readText();
        // Assert
        assert.strictEqual(result, undefined, "Command should not execute for non-OData documents");
        assert.notStrictEqual(
            clipboardContent,
            notExpected,
            "Editor content should not be copied to clipboard",
        );
    });

    test("Should combine multi-line OData query into one line in clipboard", async () => {
        // Arrange
        const baseUrl = "https://services.odata.org/northwind/northwind.svc/";
        const query = `
        Products?
            $filter=Price gt 100 &
            $orderby=Name asc`;
        const expectedCombinedUrl = `${baseUrl}Products?$filter=Price gt 100&$orderby=Name asc`;
        const document = await vscode.workspace.openTextDocument({
            language: "odata",
            content: `${baseUrl}\n${query}`,
        });
        await vscode.languages.setTextDocumentLanguage(document, "odata");
        await vscode.window.showTextDocument(document);

        // Act
        await vscode.commands.executeCommand(commands.copyQuery);
        // Wait for clipboard to be updated
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Assert
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.strictEqual(
            clipboardContent,
            expectedCombinedUrl,
            "Clipboard content does not match the expected combined one-line URL",
        );
    });
});
