import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
    Csdl, findRoot, findType, formatTypeRef, functionsForImport, members,
    memberType, parseCsdl, resourceStructuredType, resourceType, roots, summarizeCsdl,
} from "../../schema";

const fixture = (name: string) => fs.readFileSync(
    path.resolve(__dirname, "../../../src/test/testdata/canonical", `${name === "canonical" ? "v4" : "v2"}.edmx`), "utf8",
);

function root(csdl: Csdl, name: string) {
    const found = findRoot(csdl, name);
    assert.strictEqual(found.kind, "found");
    if (found.kind !== "found") { throw new Error(name); }
    return found.value;
}

suite("Canonical metadata queries", () => {
    test("keeps namespace identity, inherited members, and structural type references", () => {
        const csdl = parseCsdl(fixture("canonical"));
        const type = resourceStructuredType(csdl, root(csdl, "under_score"))!;
        assert.strictEqual(type.qname, "A.Item");
        assert.deepStrictEqual(members(csdl, type).map((member) => [
            member.kind, member.record.name, formatTypeRef(memberType(member)),
        ]), [
            ["property", "ID", "Edm.Int32"],
            ["property", "URL_value", "Edm.String"],
            ["navigation", "related", "Collection(B.Item)"],
            ["property", "lower_name", "Edm.String"],
            ["property", "address", "A.Address"],
            ["property", "nominal", "A.Code"],
        ]);
        assert.deepStrictEqual(members(csdl, findType(csdl, "B.Item")!).map((m) => m.record.name), ["OnlyB"]);
        assert.deepStrictEqual(members(csdl, findType(csdl, "A.Address")!).map((m) => m.record.name), ["ZIP_code", "city"]);
        assert.strictEqual(findType(csdl, "Item"), undefined);
        assert.strictEqual(resourceType(csdl, root(csdl, "current"))?.collection, false);
        assert.strictEqual(csdl.entitySets[0].bindings.get("related"), "OtherItems");
        assert.deepStrictEqual(type.props.map((p) => p.name), ["lower_name", "address", "nominal"]);
    });

    test("resolves import returns without EntitySet and never guesses an overload", () => {
        const csdl = parseCsdl(fixture("canonical"));
        const entry = root(csdl, "GetAddress");
        assert.strictEqual(entry.kind, "functionImport");
        if (entry.kind !== "functionImport") { throw new Error("GetAddress"); }
        assert.strictEqual(functionsForImport(csdl, entry.record).length, 1);
        assert.strictEqual(resourceStructuredType(csdl, entry)?.qname, "A.Address");
        assert.strictEqual(resourceStructuredType(csdl, root(csdl, "Choose")), undefined);
        assert.strictEqual(resourceStructuredType(csdl, root(csdl, "GetText")), undefined);
        assert.deepStrictEqual(resourceType(csdl, root(csdl, "GetItems")), { qname: "A.Item", collection: true });
        assert.strictEqual(csdl.functions.filter((fn) => fn.qname === "A.lookup" && fn.bound).length, 2);
    });

    test("retains action roots without adding write types or roots to compact output", () => {
        const csdl = parseCsdl(fixture("canonical"));
        const action = root(csdl, "ResetData");
        assert.strictEqual(action.kind, "actionImport");
        assert.strictEqual(resourceType(csdl, action), undefined);
        assert.strictEqual(csdl.actionImports[0].action, "A.reset");
        const yaml = summarizeCsdl(csdl, "https://example.test/").yaml;
        assert.doesNotMatch(yaml, /ResetData|WriteOnly|secret/);
        assert.ok(findType(csdl, "A.WriteOnly"));
    });

    test("keeps V2 association cardinality, EDM types, and non-query import roots", () => {
        const csdl = parseCsdl(fixture("canonical-v2"));
        const order = resourceStructuredType(csdl, root(csdl, "Orders"))!;
        assert.strictEqual(csdl.version, "2.0");
        assert.deepStrictEqual(order.props.map((p) => p.type.qname), ["Edm.DateTime", "Edm.Time", "Edm.Float"]);
        assert.deepStrictEqual(order.navs[0].target, { qname: "Legacy.Line", collection: true });
        assert.strictEqual(findType(csdl, "Legacy.Line")!.navs[0].nullable, true);
        assert.strictEqual(csdl.entitySets[0].bindings.get("Lines"), "Lines");
        assert.strictEqual(resourceStructuredType(csdl, root(csdl, "ReadOrders"))?.qname, "Legacy.Order");
        assert.strictEqual(resourceStructuredType(csdl, root(csdl, "WriteOrders"))?.qname, "Legacy.WriteOnly");
        assert.strictEqual(resourceStructuredType(csdl, root(csdl, "Unspecified"))?.qname, "Legacy.Order");
        assert.deepStrictEqual(roots(csdl).map((r) => r.record.name), ["Orders", "Lines", "ReadOrders", "WriteOrders", "Unspecified"]);
        assert.doesNotMatch(summarizeCsdl(csdl, "https://example.test/").yaml, /WriteOrders|Unspecified|WriteOnly/);
    });

    test("does not choose a root from an ambiguous container", () => {
        const xml = fixture("canonical").replace(
            '<EntitySet Name="OtherItems" EntityType="B.Item" />',
            '<EntitySet Name="under_score" EntityType="B.Item" />',
        );
        const csdl = parseCsdl(xml);
        assert.strictEqual(findRoot(csdl, "under_score").kind, "ambiguous");
        assert.strictEqual(findRoot(csdl, "Under_score").kind, "missing");
    });

    test("bounds invalid inheritance and reports missing bases", () => {
        for (const [base, message] of [["a.Item", /Cyclic/], ["a.Missing", /Unresolved/]] as const) {
            const csdl = parseCsdl(fixture("canonical").replace('BaseType="a.Base"', `BaseType="${base}"`));
            assert.throws(() => members(csdl, findType(csdl, "A.Item")!), message);
        }
    });
});
