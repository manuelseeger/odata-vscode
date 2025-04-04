import { parse, SyntaxError } from "../../parser/parser";
import * as assert from "assert";

suite("OData Parser Supported URLs", () => {
    const validUrls = [
        "http://services.odata.org/extra/V4/OData/OData.svc/Products",
        "https://example.com/api/v1/odata/Customers?$filter=Country eq 'USA'",
        "http://services.odata.org/data/service/v2/V4/OData/OData.svc/Orders(1)",
        "https://example.com/services/odata/Employees?$orderby=LastName desc",
        "http://services.odata.org/extra/api/V4/OData/OData.svc/Products?$select=Name,Price",
        "https://example.com/files/api/v1/odata/Books?$filter=Price gt 20 and Author eq 'John Doe'",
        "https://api.dragonrealm.com/shop/Products",
        "https://odata.elvenmarket.net/market/api/Products(1)",
        "https://services.mysticbazaar.org/store/v2/items/Products?$select=Name,Price",
        "https://odata.darkfortress.io/catalog/Products?$filter=Price gt 20",
        "https://api.kingdomtraders.com/v1/trade/Products?$filter=Price gt 20 and Category eq 'Electronics'",
        "https://services.mageguild.net/api/mage/secure/Products?$filter=Price gt 50 or Category eq 'Books'",
        "https://api.dwarvenemporium.com/inventory/Products?$orderby=Price desc",
        "https://odata.phoenixvault.org/v2/phoenix/Products?$top=5",
        "https://services.shadowmarket.net/market/shadow/v1/Products?$skip=10",
        "https://api.stormhold.io/report/Products?$top=5&$skip=10",
        "https://odata.starhaven.com/order/api/Orders?$expand=Customer",
        "https://services.necromancerstore.net/store/necro/v1/Orders?$expand=Customer&$filter=Customer/City eq 'Berlin'",
        "https://api.dragonrealm.com/info/service/$metadata",
        "https://api.dragonrealm.com/v1/stats/service/Products/$count",
        "https://odata.darkfortress.io/search/api/laptops/Products?$search='laptop'",
        "https://api.kingdomtraders.com/clients/Customers?$filter=startswith(Name, 'A')",
        "https://services.mageguild.net/orders/v1/Orders?$filter=year(OrderDate) eq 2024",
        "https://odata.phoenixvault.org/api/phoenix/v2/Products?$filter=Price gt 50 and startswith(Name, 'S')&$orderby=Price desc&$top=5&$expand=Category",
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
