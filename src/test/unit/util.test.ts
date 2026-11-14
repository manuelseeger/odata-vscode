import * as assert from "assert";
import { getMetadataUrl, getBaseUrl, combineODataUrl } from "../../util";

suite("getMetadataUrl", () => {
    test("should append /$metadata to base URL without trailing slashes", () => {
        const baseUrl = "https://example.com/api";
        const result = getMetadataUrl(baseUrl);
        assert.strictEqual(result, "https://example.com/api/$metadata");
    });

    test("should append /$metadata to base URL with trailing slashes", () => {
        const baseUrl = "https://example.com/api/";
        const result = getMetadataUrl(baseUrl);
        assert.strictEqual(result, "https://example.com/api/$metadata");
    });

    test("should return base URL if it already ends with /$metadata", () => {
        const baseUrl = "https://example.com/api/$metadata";
        const result = getMetadataUrl(baseUrl);
        assert.strictEqual(result, "https://example.com/api/$metadata");
    });

    test("should return base URL if it ends with /$metadata and has query parameters", () => {
        const baseUrl = "https://example.com/api/$metadata?$filter=Customer";
        const result = getMetadataUrl(baseUrl);
        assert.strictEqual(result, "https://example.com/api/$metadata?$filter=Customer");
    });

    test("should append /$metadata to base URL with query parameters but not ending with /$metadata", () => {
        const baseUrl = "https://example.com/api?param=value";
        const result = getMetadataUrl(baseUrl);
        assert.strictEqual(result, "https://example.com/api/$metadata?param=value");
    });
});

suite("getBaseUrl", () => {
    test("should return the base URL without trailing slashes", () => {
        const url = "https://example.com/api/";
        const result = getBaseUrl(url);
        assert.strictEqual(result, "https://example.com/api/");
    });

    test("should return the base URL without /$metadata", () => {
        const url = "https://example.com/api/$metadata";
        const result = getBaseUrl(url);
        assert.strictEqual(result, "https://example.com/api/");
    });

    test("should return the base URL without /$metadata and query parameters", () => {
        const url = "https://example.com/api/$metadata?$filter=Customer";
        const result = getBaseUrl(url);
        assert.strictEqual(result, "https://example.com/api/");
    });

    test("should return the base URL without changes if no /$metadata is present", () => {
        const url = "https://example.com/api?param=value";
        const result = getBaseUrl(url);
        assert.strictEqual(result, "https://example.com/api/");
    });

    test("should return the base URL without trailing slashes and /$metadata", () => {
        const url = "https://example.com/api/$metadata";
        const result = getBaseUrl(url);
        assert.strictEqual(result, "https://example.com/api/");
    });
});
suite("combineODataUrl", () => {
    test("should combine multiline OData URL with valid query parameters", () => {
        const input = `https://example.com/odata/Customers
?$filter=Name eq 'John'&$orderby=Name asc`;
        const result = combineODataUrl(input);
        assert.strictEqual(
            result,
            "https://example.com/odata/Customers?$filter=Name eq 'John'&$orderby=Name asc",
        );
    });

    test("should combine invalid OData URL format", () => {
        const input = `https://example.com/odata/Customers
$filter=Name eq 'John'`;
        const result = combineODataUrl(input);
        assert.strictEqual(result, "https://example.com/odata/Customers$filter=Nameeq'John'");
    });

    test("should handle query parameters with extra spaces", () => {
        const input = `https://example.com/odata/Orders
?$filter=  OrderDate  eq  '2025-04-08'  &  $top  =  5`;
        const result = combineODataUrl(input);
        assert.strictEqual(
            result,
            "https://example.com/odata/Orders?$filter=OrderDate eq '2025-04-08'&$top=5",
        );
    });

    test("should handle URLs with no query parameters", () => {
        const input = `https://example.com/odata/Products`;
        const result = combineODataUrl(input);
        assert.strictEqual(result, "https://example.com/odata/Products");
    });

    test("should handle complex query parameters", () => {
        const input = `https://example.com/odata/
    Products
        ?$filter=Price gt 100 and Price lt 500&
        $expand=Category,Tags`;
        const result = combineODataUrl(input);
        assert.strictEqual(
            result,
            "https://example.com/odata/Products?$filter=Price gt 100 and Price lt 500&$expand=Category,Tags",
        );
    });

    test("should handle multi line with trailing spaces", () => {
        const input = `https://example.com/odata/  
        Customers 
            ?$filter=Name eq 'John' & 
            $orderby=Name asc & 
            $top=10`;
        const result = combineODataUrl(input);
        assert.strictEqual(
            result,
            "https://example.com/odata/Customers?$filter=Name eq 'John'&$orderby=Name asc&$top=10",
        );
    });

    test("should keep a space where a line break separates two tokens", () => {
        const input = `https://example.com/odata/Orders?$filter=CreateDate ge 2026-01-01
    and ClosedDate le 2026-12-31`;
        const result = combineODataUrl(input);
        assert.strictEqual(
            result,
            "https://example.com/odata/Orders?$filter=CreateDate ge 2026-01-01 and ClosedDate le 2026-12-31",
        );
    });

    test("should keep a space before an opening parenthesis on a new line", () => {
        const input = `https://example.com/odata/Orders?$filter=Id eq 1 and
    (Name eq 'A' or Name eq 'B')`;
        const result = combineODataUrl(input);
        assert.strictEqual(
            result,
            "https://example.com/odata/Orders?$filter=Id eq 1 and (Name eq 'A' or Name eq 'B')",
        );
    });

    test("should combine multiline filter inside apply (issue #6)", () => {
        const input = `https://example.com/odata/Tickets?$apply=
    filter(
        CreateDate ge 2026-01-01
        and ClosedDate le 2026-12-31
    )
    /groupby(
        (CreatedBy),
        aggregate($count as CreatedCount)
    )`;
        const result = combineODataUrl(input);
        assert.strictEqual(
            result,
            "https://example.com/odata/Tickets?$apply=filter(CreateDate ge 2026-01-01 and ClosedDate le 2026-12-31)/groupby((CreatedBy),aggregate($count as CreatedCount))",
        );
    });

    test("should combine CRLF line breaks", () => {
        const input =
            "https://example.com/odata/Orders?$filter=Id gt 1\r\n    and Id lt 9\r\n    &$top=5";
        const result = combineODataUrl(input);
        assert.strictEqual(
            result,
            "https://example.com/odata/Orders?$filter=Id gt 1 and Id lt 9&$top=5",
        );
    });
});
