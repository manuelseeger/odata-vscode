import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { analyze } from "../../language/analyze";
import { completionContext } from "../../language/completion";
import { parseDocument } from "../../parser/parse";
import { Csdl, parseCsdl } from "../../schema";

/**
 * Queries against an extract of the metadata of SAP Cloud for Customer (c4codataapi), a
 * large OData V2 service: associations instead of typed navigation properties, function
 * imports with query string parameters, V2 literals and system query options.
 */
suite("SAP Cloud for Customer (OData V2)", () => {
    const root = "https://my000000.crm.ondemand.com/sap/c4c/odata/v1/c4codataapi/";
    const key = "'00163E0DBD9E1ED596F8F5E6B9B6B1A1'";
    let csdl: Csdl;

    suiteSetup(() => {
        const xml = fs.readFileSync(path.join(__dirname, "..", "testdata", "c4c.edmx"), "utf8");
        csdl = parseCsdl(xml);
    });

    function messages(query: string): string[] {
        const text = root + query;
        const result = parseDocument(text);
        assert.strictEqual(result.error, undefined, result.error?.message);
        return analyze(result.tree!, text, { csdl, baseUrl: root }).diagnostics.map((d) => d.message);
    }

    test("digests the metadata as OData V2", () => {
        assert.ok(!csdl.version.startsWith("4"), csdl.version);
        assert.ok(csdl.entitySets.some((set) => set.name === "OpportunityCollection"));
    });

    const clean = [
        "OpportunityCollection",
        "OpportunityCollection?$top=10&$skip=20&$inlinecount=allpages&$format=json",
        `OpportunityCollection(${key})`,
        `OpportunityCollection(ObjectID=${key})`,
        `OpportunityCollection(${key})/OpportunityItem`,
        `OpportunityCollection(${key})/OpportunityItem/$count`,
        `OpportunityCollection(${key})/Name/$value`,
        `OpportunityCollection(${key})/$links/OpportunityParty`,
        "OpportunityCollection/$count",
        "OpportunityCollection/$count?$filter=LifeCycleStatusCode eq '1'",
        `OpportunityItemCollection(${key})/Opportunity/OpportunityParty`,
        // literals of V2
        "OpportunityCollection?$filter=CreationDateTime ge datetimeoffset'2024-01-01T00:00:00Z'",
        "OpportunityCollection?$filter=ExpectedProcessingEndDate lt datetime'2024-12-31T00:00:00' and ExpectedProcessingStartDate ge datetime'2024-01-01T00:00:00'",
        "OpportunityCollection?$filter=UUID eq guid'00163e0d-bd9e-1ed5-96f8-f5e6b9b6b1a1'",
        "OpportunityCollection?$filter=ExpectedRevenueAmount gt 10000.00M and ProbabilityPercent ge 50m",
        "OpportunityCollection?$filter=HeaderRevenueSchedule eq true and SalesRevenueForecastRelevanceIndicator eq false",
        // functions of V2
        "OpportunityCollection?$filter=substringof('Cloud',Name)",
        "OpportunityCollection?$filter=substringof('Cloud',Name) eq true and startswith(ID,'12')",
        "CorporateAccountCollection?$filter=endswith(Name,'GmbH') or indexof(Name,'AG') gt 0",
        "CorporateAccountCollection?$filter=tolower(Name) eq 'sap se' and length(AccountID) eq 7",
        "ContactCollection?$filter=year(BirthDate) eq 1980 and month(BirthDate) eq 5",
        // expand and select along associations
        "OpportunityCollection?$expand=OpportunityItem",
        "OpportunityCollection?$expand=OpportunityItem,OpportunityParty,OpportunityTextCollection",
        "LeadCollection?$expand=LeadItem,LeadContact&$select=ID,Name,LeadItem/ProductID,LeadItem/Quantity",
        "OpportunityItemCollection?$expand=Opportunity/OpportunityParty&$select=ProductID,Opportunity/Name,Opportunity/OpportunityParty/PartyName",
        "ServiceRequestCollection?$expand=ServiceRequestItem&$filter=ServicePriorityCode eq '1'&$orderby=CreationDateTime desc,ID",
        "CorporateAccountCollection?$expand=CorporateAccountAddress,CorporateAccountHasContactPerson&$select=AccountID,Name,CorporateAccountAddress/City",
        // filters along a navigation to one
        "OpportunityItemCollection?$filter=Opportunity/LifeCycleStatusCode eq '1' and NetAmount gt 100m",
        "CorporateAccountAddressCollection?$filter=CorporateAccount/Name eq 'SAP' and CountryCode eq 'DE'",
        // function imports take their parameters as query options
        "CheckForDuplicates?FirstName='John'&LastName='Doe'&Email='john.doe@example.com'",
        "CheckForDuplicates?FirstName='John'&$select=ContactID,Name&$expand=Contact&$top=5",
        `Convert?ObjectID=${key}`,
        "LeadAssociateAccount?LeadID='4711'&AccountID='1000123'",
        // code lists behind value helps
        "OpportunityLifeCycleStatusCodeCollection",
        "OpportunityLifeCycleStatusCodeCollection?$filter=Code eq '1'&$select=Code,Description",
        // custom options of SAP services
        "OpportunityCollection?$top=1&sap-language=DE&sap-label=true",
        "$metadata",
        "$batch",
    ];
    for (const query of clean) {
        test(`no diagnostics: ${query}`, () => {
            assert.deepStrictEqual(messages(query), []);
        });
    }

    const flagged: Array<[string, string[]]> = [
        ["Opportunities", ["Resource path 'Opportunities' not found in the entity container."]],
        ["OpportunityCollection?$filter=CreatedOn ge datetime'2024-01-01T00:00:00'", ["Property 'CreatedOn' not found on type 'c4codata.Opportunity'."]],
        [`OpportunityCollection(${key})/Items`, ["'Items' not found on type 'c4codata.Opportunity'."]],
        [`OpportunityCollection(ID=${key})`, ["'ID' is not a key property of type 'c4codata.Opportunity'."]],
        ["OpportunityCollection?$expand=OpportunityItems", ["Navigation property 'OpportunityItems' not found on type 'c4codata.Opportunity'."]],
        ["OpportunityCollection?$expand=Name", ["'Name' is not a navigation property of type 'c4codata.Opportunity'."]],
        ["OpportunityItemCollection?$expand=Opportunity/OpportunityItems", ["Navigation property 'OpportunityItems' not found on type 'c4codata.Opportunity'."]],
        ["LeadCollection?$select=ID,LeadItem/ProductName,LeadItem/Price", ["Property 'Price' not found on type 'c4codata.LeadItem'."]],
        ["OpportunityItemCollection?$filter=Opportunity/Status eq '1'", ["Property 'Status' not found on type 'c4codata.Opportunity'."]],
        ["CheckForDuplicates?FirstName='John'&$select=ContactID,Nope", ["Property 'Nope' not found on type 'c4codata.ContactDuplicateCheckResult'."]],
        ["OpportunityCollection?$filter=substringof(Name) eq true", ["Function 'substringof' takes 2 arguments, got 1."]],
        ["OpportunityCollection?$orderby=CreatedAt desc", ["Property 'CreatedAt' not found on type 'c4codata.Opportunity'."]],
    ];
    for (const [query, expected] of flagged) {
        test(`diagnostics: ${query}`, () => {
            assert.deepStrictEqual(messages(query), expected);
        });
    }

    function labels(query: string): string[] {
        const text = root + query;
        return completionContext(text, text.length, { csdl, baseUrl: root }).entries.map((e) => e.label);
    }

    test("completes entity sets, code lists and function imports", () => {
        const resources = labels("");
        for (const name of ["OpportunityCollection", "OpportunityLifeCycleStatusCodeCollection", "CheckForDuplicates"]) {
            assert.ok(resources.includes(name), name);
        }
    });

    test("completes navigation properties in $expand paths", () => {
        assert.deepStrictEqual(labels("OpportunityCollection?$expand="), [
            "OpportunityItem",
            "OpportunityParty",
            "OpportunityTextCollection",
        ]);
        assert.deepStrictEqual(labels("OpportunityItemCollection?$expand=Opportunity/"), [
            "OpportunityItem",
            "OpportunityParty",
            "OpportunityTextCollection",
        ]);
    });

    test("completes properties along $select and $filter paths", () => {
        const item = labels("LeadCollection?$expand=LeadItem&$select=ID,LeadItem/");
        assert.ok(item.includes("ProductID") && item.includes("Quantity") && !item.includes("Company"));
        const opportunity = labels("OpportunityItemCollection?$filter=Opportunity/");
        assert.ok(opportunity.includes("LifeCycleStatusCode") && !opportunity.includes("ProductID"));
        const result = labels("CheckForDuplicates?FirstName='John'&$select=");
        assert.ok(result.includes("AccountName"));
    });

    test("analyzes a query quickly", () => {
        const text = `${root}OpportunityCollection?$expand=OpportunityItem,OpportunityParty&$filter=substringof('Cloud',Name) and ExpectedRevenueAmount gt 10000.00M&$select=ID,Name,OpportunityItem/ProductID&$orderby=CreationDateTime desc&$top=50&$inlinecount=allpages`;
        const start = Date.now();
        for (let i = 0; i < 50; i++) {
            const { tree } = parseDocument(text);
            analyze(tree!, text, { csdl, baseUrl: root });
        }
        assert.ok(Date.now() - start < 1000, `took ${Date.now() - start} ms`);
    });
});
