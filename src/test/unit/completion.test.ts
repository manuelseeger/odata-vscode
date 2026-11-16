import * as assert from "assert";
import { completionContext, resolvedSiteAt } from "../../language/completion";
import { digestMetadata } from "../../metadata";
import { DataModel } from "../../odata2ts/data-model/DataModel";
import { metadataString } from "./metadataservice.test";

const root = "https://example.com/odata/";

const metadata = metadataString.replace(
    `<EntityType Name="Item">`,
    `<ComplexType Name="Address">
        <Property Name="City" Type="Edm.String"/>
    </ComplexType>
    <EntityType Name="Product">
        <Key><PropertyRef Name="ProductID"/></Key>
        <Property Name="ProductID" Type="Edm.Int32"/>
        <Property Name="Label" Type="Edm.String"/>
    </EntityType>
    <EntityType Name="Item">
        <Property Name="Shipping" Type="testing.Address"/>
        <NavigationProperty Name="Product" Type="testing.Product"/>`,
);

suite("Completion context", () => {
    let model: DataModel;

    suiteSetup(async () => {
        model = await digestMetadata(metadata);
    });

    /** Complete at the position of "|" in the query. */
    function at(query: string) {
        const text = root + query;
        const offset = text.indexOf("|");
        assert.ok(offset >= 0, "no cursor in query");
        return completionContext(text.replace("|", ""), offset, { model, baseUrl: root });
    }

    function labels(query: string): string[] {
        return at(query).entries.map((e) => e.label);
    }

    const order = ["OrderID", "OrderDate", "CustomerName", "Items"];
    const item = ["Shipping", "ItemID", "ItemName", "Quantity", "Product"];
    const product = ["ProductID", "Label"];

    const cases: Array<[string, string[]]> = [
        ["|", ["Orders", "Items"]],
        ["Ord|", ["Orders", "Items"]],
        ["\n    |", ["Orders", "Items"]],
        ["Orders(1)/|", order],
        ["Orders(1)/Items(2)/|", item],
        ["Orders(1)/Items(2)/Pro|", item],
        ["Orders?$select=|", order],
        ["Orders?$select=OrderID,|", order],
        ["Orders?$select=OrderID,Cust|", order],
        ["Orders?$select=OrderID,|&$top=1", order],
        ["Orders?$expand=|", ["Items"]],
        ["Orders?$expand=Items($select=|", item],
        ["Orders?$expand=Items($select=ItemID;$expand=|", ["Product"]],
        ["Orders?$expand=Items($expand=Product($select=|", product],
        ["Orders?$expand=Items($expand=Product($select=Label);$filter=|", item],
        ["Orders?$expand=Items($filter=Quantity gt 1 and |", item],
        ["Orders?$expand=Items($orderby=|", item],
        ["Orders?$expand=Items/|", ["Product"]],
        ["Orders?$filter=|", order],
        ["Orders?$filter=Ord|", order],
        ["Orders?$filter=CustomerName eq 'x' and |", order],
        ["Orders?$filter=contains(|", order],
        ["Orders?$filter=contains(CustomerName, 'x') or (|", order],
        ["Orders?$filter=Items/|", item],
        ["Orders?$filter=Items/any(i: |", [...order, "i"]],
        ["Orders?$filter=Items/any(i: i/|", item],
        ["Orders?$filter=Items/any(i: i/Product/|", product],
        ["Orders?$filter=Items/any(i: i/Shipping/|", ["City"]],
        ["Orders?$orderby=|", order],
        ["Orders?$orderby=OrderID desc,|", order],
        ["Orders?$compute=OrderID mul 2 as Twice&$filter=|", [...order, "Twice"]],
        ["Orders?$apply=groupby((|", order],
        ["Orders?$apply=aggregate(|", order],
        ["Orders/$count?$filter=|", order],
        // multi-line
        ["\n  Orders?\n    $expand=Items(\n      $select=|", item],
        // nothing fits here
        ["Orders?$filter=CustomerName eq 'x|", []],
        ["Orders?$top=|", []],
        ["Orders?$filter=OrderID eq 1|", []],
        ["Nope?$select=|", []],
    ];
    for (const [query, expected] of cases) {
        test(`names at: ${query.replace(/\n/g, "\\n")}`, () => {
            assert.deepStrictEqual(labels(query), expected);
        });
    }

    test("offers functions where an operand starts", () => {
        assert.strictEqual(at("Orders?$filter=|").functions, true);
        assert.strictEqual(at("Orders?$filter=con|").functions, true);
        assert.strictEqual(at("Orders?$filter=OrderID eq |").functions, true);
        assert.strictEqual(at("Orders?$orderby=|").functions, true);
        assert.strictEqual(at("Orders?$select=|").functions, false);
        assert.strictEqual(at("Orders?$expand=|").functions, false);
        assert.strictEqual(at("Orders?$filter=Items/|").functions, false);
        assert.strictEqual(at("Orders?$filter=CustomerName eq 'x|").functions, false);
        assert.strictEqual(at("Ord|").functions, false);
    });

    test("offers operators after an operand", () => {
        assert.strictEqual(at("Orders?$filter=OrderID |").operators, true);
        assert.strictEqual(at("Orders?$filter=OrderID eq 1 |").operators, true);
        assert.strictEqual(at("Orders?$expand=Items($filter=Quantity |").operators, true);
        assert.strictEqual(at("Orders?$filter=OrderID 5 |").operators, false);
        assert.strictEqual(at("Orders?$filter=OrderID eq |").operators, false);
        assert.strictEqual(at("Orders?$select=OrderID |").operators, false);
        const orderby = at("Orders?$orderby=OrderID |");
        assert.strictEqual(orderby.operators, true);
        assert.strictEqual(orderby.direction, true);
    });

    test("tells where query options start", () => {
        assert.strictEqual(at("Orders?|").options, "top");
        assert.strictEqual(at("Orders?$top=1&|").options, "top");
        assert.strictEqual(at("Orders?$|").options, "top");
        assert.strictEqual(at("Orders?$top=1&$fil|").options, "top");
        assert.strictEqual(at("Orders?$expand=Items(|").options, "nested");
        assert.strictEqual(at("Orders?$expand=Items($|").options, "nested");
        assert.strictEqual(at("Orders?$expand=Items($top=1;|").options, "nested");
        assert.strictEqual(at("Orders?$expand=Items($top=1;$sel|").options, "nested");
        assert.strictEqual(at("Orders?$expand=Items($top=1)|").options, undefined);
        assert.strictEqual(at("Orders?$filter=|").options, undefined);
    });

    test("works without metadata", () => {
        const text = `${root}Orders?$filter=`;
        const context = completionContext(text, text.length);
        assert.strictEqual(context.parsed, true);
        assert.strictEqual(context.functions, true);
        assert.deepStrictEqual(context.entries, []);
    });

    test("gives up on text that is no URL", () => {
        assert.strictEqual(completionContext("Orders?$filter=", 15).parsed, false);
    });

    test("resolves the name at a position", () => {
        const text = `${root}Orders?$expand=Items($select=Quantity;$filter=Product/Label eq 'x')`;
        const resolve = (name: string) => resolvedSiteAt(text, text.indexOf(name) + 1, { model, baseUrl: root })?.resolved;

        const quantity = resolve("Quantity");
        assert.ok(quantity?.kind === "property");
        assert.strictEqual(quantity.owner.fqName, "testing.Item");
        assert.strictEqual(quantity.property.odataType, "Edm.Int32");

        const label = resolve("Label");
        assert.ok(label?.kind === "property");
        assert.strictEqual(label.owner.fqName, "testing.Product");

        assert.strictEqual(resolve("Orders")?.kind, "containerMember");
        assert.strictEqual(resolve("eq"), undefined);
    });
});
