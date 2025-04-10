import * as assert from "assert";
import * as vscode from "vscode";
import { commands } from "../../configuration";
import { setupWithMockedRunner } from "./testutil";

suite("Copy Query Command", () => {
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

        // Assert
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.strictEqual(
            clipboardContent,
            expectedCombinedUrl,
            "Clipboard content does not match the expected combined one-line URL",
        );
    });
});

/*
suite("Run Query Command", () => {
    const testData = {
        "https://services.odata.org/northwind/northwind.svc/Products?$filter=Price gt 100&$orderby=Name asc": `{"odata.metadata":"https://services.odata.org/Northwind/Northwind.svc/$metadata#Products","value":[{"ProductID":38,"ProductName":"Côte de Blaye","SupplierID":18,"CategoryID":1,"QuantityPerUnit":"12 - 75 cl bottles","UnitPrice":"263.5000","UnitsInStock":17,"UnitsOnOrder":0,"ReorderLevel":15,"Discontinued":false},{"ProductID":29,"ProductName":"Thüringer Rostbratwurst","SupplierID":12,"CategoryID":6,"QuantityPerUnit":"50 bags x 30 sausgs.","UnitPrice":"123.7900","UnitsInStock":0,"UnitsOnOrder":0,"ReorderLevel":0,"Discontinued":true},{"ProductID":9,"ProductName":"Mishi Kobe Niku","SupplierID":4,"CategoryID":6,"QuantityPerUnit":"18 - 500 g pkgs.","UnitPrice":"97.0000","UnitsInStock":29,"UnitsOnOrder":0,"ReorderLevel":0,"Discontinued":true},{"ProductID":20,"ProductName":"Sir Rodney's Marmalade","SupplierID":8,"CategoryID":3,"QuantityPerUnit":"30 gift boxes","UnitPrice":"81.0000","UnitsInStock":40,"UnitsOnOrder":0,"ReorderLevel":0,"Discontinued":false},{"ProductID":18,"ProductName":"Carnarvon Tigers","SupplierID":7,"CategoryID":8,"QuantityPerUnit":"16 kg pkg.","UnitPrice":"62.5000","UnitsInStock":42,"UnitsOnOrder":0,"ReorderLevel":0,"Discontinued":false}]}`,
    };
    setup(async () => {
        const context = await setupWithMockedRunner(testData);
    });
    test("Should run OData query and show result in output channel", async () => {
        const result = await vscode.commands.executeCommand(commands.run);

        assert.strictEqual(result, undefined, "Command should execute successfully");
    });
});
*/
