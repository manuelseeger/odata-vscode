import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { analyze, Analysis } from "../../language/analyze";
import { digestMetadata } from "../../metadata";
import { DataModel } from "../../odata2ts/data-model/DataModel";
import { parseDocument } from "../../parser/parse";

const root = "https://example.com/odata/";

const metadata = `<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="shop" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EnumType Name="Status"><Member Name="Open" Value="0"/><Member Name="Closed" Value="1"/></EnumType>
      <ComplexType Name="Address">
        <Property Name="City" Type="Edm.String"/>
        <Property Name="Street" Type="Edm.String"/>
        <NavigationProperty Name="Country" Type="shop.Country"/>
      </ComplexType>
      <EntityType Name="Country">
        <Key><PropertyRef Name="Code"/></Key>
        <Property Name="Code" Type="Edm.String" Nullable="false"/>
        <Property Name="Name" Type="Edm.String"/>
      </EntityType>
      <EntityType Name="Customer">
        <Key><PropertyRef Name="ID"/></Key>
        <Property Name="ID" Type="Edm.Int32" Nullable="false"/>
        <Property Name="Name" Type="Edm.String"/>
        <Property Name="Emails" Type="Collection(Edm.String)"/>
        <Property Name="Address" Type="shop.Address"/>
        <NavigationProperty Name="Orders" Type="Collection(shop.Order)"/>
      </EntityType>
      <EntityType Name="VipCustomer" BaseType="shop.Customer">
        <Property Name="Level" Type="Edm.Int32"/>
        <NavigationProperty Name="Agent" Type="shop.Customer"/>
      </EntityType>
      <EntityType Name="Order">
        <Key><PropertyRef Name="OrderID"/></Key>
        <Property Name="OrderID" Type="Edm.Int32" Nullable="false"/>
        <Property Name="OrderDate" Type="Edm.DateTimeOffset"/>
        <Property Name="Total" Type="Edm.Decimal"/>
        <Property Name="Status" Type="shop.Status"/>
        <NavigationProperty Name="Customer" Type="shop.Customer"/>
        <NavigationProperty Name="Items" Type="Collection(shop.Item)"/>
      </EntityType>
      <EntityType Name="Item">
        <Key><PropertyRef Name="OrderID"/><PropertyRef Name="Line"/></Key>
        <Property Name="OrderID" Type="Edm.Int32" Nullable="false"/>
        <Property Name="Line" Type="Edm.Int32" Nullable="false"/>
        <Property Name="Quantity" Type="Edm.Int32"/>
        <Property Name="Price" Type="Edm.Decimal"/>
        <NavigationProperty Name="Product" Type="shop.Product"/>
      </EntityType>
      <EntityType Name="Product" OpenType="true">
        <Key><PropertyRef Name="ID"/></Key>
        <Property Name="ID" Type="Edm.Int32" Nullable="false"/>
        <Property Name="Name" Type="Edm.String"/>
      </EntityType>
      <Function Name="Recent" IsBound="true">
        <Parameter Name="orders" Type="Collection(shop.Order)"/>
        <Parameter Name="days" Type="Edm.Int32"/>
        <ReturnType Type="Collection(shop.Order)"/>
      </Function>
      <Function Name="TopCustomers">
        <Parameter Name="count" Type="Edm.Int32"/>
        <ReturnType Type="Collection(shop.Customer)"/>
      </Function>
      <Action Name="Reset"/>
      <EntityContainer Name="Container">
        <EntitySet Name="Orders" EntityType="shop.Order"/>
        <EntitySet Name="Customers" EntityType="shop.Customer"/>
        <EntitySet Name="Items" EntityType="shop.Item"/>
        <EntitySet Name="Products" EntityType="shop.Product"/>
        <Singleton Name="Me" Type="shop.Customer"/>
        <FunctionImport Name="TopCustomers" Function="shop.TopCustomers" EntitySet="Customers"/>
        <ActionImport Name="Reset" Action="shop.Reset"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

suite("Semantic analysis", () => {
    let model: DataModel;

    suiteSetup(async () => {
        model = await digestMetadata(metadata);
    });

    function run(suffix: string): Analysis {
        const text = root + suffix;
        const { tree } = parseDocument(text);
        assert.ok(tree, `no tree for ${text}`);
        return analyze(tree!, text, { model, baseUrl: root, profileName: "Test" });
    }

    function messages(suffix: string): string[] {
        return run(suffix).diagnostics.map((d) => d.message);
    }

    const clean = [
        "Orders",
        "Orders(1)",
        "Orders(OrderID=1)",
        "Orders(1)/Customer",
        "Orders(1)/Customer/Address/City",
        "Orders(1)/Customer/Address/City/$value",
        "Orders(1)/Items(OrderID=1,Line=2)/Product",
        "Orders/$count",
        "Orders/$count?$filter=Total gt 5",
        "Orders(1)/Items/$count",
        "Orders(1)/Customer/$ref",
        "Me",
        "Me/Orders",
        "Me/Orders?$filter=Total gt 5",
        "Customers/shop.VipCustomer",
        "Customers(1)/shop.VipCustomer/Agent",
        "Customers/shop.VipCustomer?$filter=Level gt 1&$expand=Agent",
        "Orders/shop.Recent(days=3)",
        "Orders/shop.Recent(days=3)?$select=Total",
        "Orders/Recent(days=3)?$filter=Total gt 5",
        "TopCustomers(count=3)",
        "TopCustomers(count=3)?$select=Name&$expand=Orders",
        "Reset",
        "$metadata",
        "$batch",
        "$crossjoin(Orders,Customers)?$filter=Orders/Total gt 5",
        "",
        "Orders?$select=OrderID,Total,Customer,Items",
        "Orders?$select=*",
        "Orders?$select=Customer/Name",
        "Customers?$select=Address/City,Address/Street",
        "Customers?$select=shop.VipCustomer/Level",
        "Customers?$select=Orders($select=Total;$top=2)",
        "Orders?$expand=Customer",
        "Orders?$expand=Customer,Items",
        "Orders?$expand=*",
        "Orders?$expand=Customer/$ref",
        "Orders?$expand=Items/$count",
        "Orders?$expand=Customer($select=Name,Address)",
        "Orders?$expand=Customer($select=Name;$expand=Orders($select=Total;$filter=Total gt 5;$orderby=OrderDate desc;$top=1))",
        "Orders?$expand=Items($filter=Quantity gt 1 and Product/Name eq 'x';$expand=Product($select=Name))",
        "Orders?$expand=Customer/shop.VipCustomer/Agent($select=Name)",
        "Customers?$expand=Address/Country($select=Name)",
        "Customers?$expand=Orders($expand=Items($expand=Product;$levels=2))",
        "Orders?$filter=Total gt 5 and Customer/Name eq 'x'",
        "Orders?$filter=Customer/Address/City eq 'Berlin'",
        "Orders?$filter=Customer/Address/Country/Name eq 'Germany'",
        "Orders?$filter=Items/any(i: i/Quantity gt 1)",
        "Orders?$filter=Items/any(i: i/Quantity gt 1 and i/Product/Name eq 'x')",
        "Orders?$filter=Items/all(i: i/Price lt Total)",
        "Orders?$filter=Items/any()",
        "Orders?$filter=Items/$count gt 2",
        "Customers?$filter=Emails/any(e: endswith(e, '.com'))",
        "Customers?$filter=Orders/any(o: o/Items/any(i: i/Quantity gt o/Total))",
        "Customers?$filter=shop.VipCustomer/Level gt 1",
        "Customers?$filter=isof(shop.VipCustomer) or isof(Address, shop.Address)",
        "Customers?$filter=cast(ID, Edm.String) eq '1'",
        "Orders?$filter=Status has shop.Status'Open'",
        "Orders?$filter=contains(Customer/Name, 'a') and year(OrderDate) eq 2024",
        "Orders?$filter=$it/Total gt 5",
        "Orders?$filter=Customer/ID eq $root/Customers(1)/ID",
        "Orders?$filter=Total gt @min&@min=5",
        "Orders?$orderby=Customer/Name desc,Total",
        "Orders?$compute=Total mul 2 as Double&$filter=Double gt 5&$select=Double,Total&$orderby=Double",
        "Orders?$apply=filter(Total gt 5)/groupby((Customer/Name),aggregate(Total with sum as Sum,$count as Count))&$orderby=Sum desc&$filter=Count gt 1",
        "Orders?$apply=aggregate(Items(Price with max as MaxPrice))",
        "Orders?$apply=groupby((Customer/Address/City))/top(5)",
        "Orders?$apply=expand(Items,filter(Quantity gt 1))",
        "Orders?$top=5&$skip=1&$count=true&$search=blue&$format=json",
        // open types accept any property
        "Products?$select=Color&$filter=Size gt 5",
        "Orders?api-version=1&sap-client=100",
        "Orders?$filter=substring(Customer/Name, 1) eq 'a' and substring(Customer/Name, 1, 2) eq 'b'",
        "Orders?$filter=now() gt OrderDate and round(Total) eq 5 and isof(shop.Order)",
        "Orders?$expand=Items($top=1),Customer($top=1)&$top=1",
    ];
    for (const suffix of clean) {
        test(`no diagnostics: ${suffix}`, () => {
            assert.deepStrictEqual(messages(suffix), []);
        });
    }

    const flagged: Array<[string, string[]]> = [
        ["Nope", ["Resource path 'Nope' not found in the entity container of profile Test."]],
        ["Orders(1)/Nope", ["'Nope' not found on type 'shop.Order'."]],
        ["Orders(1)/Customer/Nope/Deeper", ["'Nope' not found on type 'shop.Customer'."]],
        ["Orders(Nope=1)", ["'Nope' is not a key property of type 'shop.Order'."]],
        ["Customers/shop.VipCustomer?$filter=Nope gt 1", ["Property 'Nope' not found on type 'shop.VipCustomer'."]],
        ["Customers?$filter=Level gt 1", ["Property 'Level' not found on type 'shop.Customer'."]],
        ["Orders?$select=Nope", ["Property 'Nope' not found on type 'shop.Order'."]],
        ["Orders?$select=Customer/Nope", ["Property 'Nope' not found on type 'shop.Customer'."]],
        ["Orders?$expand=Nope", ["Navigation property 'Nope' not found on type 'shop.Order'."]],
        // nothing is checked below what could not be resolved
        ["Orders?$expand=Product($select=Whatever)", ["Navigation property 'Product' not found on type 'shop.Order'."]],
        ["Orders?$expand=Total", ["'Total' is not a navigation property of type 'shop.Order'."]],
        ["Orders?$expand=Customer($select=Nope)", ["Property 'Nope' not found on type 'shop.Customer'."]],
        [
            "Orders?$expand=Customer($select=Name;$expand=Orders($select=Nope;$filter=Nada gt 5))",
            [
                "Property 'Nope' not found on type 'shop.Order'.",
                "Property 'Nada' not found on type 'shop.Order'.",
            ],
        ],
        ["Orders?$expand=Items($filter=Total gt 1)", ["Property 'Total' not found on type 'shop.Item'."]],
        ["Orders?$filter=Nope eq 1", ["Property 'Nope' not found on type 'shop.Order'."]],
        ["Orders?$filter=Customer/Nope eq 1", ["Property 'Nope' not found on type 'shop.Customer'."]],
        ["Orders?$filter=Items/any(i: i/Nope gt 1)", ["Property 'Nope' not found on type 'shop.Item'."]],
        ["Orders?$filter=Items/any(i: j/Quantity gt 1)", ["Property 'j' not found on type 'shop.Order'."]],
        ["Orders?$filter=Customer/any(c: c/Name eq 'x')", ["'any' can only be applied to a collection."]],
        ["Orders?$filter=nope(Total) eq 1", ["Unknown function 'nope'."]],
        ["Orders?$filter=contains(Nope, 'a')", ["Property 'Nope' not found on type 'shop.Order'."]],
        ["Orders?$filter=Total gt $root/Nope(1)/ID", ["Resource path 'Nope' not found in the entity container of profile Test."]],
        ["Orders?$orderby=Nope desc", ["Property 'Nope' not found on type 'shop.Order'."]],
        ["Orders?$compute=Nope mul 2 as Double", ["Property 'Nope' not found on type 'shop.Order'."]],
        ["Orders?$apply=groupby((Nope),aggregate(Nada with sum as Sum))", [
            "Property 'Nope' not found on type 'shop.Order'.",
            "Property 'Nada' not found on type 'shop.Order'.",
        ]],
        ["Orders?$whatever=1", ["Unknown system query option '$whatever'."]],
        ["Orders?$top=1&$top=2", ["System query option '$top' is given more than once."]],
        ["Orders?$expand=Items($top=1;$top=2)", ["System query option '$top' is given more than once."]],
        ["Orders?$filter=contains(Customer/Name)", ["Function 'contains' takes 2 arguments, got 1."]],
        ["Orders?$filter=substring(Customer/Name, 1, 2, 3) eq 'a'", ["Function 'substring' takes 2 or 3 arguments, got 4."]],
        ["Orders?$filter=year() eq 2024", ["Function 'year' takes 1 argument, got 0."]],
        ["Orders/$count?$filter=Nope gt 5", ["Property 'Nope' not found on type 'shop.Order'."]],
    ];
    for (const [suffix, expected] of flagged) {
        test(`diagnostics: ${suffix}`, () => {
            assert.deepStrictEqual(messages(suffix), expected);
        });
    }

    test("diagnostics point at the offending name", () => {
        const suffix = "Orders?$expand=Customer($select=Nope)";
        const [diagnostic] = run(suffix).diagnostics;
        const text = root + suffix;
        assert.strictEqual(
            text.slice(diagnostic.span.start.offset, diagnostic.span.end.offset),
            "Nope",
        );
    });

    test("still analyzes a query with a syntax error", () => {
        assert.deepStrictEqual(messages("Orders?$select=Nope&$filter=Total gt "), [
            "Property 'Nope' not found on type 'shop.Order'.",
        ]);
    });

    test("finds the resource path without a matching base URL", () => {
        const text = "https://elsewhere.example.com/a/b/Me/Orders?$filter=Nope eq 1";
        const { tree } = parseDocument(text);
        const analysis = analyze(tree!, text, { model, baseUrl: root });
        assert.deepStrictEqual(
            analysis.diagnostics.map((d) => d.message),
            ["Property 'Nope' not found on type 'shop.Order'."],
        );
    });

    test("reports nothing without a model", () => {
        const text = `${root}Nope?$filter=Nada eq 1&$expand=X($select=Y)`;
        const { tree } = parseDocument(text);
        assert.deepStrictEqual(analyze(tree!, text).diagnostics, []);
    });

    for (const file of ["northwind.edmx", "trippin.edmx", "odatav2.edmx"]) {
        test(`digests ${file} and analyzes a query against it`, async () => {
            const xml = fs.readFileSync(path.join(__dirname, "..", "testdata", file), "utf8");
            const digested = await digestMetadata(xml);
            const container = digested.getEntityContainer();
            const set = Object.values(container.entitySets)[0];
            const property = set.entityType.props[0].odataName;
            const text = `${root}${set.odataName}?$select=${property}&$filter=Nope eq 1`;
            const { tree } = parseDocument(text);
            const analysis = analyze(tree!, text, { model: digested, baseUrl: root });
            assert.deepStrictEqual(
                analysis.diagnostics.map((d) => d.code),
                ["unknown-property"],
            );
        });
    }
});
