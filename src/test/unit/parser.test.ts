import { parse, SyntaxError } from "../../parser/parser";
import * as assert from "assert";

suite("OData Parser Supported URLs", () => {
    const validUrls = [
        "http://services.odata.org/V4/OData/OData.svc/Products",
        "https://example.com/odata/Customers?$filter=Country eq 'USA'",
        "http://services.odata.org/V4/OData/OData.svc/Orders(1)",
        "https://example.com/odata/Employees?$orderby=LastName desc",
        "http://services.odata.org/V4/OData/OData.svc/Products?$select=Name,Price",
        "https://example.com/odata/Books?$filter=Price gt 20 and Author eq 'John Doe'",
        "https://api.dragonrealm.com/Products",
        "https://odata.elvenmarket.net/Products(1)",
        "https://services.mysticbazaar.org/Products?$select=Name,Price",
        "https://odata.darkfortress.io/Products?$filter=Price gt 20",
        "https://api.kingdomtraders.com/Products?$filter=Price gt 20 and Category eq 'Electronics'",
        "https://services.mageguild.net/Products?$filter=Price gt 50 or Category eq 'Books'",
        "https://api.dwarvenemporium.com/Products?$orderby=Price desc",
        "https://odata.phoenixvault.org/Products?$top=5",
        "https://services.shadowmarket.net/Products?$skip=10",
        "https://api.stormhold.io/Products?$top=5&$skip=10",
        "https://odata.starhaven.com/Orders?$expand=Customer",
        "https://services.necromancerstore.net/Orders?$expand=Customer&$filter=Customer/City eq 'Berlin'",
        "https://api.dragonrealm.com/service/$metadata",
        "https://api.dragonrealm.com/service/Products/$count",
        "https://odata.darkfortress.io/Products?$search='laptop'",
        "https://api.kingdomtraders.com/Customers?$filter=startswith(Name, 'A')",
        "https://services.mageguild.net/Orders?$filter=year(OrderDate) eq 2024",
        "https://odata.phoenixvault.org/Products?$filter=Price gt 50 and startswith(Name, 'S')&$orderby=Price desc&$top=5&$expand=Category",
    ];
    validUrls.forEach((url) => {
        test(`should parse valid OData URL: ${url}`, () => {
            const result = parse(url);
            assert.ok(result, `Failed to parse URL: ${url}`);
        });
    });
});

suite("OData Parser - Syntax Errors", () => {
    const invalidUrls = [
        "not a url",
        "http://",
        "http://example.com/odata/Invalid?filter=Name eq ",
    ];
    invalidUrls.forEach((url) => {
        test("should throw error for invalid OData URL: ", () => {
            assert.throws(() => {
                parse(url);
            });
        });
    });
});

suite("OData Parser - Not supported", () => {
    const unsupportedUrls = [
        "https://api.dwarvenemporium.com/Customers?$filter=Emails/any(email: endswith(email, '.com'))",
        "https://odata.elvenmarket.net/Products?$apply=aggregate(Price with sum as TotalPrice)",
        "https://services.mysticbazaar.org/Products?$apply=groupby((Category), aggregate(Price with avg as AvgPrice))",
    ];
    unsupportedUrls.forEach((url) => {
        test(`should throw error for unsupported OData URL: ${url}`, () => {
            assert.throws(
                () => {
                    parse(url);
                },
                SyntaxError,
                `Unsupported OData URL: ${url}`,
            );
        });
    });
});

suite("OData Parser", () => {
    test("Should parse service root and resourcePath", () => {
        const q = "http://services.odata.org/V4/OData/OData.svc/Products";
        const result = parse(q);
        assert.equal(result.serviceRoot!.value!, "http://services.odata.org/V4/OData/OData.svc/");
        assert.equal(result.odataRelativeUri!.resourcePath.value, "Products");
    });
});
