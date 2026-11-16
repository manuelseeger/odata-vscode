import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import * as vscode from "vscode";
import { DefaultCompletionItemProvider, MetadataCompletionItemProvider } from "../../completions";
import { Profile } from "../../contracts/types";
import { ODataDiagnosticProvider } from "../../diagnostics";
import { HoverProvider } from "../../hovers";
import { SyntaxParser } from "../../parser/syntaxparser";
import { MetadataModelService } from "../../services/MetadataModelService";
import { restoreWorkspaceConfiguration, setupTests } from "./testutil";
import * as v2 from "../../definitions/odataV2.json";
import * as v4 from "../../definitions/odataV4.json";
import baseline from "../testdata/schema-baseline.json";

const fixture = (name: string) => fs.readFileSync(
    path.resolve(__dirname, "../../../src/test/testdata", `${name}.edmx`), "utf8",
);
const { load } = createRequire(require.resolve("mocha"))("js-yaml");
const inheritedNames = ["ID", "URL_value", "related", "lower_name", "address", "nominal"];
interface QueryType {
    base?: string;
    props?: Record<string, string>;
    nav?: Record<string, string>;
}
interface QuerySchema {
    namespace: string;
    types: Record<string, QueryType>;
    sets: Record<string, string | { type: string }>;
    singletons?: Record<string, string | { type: string }>;
}

suite("Canonical metadata editor behavior", () => {
    let profile: Profile;
    let service: MetadataModelService;
    let completions: MetadataCompletionItemProvider;
    let defaults: DefaultCompletionItemProvider;
    let diagnostics: ODataDiagnosticProvider;
    let hovers: HoverProvider;

    setup(async () => {
        const setup = await setupTests();
        profile = setup.profile;
        profile.metadata = fixture("canonical/v4");
        service = new MetadataModelService();
        completions = new MetadataCompletionItemProvider(service, setup.context);
        defaults = new DefaultCompletionItemProvider(setup.context, service);
        diagnostics = new ODataDiagnosticProvider(service, setup.context);
        hovers = new HoverProvider(service, setup.context, { v2, v4 });
    });

    teardown(() => {
        completions.dispose();
        defaults.dispose();
        diagnostics.dispose();
        hovers.dispose();
        restoreWorkspaceConfiguration();
    });

    async function complete(relative: string, baseUrl = profile.baseUrl) {
        const document = await vscode.workspace.openTextDocument({ content: baseUrl + relative });
        return (await completions.provideCompletionItems(
            document, document.positionAt(document.getText().length), {} as vscode.CancellationToken,
        ))?.items ?? [];
    }

    async function warnings(relative: string) {
        const text = profile.baseUrl + relative;
        const document = await vscode.workspace.openTextDocument({ content: text });
        const result = new SyntaxParser().processText(text);
        assert.ok(result);
        await diagnostics.handleParseSucess(document.uri, result);
        return diagnostics.diagnostics.get(document.uri) ?? [];
    }

    async function hover(relative: string, word: string) {
        const text = profile.baseUrl + relative;
        const document = await vscode.workspace.openTextDocument({ content: text });
        const result = await hovers.provideHover(
            document, document.positionAt(text.indexOf(word) + 1), {} as vscode.CancellationToken,
        );
        assert.ok(result);
        return result.contents.map((part) => (part as vscode.MarkdownString).value).join("\n");
    }

    test("offers exact roots including singletons and actions", async () => {
        assert.deepStrictEqual((await complete("")).map((item) => item.label), [
            "under_score", "OtherItems", "current", "GetAddress", "Choose", "GetText", "GetItems", "ResetData",
        ]);
        assert.deepStrictEqual((await complete("current?$select=")).map((item) => item.label), inheritedNames);
        assert.deepStrictEqual(await warnings("ResetData"), []);
    });

    test("keeps namespace identity and declared EDM types in completion documentation", async () => {
        const items = await complete("under_score?$select=");
        assert.deepStrictEqual(items.map((item) => item.label), inheritedNames);
        const docs = items.map((item) => (item.documentation as vscode.MarkdownString).value);
        assert.ok(docs.includes("**Name**: related\n\n**Type**: Collection(B.Item)"));
        assert.ok(docs.includes("**Name**: nominal\n\n**Type**: A.Code"));
        assert.deepStrictEqual((await complete("OtherItems?$select=")).map((item) => item.label), ["OnlyB"]);
        assert.deepStrictEqual(await warnings("under_score?$select=ID,URL_value,lower_name,nominal"), []);
        const wrongCase = await warnings("under_score?$select=Lower_name");
        assert.strictEqual(wrongCase.length, 1);
        assert.match(wrongCase[0].message, /Lower_name/);
    });

    test("traverses inherited complex and navigation members without conflating expand", async () => {
        assert.deepStrictEqual((await complete("under_score?$select=address/")).map((item) => item.label), ["ZIP_code", "city"]);
        assert.deepStrictEqual((await complete("under_score?$select=related/")).map((item) => item.label), ["OnlyB"]);
        assert.deepStrictEqual((await complete("under_score?$expand=")).map((item) => item.label), ["related"]);
        assert.deepStrictEqual(await warnings("under_score?$select=address/ZIP_code,related/OnlyB"), []);
        assert.deepStrictEqual(await warnings("under_score?$filter=address/city eq 'X'"), []);
        assert.deepStrictEqual(await warnings("under_score?$expand=related"), []);
        const invalid = await warnings("under_score?$expand=address");
        assert.strictEqual(invalid.length, 1);
        assert.match(invalid[0].message, /navigational property address/);
        const missing = await warnings("under_score?$select=address/Unknown");
        assert.strictEqual(missing.length, 1);
        assert.strictEqual(missing[0].range.start.character, (profile.baseUrl + "under_score?$select=address/").length);
    });

    test("uses function return types without EntitySet and skips ambiguous overload warnings", async () => {
        assert.deepStrictEqual((await complete("GetAddress?$select=")).map((item) => item.label), ["ZIP_code", "city"]);
        assert.deepStrictEqual((await complete("GetItems?$select=")).map((item) => item.label), inheritedNames);
        assert.deepStrictEqual(await complete("Choose?$select="), []);
        assert.deepStrictEqual(await complete("GetText?$select="), []);
        assert.deepStrictEqual(await warnings("GetAddress?$select=ZIP_code,city"), []);
        assert.deepStrictEqual(await warnings("Choose?$select=Unknown"), []);
    });

    test("keeps resource matching independent of the profile URL and avoids root members on nested paths", async () => {
        const sessionRoot = "https://example.com/(S(abc))/odata/";
        assert.deepStrictEqual((await complete("under_score?$select=", sessionRoot)).map((item) => item.label), inheritedNames);
        for (const path of ["under_score(1)/related", "under_score(1)/address"]) {
            const labels = (await complete(`${path}?$select=`)).map((item) => item.label);
            assert.ok(!labels.includes("lower_name"));
            assert.ok(!labels.includes("OnlyB"));
        }
        const keyed = await warnings("under_score(1)?$select=Unknown");
        assert.strictEqual(keyed.length, 1);
        assert.match(keyed[0].message, /Resource path 'under_score\(1\)' not found/);
    });

    test("shows canonical qualified hover types, inherited members, and bindings", async () => {
        const text = await hover("under_score?$select=ID", "under_score");
        assert.match(text, /\*\*Entity Type\*\*: A.Item/);
        assert.match(text, /URL_value \(Edm.String\)/);
        assert.match(text, /related \(Collection\(B.Item\)\)/);
        assert.match(text, /related -> OtherItems/);
        assert.doesNotMatch(text, /OnlyB/);
    });

    test("retains V2 association members and non-GET roots only in the editor", async () => {
        profile.metadata = fixture("canonical/v2");
        assert.deepStrictEqual((await complete("")).map((item) => item.label), ["Orders", "Lines", "ReadOrders", "WriteOrders", "Unspecified"]);
        const items = await complete("Orders?$select=");
        assert.deepStrictEqual(items.map((item) => (item.documentation as vscode.MarkdownString).value), [
            "**Name**: Date\n\n**Type**: Edm.DateTime",
            "**Name**: Time\n\n**Type**: Edm.Time",
            "**Name**: Value\n\n**Type**: Edm.Float",
            "**Name**: Lines\n\n**Type**: Collection(Legacy.Line)",
        ]);
        assert.deepStrictEqual((await complete("Orders?$select=Lines/")).map((item) => item.label), ["SKU", "Order"]);
        assert.deepStrictEqual(await warnings("Orders?$select=Date,Lines/SKU"), []);
        assert.deepStrictEqual(await warnings("WriteOrders?$select=value"), []);
        assert.deepStrictEqual(await warnings("Unspecified"), []);
        assert.doesNotMatch(service.getSchemaSummary(profile.metadata, profile.baseUrl).yaml, /WriteOrders|Unspecified|WriteOnly/);
    });

    test("reflects metadata edits at the same root in completions, diagnostics, hover, and summary", async () => {
        await complete("under_score?$select=");
        service.getSchemaSummary(profile.metadata!, profile.baseUrl);
        profile.metadata = profile.metadata!.replace("lower_name", "new_name");
        const labels = (await complete("under_score?$select=")).map((item) => item.label);
        assert.ok(labels.includes("new_name"));
        assert.ok(!labels.includes("lower_name"));
        assert.deepStrictEqual(await warnings("under_score?$select=new_name"), []);
        assert.strictEqual((await warnings("under_score?$select=lower_name")).length, 1);
        assert.match(await hover("under_score", "under_score"), /new_name \(Edm.String\)/);
        assert.match(service.getSchemaSummary(profile.metadata, profile.baseUrl).yaml, /new_name/);
    });

    test("keeps static completion and profile hover fallbacks without usable metadata", async () => {
        const cycle = profile.metadata!.replace('BaseType="a.Base"', 'BaseType="a.Item"');
        for (const metadata of [undefined, "<invalid />", cycle]) {
            profile.metadata = metadata;
            assert.deepStrictEqual(await complete("under_score?$select="), []);
            assert.deepStrictEqual(await warnings("under_score?$select=Unknown"), []);
            assert.match(await hover("under_score", "under_score"), /\*\*Selected Profile\*\*: TestProfile/);
            const document = await vscode.workspace.openTextDocument({ content: "$filter= " });
            const result = await defaults.provideCompletionItems(
                document, new vscode.Position(0, 9), {} as vscode.CancellationToken, {} as vscode.CompletionContext,
            );
            assert.ok(result?.items.some((item) => item.label === "substringof"));
        }
    });

    test("uses V4 static completions for version 4.01", async () => {
        const document = await vscode.workspace.openTextDocument({ content: "$filter= " });
        const result = await defaults.provideCompletionItems(
            document, new vscode.Position(0, 9), {} as vscode.CancellationToken, {} as vscode.CompletionContext,
        );
        assert.ok(result?.items.some((item) => item.label === "contains"));
    });

    test("does not merge ambiguous roots from different containers", async () => {
        profile.metadata = profile.metadata!.replace(
            '</Schema>\n    <Schema Namespace="B"',
            '<EntityContainer Name="Other"><EntitySet Name="under_score" EntityType="B.Item" /></EntityContainer></Schema>\n    <Schema Namespace="B"',
        );
        assert.deepStrictEqual(await warnings("under_score?$select=Unknown"), []);
        assert.doesNotMatch(await hover("under_score", "under_score"), /\*\*Entity Type\*\*/);
        assert.ok(!(await complete("under_score?$select=")).some((item) => item.label === "OnlyB"));
    });

    for (const file of Object.keys(baseline.sha256)) {
        test(`${file} editor names and types agree with the compact query schema`, async () => {
            profile.metadata = fixture(file.replace(/\.edmx$/, ""));
            const yaml = load(service.getSchemaSummary(profile.metadata, profile.baseUrl).yaml) as QuerySchema;
            const qualify = (name: string) => name.includes(".") ? name : `${yaml.namespace}.${name}`;
            const typeByName = new Map(Object.entries(yaml.types).map(([name, type]) => [qualify(name), type]));
            const fields = (qname: string): [string, string][] => {
                const type = typeByName.get(qname);
                assert.ok(type);
                return [
                    ...(type.base ? fields(qualify(type.base)) : []),
                    ...Object.entries<string>(type.props ?? {}),
                    ...Object.entries<string>(type.nav ?? {}),
                ];
            };
            const rootItems = (await complete("")).map((item) => item.label);
            for (const [name, value] of Object.entries({ ...yaml.sets, ...yaml.singletons })) {
                assert.ok(rootItems.includes(name), name);
                const type = qualify(typeof value === "string" ? value : value.type);
                const expected = fields(type).map(([name, ref]) => {
                    const value = ref.replace(/ contained$/, "").replace(/\?$/, "");
                    const qname = qualify(value.replace(/\[\]$/, ""));
                    const type = value.endsWith("[]") ? `Collection(${qname})` : qname;
                    return `**Name**: ${name}\n\n**Type**: ${type}`;
                });
                const items = await complete(`${name}?$select=`);
                assert.deepStrictEqual(items.map((item) => (item.documentation as vscode.MarkdownString).value), expected, name);
            }
            if (file === "trippin.edmx") {
                assert.ok(rootItems.includes("ResetDataSource"));
                assert.deepStrictEqual(await warnings("ResetDataSource"), []);
            }
        });
    }
});
