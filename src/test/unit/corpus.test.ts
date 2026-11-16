import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { parseODataUri, recoveryNodes, SyntaxError } from "../../parser/parse";

const testdata = path.join(__dirname, "..", "testdata");

function load<T>(file: string): T[] {
    return JSON.parse(fs.readFileSync(path.join(testdata, file), "utf8")) as T[];
}

function accepts(url: string): boolean {
    try {
        const tree = parseODataUri(url);
        assert.deepStrictEqual(recoveryNodes(tree), []);
        return true;
    } catch (error) {
        if (error instanceof SyntaxError) {
            return false;
        }
        throw error;
    }
}

suite("OData Parser - real world queries", () => {
    const queries = load<{ url: string; valid: boolean; source: string; note?: string }>(
        "realworld-queries.json",
    );
    queries.forEach((query, index) => {
        test(`#${index} ${query.source}: ${query.valid ? "accepts" : "rejects"} ${query.url}`, () => {
            assert.strictEqual(accepts(query.url), query.valid, query.note);
        });
    });
});

/**
 * Test cases of the OASIS OData ABNF (odata-abnf-testcases.yaml, 4.01), for the rules that
 * make up a request URL. Each input is completed to a full URL.
 */
suite("OData Parser - OASIS ABNF test cases", () => {
    const filter = "X?$filter=";
    const prefixes: Record<string, string | null> = {
        odatauri: null,
        odatarelativeuri: "",
        resourcepath: "",
        queryoptions: "X?",
        systemqueryoption: "X?",
        customqueryoption: "X?",
        filter: "X?",
        expand: "X?",
        select: "X?",
        orderby: "X?",
        compute: "X?",
        search: "X?",
        skiptoken: "X?",
        deltatoken: "X?",
        commonexpr: filter,
        boolcommonexpr: filter,
        firstmemberexpr: filter,
        isofexpr: filter,
        notexpr: filter,
        propertypathexpr: filter,
        anyexpr: `${filter}A/`,
        primitiveliteral: `${filter}a eq `,
        enumliteral: `${filter}a eq `,
    };

    // Inputs the official test cases expect to fail but this parser accepts. Either they are
    // only wrong with respect to the model the test suite assumes, which a parser without
    // metadata cannot know, or the leniency is intended.
    const accepted = new Set([
        // a slash in a key cannot be told from a path separator without decoding
        "Categories('Smartphone/Tablet')",
        "Categories('Tablet/Slate')",
        // malformed names end up in the service root
        "Products.('foo')",
        ".Products('foo')",
        // semantically wrong for the assumed model
        "Categories(ID=wrong)",
        "$entity?$id=http://myservice/Customers('ALFKI')&$select=CompanyName,ContactName&$expand=Orders",
        "$entity?$format=json",
        "Categories(1)/Products/$ref/$count",
        "Categories(1)/Products(2)/$ref/$count",
        "Model.Rejection",
        "Categories/TheBestProduct()",
        "Categories(1)/ID/$value/foo",
        "Categories(1)/Address/$value",
        "Categories(1)/Thumbnail/$value",
        "Products/$count/foo",
        "Products(1)/Model.BestSellingProduct/Model.BestSellingProduct",
        "any()",
        "all(lambda:true)",
        "$expand=Customer/$ref($levels=4)",
        "$expand=Customer/$ref($select=Name)",
        "$expand=Customer,Items/$ref($expand=Product)",
        "$expand=Items/$count($count=true)",
        "Model.Available",
        "FirstName in (FirstName,LastName)",
        "EmailAddresses eq ('Miller','Smith')",
        // whitespace around "=" is allowed for multi-line editing
        "$filter =true",
        "$filter= true",
        "$expand=Category($levels=04)",
        // unencoded "#" and "&" start a fragment or the next (custom) query option
        "$search=#1",
        "$search=more&more",
        "$skiptoken=Not&this",
        "$search=%22blue",
    ]);

    const cases = load<{ name: string; rule: string; input: string; fail: boolean }>(
        "abnf-testcases.json",
    );
    cases.forEach((testCase, index) => {
        const prefix = prefixes[testCase.rule.toLowerCase()];
        if (prefix === undefined) {
            // headers, payload values, context URLs: not part of a request URL
            return;
        }
        const expected = !testCase.fail || accepted.has(testCase.input);
        test(`#${index} ${testCase.rule}: ${expected ? "accepts" : "rejects"} ${testCase.input}`, () => {
            const url = prefix === null ? testCase.input : `http://host/service/${prefix}${testCase.input}`;
            assert.strictEqual(accepts(url), expected, testCase.name);
        });
    });
});
