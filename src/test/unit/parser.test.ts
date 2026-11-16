import * as assert from "assert";
import {
    Apply,
    Binary,
    Expand,
    Expr,
    Lambda,
    Literal,
    Node,
    ODataUri,
    OrderBy,
    Path,
    QueryOption,
    Search,
    Select,
    walk,
} from "../../parser/ast";
import { parseDocument, parseODataUri, recoveryNodes, SyntaxError } from "../../parser/parse";

const root = "https://example.com/odata/";

function option(tree: ODataUri, name: string): QueryOption {
    const found = tree.query?.find((o) => o.name === name);
    if (!found) {
        throw new Error(`option ${name} not found`);
    }
    return found;
}

function filter(expression: string): Expr {
    return option(parseODataUri(`${root}Orders?$filter=${expression}`), "$filter").value as Expr;
}

/** Render an expression with explicit parentheses to make precedence visible. */
function show(e: Expr): string {
    switch (e.type) {
        case "binary":
            return `(${show(e.left)} ${e.op} ${show(e.right)})`;
        case "unary":
            return `(${e.op} ${show(e.operand)})`;
        case "paren":
            return show(e.expr);
        case "list":
            return `[${e.items.map(show).join(", ")}]`;
        case "literal":
            return e.text;
        case "alias":
            return e.name;
        case "path":
            return e.segments
                .map((s) => {
                    if (s.type === "lambda") {
                        return `${s.op}(${s.variable?.name ?? ""}: ${s.predicate ? show(s.predicate) : ""})`;
                    }
                    if (s.type === "member" && s.args) {
                        return `${s.name}(${s.args.map((a) => show(a.value)).join(", ")})`;
                    }
                    return s.name;
                })
                .join("/");
        default:
            return `<${e.type}>`;
    }
}

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
        "https://services.odata.org/northwind/northwind.svc/Orders?$filter=Employee/FirstName eq 'Steven' and Employee/LastName eq 'Buchanan'&$orderby=OrderDate desc&$top=5&$select=ShipName,ShipAddress,ShipCity,ShipRegion,ShipPostalCode,ShipCountry",
        // formerly unsupported
        "https://api.dwarvenemporium.com/Customers?$filter=Emails/any(email: endswith(email, '.com'))",
        "https://odata.elvenmarket.net/Products?$apply=aggregate(Price with sum as TotalPrice)",
        "https://services.mysticbazaar.org/Products?$apply=groupby((Category), aggregate(Price with avg as AvgPrice))",
    ];
    validUrls.forEach((url) => {
        test(`should parse valid OData URL: ${url}`, () => {
            const tree = parseODataUri(url);
            assert.strictEqual(tree.type, "uri");
            assert.deepStrictEqual(recoveryNodes(tree), []);
        });
    });
});

suite("OData Parser - Syntax Errors", () => {
    const invalidUrls = [
        "not a url",
        "http://",
        "http://example.com/odata/Invalid?filter=Name eq ",
        `${root}Orders?$filter=Name eq`,
        `${root}Orders?$filter=Name eq 'a' and`,
        `${root}Orders?$filter=Name 'a'`,
        `${root}Orders?$filter=Name eq 'a`,
        `${root}Orders?$filter=contains(Name, 'a'`,
        `${root}Orders?$filter=Name eq 'a')`,
        `${root}Orders?$filter=Items/any(i i/Quantity gt 1)`,
        `${root}Orders?$filter=`,
        `${root}Orders?$select=`,
        `${root}Orders?$select=Name,`,
        `${root}Orders?$expand=Items(`,
        `${root}Orders?$expand=Items($select=Name`,
        `${root}Orders?$top=five`,
        `${root}Orders?$count=maybe`,
        `${root}Orders?$orderby=Name descending`,
        `${root}Orders?$fi lter=Name eq 'a'`,
        `${root}Orders?$`,
        `${root}Orders?$filter`,
        `${root}Orders(1?$top=1`,
        `${root}Orders?$apply=aggregate(Price with sum as)`,
        `${root}Orders?$apply=groupby(Category)`,
        `${root}Orders?$compute=Price mul 2`,
    ];
    invalidUrls.forEach((url) => {
        test(`should throw error for invalid OData URL: ${url}`, () => {
            assert.throws(() => parseODataUri(url), SyntaxError);
        });
    });

    test("reports the position of the error", () => {
        const text = `${root}Orders?$filter=Name eq 'a' and`;
        try {
            parseODataUri(text);
            assert.fail("expected a syntax error");
        } catch (error) {
            assert.ok(error instanceof SyntaxError);
            assert.strictEqual((error as SyntaxError).location.start.offset, text.length);
        }
    });

    test("condenses the list of expected tokens", () => {
        assert.throws(
            () => parseODataUri(`${root}Orders?$filter=Name eq 1 2`),
            (error: SyntaxError) => {
                assert.strictEqual(
                    error.message,
                    'Expected "&", "#", operator, or end of input but "2" found.',
                );
                return true;
            },
        );
    });
});

suite("OData Parser - service root and resource path", () => {
    test("takes the last segment as resource path", () => {
        const tree = parseODataUri("http://services.odata.org/V4/OData/OData.svc/Products");
        assert.strictEqual(tree.serviceRoot.value, "http://services.odata.org/V4/OData/OData.svc/");
        assert.deepStrictEqual(
            tree.resourcePath.map((s) => s.name),
            ["Products"],
        );
    });

    test("starts the resource path at the first key predicate", () => {
        const tree = parseODataUri("https://example.com/v1/svc/Customers('ALFKI')/Orders");
        assert.strictEqual(tree.serviceRoot.value, "https://example.com/v1/svc/");
        assert.deepStrictEqual(
            tree.resourcePath.map((s) => s.name),
            ["Customers", "Orders"],
        );
    });

    for (const [suffix, names] of [
        ["Products/$count", ["Products", "$count"]],
        ["Products(1)/Name/$value", ["Products", "Name", "$value"]],
        ["$metadata", ["$metadata"]],
        ["$batch", ["$batch"]],
        ["$crossjoin(Products,Sales)", ["$crossjoin"]],
        ["Products/$count?$filter=Price gt 5", ["Products", "$count"]],
    ] as Array<[string, string[]]>) {
        test(`recognizes special path ${suffix}`, () => {
            const tree = parseODataUri(`https://example.com/a/b/${suffix}`);
            assert.strictEqual(tree.serviceRoot.value, "https://example.com/a/b/");
            assert.deepStrictEqual(
                tree.resourcePath.map((s) => s.name),
                names,
            );
        });
    }

    test("a trailing slash means no resource path", () => {
        const tree = parseODataUri("https://example.com/odata/");
        assert.strictEqual(tree.serviceRoot.value, "https://example.com/odata/");
        assert.deepStrictEqual(tree.resourcePath, []);
    });

    test("uses the base URL of the endpoint if given", () => {
        const tree = parseODataUri("https://example.com/odata/Me/Friends", {
            serviceRoot: { baseUrl: "https://example.com/odata" },
        });
        assert.strictEqual(tree.serviceRoot.value, "https://example.com/odata/");
        assert.deepStrictEqual(
            tree.resourcePath.map((s) => s.name),
            ["Me", "Friends"],
        );
    });

    test("uses known container members if the base URL does not match", () => {
        const tree = parseODataUri("https://other.example.com/x/y/Me/Friends", {
            serviceRoot: {
                baseUrl: "https://example.com/odata",
                isContainerMember: (name) => name === "Me",
            },
        });
        assert.strictEqual(tree.serviceRoot.value, "https://other.example.com/x/y/");
        assert.deepStrictEqual(
            tree.resourcePath.map((s) => s.name),
            ["Me", "Friends"],
        );
    });

    test("parses key predicates and parameters", () => {
        const tree = parseODataUri(
            `${root}OrderItems(OrderID=1,ProductID='a''b')/Product/NS.Rate(stars=5,comment=@c)?@c='ok'`,
        );
        const [items, product, rate] = tree.resourcePath;
        assert.deepStrictEqual(
            items.args!.map((a) => [a.name?.name, (a.value as Literal).text]),
            [
                ["OrderID", "1"],
                ["ProductID", "'a''b'"],
            ],
        );
        assert.strictEqual(product.name, "Product");
        assert.strictEqual(rate.name, "NS.Rate");
        assert.strictEqual(rate.args!.length, 2);
        assert.strictEqual(option(tree, "@c").kind, "alias");
    });

    test("spans point into the source text", () => {
        const text = `${root}Orders?$filter=Name eq 'a'`;
        const tree = parseODataUri(text);
        const segment = tree.resourcePath[0];
        assert.strictEqual(text.slice(segment.span.start.offset, segment.span.end.offset), "Orders");
        assert.strictEqual(segment.span.start.line, 1);
        assert.strictEqual(segment.span.start.column, root.length + 1);
    });
});

suite("OData Parser - multi-line documents", () => {
    test("allows line breaks around delimiters", () => {
        const tree = parseODataUri(
            [
                "https://example.com/odata/",
                "    Orders?",
                "        $expand=Items(",
                "            $select=ItemName;",
                "            $top=2",
                "        ),",
                "        Customer&",
                "        $filter=OrderDate gt 2023-01-01",
                "            and CustomerName eq 'x'&",
                "        $top=5",
                "",
            ].join("\r\n"),
        );
        assert.strictEqual(tree.serviceRoot.value, "https://example.com/odata/");
        assert.deepStrictEqual(
            tree.query!.map((o) => o.name),
            ["$expand", "$filter", "$top"],
        );
        const segment = tree.resourcePath[0];
        assert.strictEqual(segment.span.start.line, 2);
        assert.strictEqual(segment.span.start.column, 5);
    });

    test("accepts percent-encoded whitespace and delimiters", () => {
        const tree = parseODataUri(
            `${root}Orders?%24filter=Name%20eq%20%27a%27%20and%20contains%28Name%2C%27b%27%29`,
        );
        assert.strictEqual(
            show(option(tree, "$filter").value as Expr),
            "((Name eq %27a%27) and contains(Name, %27b%27))",
        );
    });
});

suite("OData Parser - query options", () => {
    test("parses all system query options", () => {
        const tree = parseODataUri(
            `${root}Orders?$filter=a eq 1&$orderby=a desc,b&$select=a,b&$expand=c&$top=1&$skip=2` +
                `&$count=true&$search=blue OR green&$format=application/json;odata.metadata=full` +
                `&$compute=a mul 2 as double&$apply=identity&$skiptoken=abc&$inlinecount=allpages`,
        );
        assert.deepStrictEqual(
            tree.query!.map((o) => [o.name, o.value!.type]),
            [
                ["$filter", "binary"],
                ["$orderby", "orderby"],
                ["$select", "select"],
                ["$expand", "expand"],
                ["$top", "literal"],
                ["$skip", "literal"],
                ["$count", "literal"],
                ["$search", "search"],
                ["$format", "raw"],
                ["$compute", "compute"],
                ["$apply", "apply"],
                ["$skiptoken", "raw"],
                ["$inlinecount", "raw"],
            ],
        );
    });

    test("distinguishes system, alias and custom options", () => {
        const tree = parseODataUri(
            `${root}Orders?$top=1&@p=5&api-version=7.1&flag&$whatever=1&sap-client=100`,
        );
        assert.deepStrictEqual(
            tree.query!.map((o) => [o.kind, o.name, !!o.unknown]),
            [
                ["system", "$top", false],
                ["alias", "@p", false],
                ["custom", "api-version", false],
                ["custom", "flag", false],
                ["system", "$whatever", true],
                ["custom", "sap-client", false],
            ],
        );
    });

    test("accepts system query options without $ prefix (4.01)", () => {
        const tree = parseODataUri(`${root}Orders?filter=a eq 1&top=5&search=free text: here`);
        assert.deepStrictEqual(
            tree.query!.map((o) => [o.kind, o.name]),
            [
                ["system", "$filter"],
                ["system", "$top"],
                ["system", "$search"],
            ],
        );
        // a value that is no valid count makes this a custom option of the service
        const custom = parseODataUri(`${root}Orders?count=many`);
        assert.strictEqual(custom.query![0].kind, "custom");
    });

    test("parses $orderby items", () => {
        const tree = parseODataUri(`${root}Orders?$orderby=Price mul 2 desc, Name, length(Name) asc`);
        const orderby = option(tree, "$orderby").value as OrderBy;
        assert.strictEqual(orderby.type, "orderby");
        assert.deepStrictEqual(
            orderby.items.map((i) => [show(i.expr), i.direction]),
            [
                ["(Price mul 2)", "desc"],
                ["Name", undefined],
                ["length(Name)", "asc"],
            ],
        );
    });

    test("parses nested $expand and $select options", () => {
        const tree = parseODataUri(
            `${root}Orders?$expand=Items($select=Name,Price;$filter=Price gt 5;$expand=Product($levels=max);$orderby=Name;$top=3;$count=true),Customer/$ref,*($levels=2),NS.VipOrder/Agent/$count($search=x)` +
                `&$select=*,Address/City,Items($top=2),NS.*`,
        );
        const expand = option(tree, "$expand").value as Expand;
        assert.deepStrictEqual(
            expand.items.map((i) => [i.path.map((p) => (p as any).name).join("/"), i.star, i.suffix]),
            [
                ["Items", undefined, undefined],
                ["Customer", undefined, "$ref"],
                ["", true, undefined],
                ["NS.VipOrder/Agent", undefined, "$count"],
            ],
        );
        const items = expand.items[0];
        assert.deepStrictEqual(
            items.options!.map((o) => o.name),
            ["$select", "$filter", "$expand", "$orderby", "$top", "$count"],
        );
        const nested = items.options![2].value as Expand;
        assert.strictEqual(nested.items[0].options![0].name, "$levels");

        const select = option(tree, "$select").value as Select;
        assert.deepStrictEqual(
            select.items.map((i) => [i.path.map((p) => (p as any).name).join("/"), !!i.star]),
            [
                ["", true],
                ["Address/City", false],
                ["Items", false],
                ["NS", true],
            ],
        );
        assert.strictEqual(select.items[2].options![0].name, "$top");
    });

    test("parses $search", () => {
        const tree = parseODataUri(`${root}Orders?$search=blue green OR NOT "dark red" AND (a OR b)`);
        const search = option(tree, "$search").value as Search;
        assert.strictEqual(search.type, "search");
        const top = search.expr as Binary;
        assert.strictEqual(top.op, "or");
        assert.strictEqual((top.left as Binary).op, "and");
    });

    test("parses $apply transformations", () => {
        const tree = parseODataUri(
            `${root}Sales?$apply=filter(Amount gt 5)/groupby((Customer/Country,Product/Name),aggregate(Amount with sum as Total,$count as Count,Amount with average from Time/Month with max as Peak))/orderby(Total desc)/top(5)` +
                `/concat(identity,aggregate(Sales(Amount with sum as T)))/compute(Total mul 2 as Double)/topcount(2,Amount)/expand(Items,filter(Price gt 1))`,
        );
        const apply = option(tree, "$apply").value as Apply;
        assert.strictEqual(apply.type, "apply");
        assert.deepStrictEqual(
            apply.transformations.map((t) => t.name),
            ["filter", "groupby", "orderby", "top", "concat", "compute", "topcount", "expand"],
        );
        const groupby = apply.transformations[1];
        assert.deepStrictEqual(groupby.args!.map(show), ["Customer/Country", "Product/Name"]);
        const aggregate = groupby.then!.transformations[0];
        assert.deepStrictEqual(
            aggregate.aggregates!.map((a) => [a.expr && show(a.expr), a.method, a.alias?.name]),
            [
                ["Amount", "sum", "Total"],
                ["$count", undefined, "Count"],
                ["Amount", "average", "Peak"],
            ],
        );
        const nested = apply.transformations[4].sequences![1].transformations[0].aggregates![0];
        assert.strictEqual(show(nested.path!), "Sales");
        assert.strictEqual(nested.items![0].alias!.name, "T");
    });

    test("allows line breaks inside $apply", () => {
        const tree = parseODataUri(
            `${root}WorkItems?$apply=filter(\n  State eq 'Active'\n)/\ngroupby(\n  (AssignedTo/UserName),\n  aggregate($count as Count)\n)`,
        );
        assert.strictEqual(option(tree, "$apply").value!.type, "apply");
    });
});

suite("OData Parser - expressions", () => {
    const precedence: Array<[string, string]> = [
        ["a eq 1 or b eq 2 and c eq 3", "((a eq 1) or ((b eq 2) and (c eq 3)))"],
        ["a add b mul c gt d sub 1", "((a add (b mul c)) gt (d sub 1))"],
        ["a sub b sub c", "((a sub b) sub c)"],
        ["a div b divby c mod d", "(((a div b) divby c) mod d)"],
        ["a eq b ne c", "((a eq b) ne c)"],
        ["a lt b eq c gt d", "((a lt b) eq (c gt d))"],
        ["not a eq b", "((not a) eq b)"],
        ["not (a eq b)", "(not (a eq b))"],
        ["not contains(a,'x') and b", "((not contains(a, 'x')) and b)"],
        ["not Style has NS.Color'Red'", "(not (Style has NS.Color'Red'))"],
        ["-a add 1", "((neg a) add 1)"],
        ["a sub -1", "(a sub -1)"],
        ["(a or b) and c", "((a or b) and c)"],
        ["a in ('x','y') or b in [1,2]", "((a in ['x', 'y']) or (b in <array>))"],
        ["a in (1)", "(a in 1)"],
        ["A EQ 1 AND B GT 2", "((A eq 1) and (B gt 2))"],
    ];
    for (const [input, expected] of precedence) {
        test(`precedence: ${input}`, () => {
            assert.strictEqual(show(filter(input)), expected);
        });
    }

    const literals: Array<[string, string]> = [
        ["null", "null"],
        ["true", "boolean"],
        ["False", "boolean"],
        ["42", "int"],
        ["-42", "int"],
        ["10L", "int"],
        ["3.14", "decimal"],
        ["1.5m", "decimal"],
        ["1e10", "double"],
        ["2.0f", "double"],
        ["3.0d", "double"],
        ["-1.5E-3", "double"],
        ["INF", "double"],
        ["-INF", "double"],
        ["NaN", "double"],
        ["'it''s'", "string"],
        ["''", "string"],
        ["2024-02-29", "date"],
        ["2024-02-29T12:30:00Z", "dateTimeOffset"],
        ["2024-02-29T12:30:00.123+01:00", "dateTimeOffset"],
        ["2024-02-29T12:30", "dateTime"],
        ["12:30:00", "timeOfDay"],
        ["12:30:00.5", "timeOfDay"],
        ["01234567-89ab-cdef-0123-456789abcdef", "guid"],
        ["abcdef01-89ab-cdef-0123-456789abcdef", "guid"],
        ["guid'01234567-89ab-cdef-0123-456789abcdef'", "guid"],
        ["datetime'2024-02-29T12:30:00'", "datetime"],
        ["datetimeoffset'2024-02-29T12:30:00Z'", "datetimeoffset"],
        ["time'PT12H30M'", "time"],
        ["duration'P1DT2H'", "duration"],
        ["binary'T0RhdGE='", "binary"],
        ["X'0FA0'", "binary"],
        ["geography'SRID=4326;POINT(1 2)'", "geography"],
        ["NS.Color'Red,Green'", "enum"],
    ];
    for (const [input, kind] of literals) {
        test(`literal: ${input}`, () => {
            const e = filter(`Value eq ${input}`) as Binary;
            assert.strictEqual(e.right.type, "literal");
            assert.strictEqual((e.right as Literal).kind, kind);
            assert.strictEqual((e.right as Literal).text, input);
        });
    }

    test("does not mistake names for keywords or literals", () => {
        assert.strictEqual(show(filter("nullable eq trueValue")), "(nullable eq trueValue)");
        assert.strictEqual(show(filter("notes eq android")), "(notes eq android)");
        assert.strictEqual(show(filter("anything eq allowed")), "(anything eq allowed)");
        assert.strictEqual(show(filter("X eq INFO")), "(X eq INFO)");
    });

    test("parses member paths and function calls", () => {
        assert.strictEqual(
            show(filter("Customer/Address/City eq 'x'")),
            "(Customer/Address/City eq 'x')",
        );
        assert.strictEqual(
            show(filter("concat(concat(City, ', '), Country) eq 'Berlin, Germany'")),
            "(concat(concat(City, ', '), Country) eq 'Berlin, Germany')",
        );
        assert.strictEqual(show(filter("now() gt OrderDate")), "(now() gt OrderDate)");
        assert.strictEqual(
            show(filter("geo.distance(Location, geography'POINT(1 2)') lt 5")),
            "(geo.distance(Location, geography'POINT(1 2)') lt 5)",
        );
        assert.strictEqual(show(filter("isof(NS.VipCustomer)")), "isof(NS.VipCustomer)");
        assert.strictEqual(
            show(filter("cast(Price, Edm.Int32) eq 5")),
            "(cast(Price, Edm.Int32) eq 5)",
        );
        assert.strictEqual(show(filter("NS.VipCustomer/Level gt 1")), "(NS.VipCustomer/Level gt 1)");
        assert.strictEqual(show(filter("Items/$count gt 2")), "(Items/$count gt 2)");
        assert.strictEqual(
            show(filter("$root/Customers('A')/Name eq $it/Name")),
            "($root/Customers('A')/Name eq $it/Name)",
        );
        assert.strictEqual(show(filter("Price gt @min")), "(Price gt @min)");
    });

    test("parses lambda expressions", () => {
        assert.strictEqual(
            show(filter("Items/any(i: i/Quantity gt 1 and i/Tags/all(t: t ne 'x'))")),
            "Items/any(i: ((i/Quantity gt 1) and i/Tags/all(t: (t ne 'x'))))",
        );
        assert.strictEqual(show(filter("Items/any()")), "Items/any(: )");
        const path = filter("Items/any(i:i/Quantity gt 1)") as Path;
        const lambda = path.segments[1] as Lambda;
        assert.strictEqual(lambda.type, "lambda");
        assert.strictEqual(lambda.variable!.name, "i");
    });

    test("parses JSON values", () => {
        const tree = parseODataUri(
            `${root}Find(tags=["a","b"],point={"x":1,"y":[1,2]})?$filter=Name in ["a","b"]`,
        );
        const [tags, point] = tree.resourcePath[0].args!;
        assert.strictEqual(tags.value.type, "array");
        assert.strictEqual(point.value.type, "object");
    });
});

suite("OData Parser - tolerant mode", () => {
    function types(tree: ODataUri): string[] {
        return recoveryNodes(tree).map((n: Node) => n.type);
    }

    test("returns the same tree as strict mode for valid input", () => {
        const text = `${root}Orders?$filter=Items/any(i: i/Quantity gt 1)&$expand=Items($top=1)`;
        assert.deepStrictEqual(parseODataUri(text, { tolerant: true }), parseODataUri(text));
    });

    const recoverable: Array<[string, string[]]> = [
        ["Orders?$filter=", ["missing"]],
        ["Orders?$filter=Name eq ", ["missing"]],
        ["Orders?$filter=Name eq 'a' and ", ["missing"]],
        ["Orders?$filter=Name eq 'a' and &$top=1", ["missing"]],
        ["Orders?$filter=Name eq", ["junk"]],
        ["Orders?$filter=Name eq 'a", ["literal"]],
        ["Orders?$filter=contains(Name, ", ["missing"]],
        ["Orders?$filter=Customer/", ["member"]],
        ["Orders?$filter=Items/any(i: i/", ["member"]],
        ["Orders?$filter=Name eq 1 2&$top=1", ["junk"]],
        ["Orders?$select=", ["missing"]],
        ["Orders?$select=Name,", ["missing"]],
        ["Orders?$expand=Items(", []],
        ["Orders?$expand=Items($select=", ["missing"]],
        ["Orders?$expand=Items($filter=Quantity gt ", ["missing"]],
        ["Orders?$expand=Customer/", ["missing"]],
        ["Orders?$orderby=", ["missing"]],
        ["Orders?$", ["option"]],
        ["Orders?$fil", ["option"]],
        ["Orders?$top=1&$", ["option"]],
        ["Orders?$top=x", ["option"]],
        ["Orders(", ["missing"]],
        ["Orders?$apply=groupby((Category), aggregate(", ["missing"]],
    ];
    for (const [suffix, expected] of recoverable) {
        test(`recovers from: ${suffix}`, () => {
            const result = parseDocument(root + suffix);
            assert.ok(result.error, "expected a syntax error");
            assert.ok(result.tree, "expected a tree");
            assert.deepStrictEqual(types(result.tree!), expected);
            assert.strictEqual(result.tree!.resourcePath[0].name, "Orders");
        });
    }

    test("keeps parsing the options after a broken one", () => {
        const { tree } = parseDocument(`${root}Orders?$filter=Name eq 1 2&$top=1`);
        assert.deepStrictEqual(
            tree!.query!.map((o) => o.name),
            ["$filter", "$top"],
        );
    });

    test("gives up on text that is no URL", () => {
        const result = parseDocument("not a url");
        assert.ok(result.error);
        assert.strictEqual(result.tree, undefined);
    });

    test("every node has a span within the text", () => {
        const text = `${root}Orders?$filter=Items/any(i: i/Quantity gt `;
        const { tree } = parseDocument(text);
        walk(tree, (node) => {
            assert.ok(node.span.start.offset <= node.span.end.offset);
            assert.ok(node.span.end.offset <= text.length);
        });
    });
});
