import * as assert from "assert";
import * as vscode from "vscode";
import { setupTests } from "./testutil";
import { ODataDocumentFormatter } from "../../formatting";
import { SyntaxParser } from "../../parser/syntaxparser";

suite("Document Formatter", () => {
    let context: vscode.ExtensionContext;
    let formatter: ODataDocumentFormatter;
    setup(async () => {
        const syntaxParser = new SyntaxParser();
        formatter = new ODataDocumentFormatter(syntaxParser);
        ({ context } = await setupTests());
    });

    const testCases = [
        {
            name: "Should format document correctly",
            input: "https://services.necromancerstore.net/service/Orders?$expand=Customer&$filter=Customer/City eq 'Berlin'",
            expected: `https://services.necromancerstore.net/service/\n    Orders?\n        $expand=Customer&\n        $filter=Customer/City eq 'Berlin'`,
        },
        {
            name: "Should not format erroneous document",
            input: "https://api.kingdomtraders.com/customer/\nCustomers?$fi lter=startswith(Name, 'A')",
            expected: `https://api.kingdomtraders.com/customer/\nCustomers?$fi lter=startswith(Name, 'A')`,
        },
        {
            name: "Should format Northwind",
            input: "https://services.odata.org/northwind/northwind.svc/Orders?$filter=Employee/FirstName eq 'Steven' and Employee/LastName eq 'Buchanan'&$orderby=OrderDate desc&$top=5&$select=ShipName,ShipAddress,ShipCity,ShipRegion,ShipPostalCode,ShipCountry",
            expected: `https://services.odata.org/northwind/northwind.svc/\n    Orders?\n        $filter=Employee/FirstName eq 'Steven' and Employee/LastName eq 'Buchanan'&\n        $orderby=OrderDate desc&\n        $top=5&\n        $select=ShipName,ShipAddress,ShipCity,ShipRegion,ShipPostalCode,ShipCountry`,
        },
    ];

    for (const testCase of testCases) {
        test(testCase.name, async () => {
            // arrange
            let document = await vscode.workspace.openTextDocument({
                language: "odata",
                content: testCase.input,
            });
            document = await vscode.languages.setTextDocumentLanguage(document, "odata");
            await vscode.window.showTextDocument(document);

            // act
            await vscode.commands.executeCommand("editor.action.formatDocument");
            const formattedText = document.getText();

            // assert
            assert.strictEqual(
                formattedText,
                testCase.expected,
                "Document was not formatted correctly",
            );
        });
    }
});
