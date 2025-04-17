import * as assert from "assert";
import { getMetadataUrl, getBaseUrl, extractCodeBlocks, combineODataUrl } from "../../util";

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
suite("extractCodeBlocks", () => {
    test("should extract a single code block", () => {
        const response =
            "Here is some code:\n```odata\nhttps://example.com/odata/Customers?$filter=Name eq 'John'\n```";
        const result = extractCodeBlocks(response);
        assert.deepStrictEqual(result, [
            "https://example.com/odata/Customers?$filter=Name eq 'John'",
        ]);
    });

    test("should extract multiple code blocks", () => {
        const response = `
            Here is the first code block:
            \`\`\`odata
            https://example.com/odata/Customers?$filter=Name eq 'John'
            \`\`\`
            And here is the second:
            \`\`\`odata
            https://example.com/odata/Orders?$orderby=OrderDate desc
            \`\`\`
        `;
        const result = extractCodeBlocks(response);
        assert.deepStrictEqual(result, [
            "https://example.com/odata/Customers?$filter=Name eq 'John'",
            "https://example.com/odata/Orders?$orderby=OrderDate desc",
        ]);
    });

    test("should return an empty array if no code blocks are present", () => {
        const response = "This response contains no code blocks.";
        const result = extractCodeBlocks(response);
        assert.deepStrictEqual(result, []);
    });

    test("should ignore malformed code blocks", () => {
        const response = `
            Here is a malformed code block:
            \`\`\`odata
            https://example.com/odata/Customers?$filter=Name eq 'John'
            And here is a proper one:
            \`\`\`odata
            https://example.com/odata/Orders?$orderby=OrderDate desc
            \`\`\`
        `;
        const result = extractCodeBlocks(response);
        assert.deepStrictEqual(result, [
            "https://example.com/odata/Orders?$orderby=OrderDate desc",
        ]);
    });

    test("should ignore code blocks with different languages", () => {
        const response = `
            Here is an odata code block:
            \`\`\`odata
            https://example.com/odata/Customers?$filter=Name eq 'John'
            \`\`\`
            And here is a Javascript code block:
            \`\`\`js
            const url = "https://example.com/odata/Orders?$orderby=OrderDate desc"
            \`\`\`
        `;
        const result = extractCodeBlocks(response);
        assert.deepStrictEqual(result, [
            "https://example.com/odata/Customers?$filter=Name eq 'John'",
        ]);
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
});
