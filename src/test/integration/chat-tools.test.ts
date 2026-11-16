import * as assert from "assert";
import { readFile } from "fs/promises";
import { createServer } from "http";
import { AddressInfo } from "net";
import * as path from "path";
import * as vscode from "vscode";
import { GetSchemaTool, OpenQueryTool } from "../../chatTools";
import { Tokenizer } from "../../services/Tokenizer";
import { CommandProvider } from "../../commands";
import { globalStates } from "../../configuration";
import { AuthKind, Profile } from "../../contracts/types";
import { VSCodeFileReader } from "../../provider";
import { MetadataModelService } from "../../services/MetadataModelService";
import { QueryRunner } from "../../services/QueryRunner";
import { combineODataUrl } from "../../util";
import { restoreWorkspaceConfiguration } from "./testutil";

function resultText(result: vscode.LanguageModelToolResult): string {
    assert.strictEqual(result.content.length, 1);
    const part = result.content[0];
    assert.ok(part instanceof vscode.LanguageModelTextPart);
    return part.value;
}

async function fixture(name: string): Promise<string> {
    return readFile(path.resolve(__dirname, "../../../src/test/testdata", name), "utf8");
}

function profile(metadata?: string): Profile {
    return {
        name: "Private profile name",
        baseUrl:
            "https://url-user:url-password@example.test/service/$metadata?secret=query-secret#fragment-secret",
        metadata,
        auth: { kind: AuthKind.Bearer, token: "bearer-secret", password: "auth-secret" },
        headers: { "X-Private": "header-secret" },
    };
}

suite("OData language model tools", () => {
    suiteSetup(async () => {
        restoreWorkspaceConfiguration();
        const extension = vscode.extensions.getExtension("manuelseeger.odata");
        assert.ok(extension);
        await extension.activate();
    });

    test("lists the contributed tools and observes setting availability", async () => {
        const config = vscode.workspace.getConfiguration("odata");
        const original = config.inspect<boolean>("chat.tools.enabled")?.globalValue;
        const names = () =>
            vscode.lm.tools.map((tool) => tool.name).filter((name) => name.startsWith("odata_"));
        try {
            await config.update("chat.tools.enabled", false, vscode.ConfigurationTarget.Global);
            const disabled = names();
            await config.update("chat.tools.enabled", true, vscode.ConfigurationTarget.Global);
            const enabled = names();
            console.log(`OData lm.tools availability ${JSON.stringify({ disabled, enabled })}`);
            assert.ok(enabled.includes("odata_getSchema"));
            assert.ok(enabled.includes("odata_openQuery"));
        } finally {
            await config.update("chat.tools.enabled", original, vscode.ConfigurationTarget.Global);
        }
    });

    test("reports how to select a missing profile", async () => {
        const tool = new GetSchemaTool(async () => undefined, new MetadataModelService());
        await assert.rejects(() => tool.invoke(), /OData: Select Endpoint Profile/);
    });

    for (const metadata of [undefined, "not metadata"]) {
        test(`reports how to load missing or invalid metadata (${metadata})`, async () => {
            const tool = new GetSchemaTool(
                async () => profile(metadata),
                new MetadataModelService(),
            );
            await assert.rejects(() => tool.invoke(), /OData: Get Metadata/);
        });
    }

    for (const [file, version, entity] of [
        ["trippin.edmx", "4.0", "Person"],
        ["odatav2.edmx", "2.0", "Product"],
    ]) {
        test(`returns safe service context and compact ${version} YAML schema`, async () => {
            const tool = new GetSchemaTool(
                async () => profile(await fixture(file)),
                new MetadataModelService(),
            );
            const text = resultText(await tool.invoke());
            assert.ok(text.includes('root: "https://example.test/service/"'));
            assert.ok(text.includes(`version: "${version}"`));
            assert.ok(text.includes(`  ${entity}:\n`));
            assert.doesNotMatch(text, /<Annotation|<EntityType/);
            for (const secret of [
                "Private profile name",
                "url-user",
                "url-password",
                "query-secret",
                "fragment-secret",
                "bearer-secret",
                "auth-secret",
                "X-Private",
                "header-secret",
            ]) {
                assert.ok(!text.includes(secret), `Tool result must not disclose ${secret}`);
            }
        });
    }

    test("returns no schema over the default maximum and the whole schema after raising it", async () => {
        const config = vscode.workspace.getConfiguration("odata");
        const key = "chat.schema.maxTokens";
        const original = config.inspect<number>(key)?.globalValue;
        const service = new MetadataModelService();
        const tool = new GetSchemaTool(async () => profile(await fixture("msgraph.edmx")), service);
        try {
            await config.update(key, undefined, vscode.ConfigurationTarget.Global);
            await assert.rejects(
                () => tool.invoke(),
                (error: Error) => {
                    assert.match(error.message, /approximately \d+ tokens/);
                    assert.match(error.message, /maximum is 32000/);
                    assert.match(error.message, /odata.chat.schema.maxTokens/);
                    assert.match(error.message, /No schema was returned/);
                    assert.doesNotMatch(error.message, /sets:|types:|<Schema|microsoft.graph/);
                    return true;
                },
            );
            await config.update(key, 1000000, vscode.ConfigurationTarget.Global);
            const whole = resultText(await tool.invoke());
            assert.match(whole, /namespace: microsoft.graph/);
            assert.match(whole, /getPstnCalls/);
            const tokens = new Tokenizer().approximateTokenCount(whole);
            assert.ok(tokens > 32000);
            assert.ok(whole.endsWith("\n"));
            await config.update(key, tokens - 1, vscode.ConfigurationTarget.Global);
            await assert.rejects(
                () => tool.invoke(),
                new RegExp(`approximately ${tokens} tokens.*maximum is ${tokens - 1}`),
            );
            await config.update(key, tokens, vscode.ConfigurationTarget.Global);
            assert.strictEqual(resultText(await tool.invoke()), whole);
        } finally {
            await config.update(key, original, vscode.ConfigurationTarget.Global);
        }
    });

    test("ignores existing retired filter settings", async () => {
        await vscode.commands.executeCommand("workbench.action.openSettingsJson");
        const document = vscode.window.activeTextEditor!.document;
        const original = document.getText();
        const values = {
            "odata.metadata.filterNs": ["http://docs.oasis-open.org/odata/ns/edm"],
            "odata.metadata.filterXPath": ["//edm:EntityType"],
            "odata.metadata.xpathDefaultNsPrefix": "old",
        };
        async function save(text: string) {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
                new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length),
                ),
                text,
            );
            assert.ok(await vscode.workspace.applyEdit(edit));
            assert.ok(await document.save());
        }
        try {
            const entries = Object.entries(values)
                .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
                .join(",\n");
            await save(original.replace("{", `{\n${entries},\n`));
            for (
                let attempt = 0;
                attempt < 100 &&
                vscode.workspace.getConfiguration("odata").get("metadata.xpathDefaultNsPrefix") !==
                    "old";
                attempt++
            ) {
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            assert.strictEqual(
                vscode.workspace.getConfiguration("odata").get("metadata.xpathDefaultNsPrefix"),
                "old",
            );
            const tool = new GetSchemaTool(
                async () => profile(await fixture("trippin.edmx")),
                new MetadataModelService(),
            );
            const text = resultText(await tool.invoke());
            assert.match(text, /Person:/);
            assert.match(text, /Flight:/);
        } finally {
            await save(original);
        }
    });

    test("requires trust before profile access or opening an editor", async () => {
        const descriptor = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted")!;
        const metadata = new GetSchemaTool(async () => {
            assert.fail("Untrusted tools must not read a profile");
        }, new MetadataModelService());
        const open = new OpenQueryTool(
            async () => {
                assert.fail("Untrusted tools must not read a profile");
            },
            async () => {
                assert.fail("Untrusted tools must not open a query");
            },
        );
        Object.defineProperty(vscode.workspace, "isTrusted", {
            configurable: true,
            get: () => false,
        });
        try {
            await assert.rejects(() => metadata.invoke(), /Trust this workspace/);
            await assert.rejects(
                () =>
                    open.invoke({
                        input: { query: "https://example.test/" },
                        toolInvocationToken: undefined,
                    }),
                /Trust this workspace/,
            );
        } finally {
            Object.defineProperty(vscode.workspace, "isTrusted", descriptor);
        }
    });

    for (const query of [
        "https://other.test/service/Orders",
        "https://example.test/service-other/Orders",
        "https://example.test/service/../foreign/Orders",
    ]) {
        test(`refuses a foreign service root ${query}`, async () => {
            const tool = new OpenQueryTool(
                async () => profile(),
                async () => assert.fail("Must not open a foreign query"),
            );
            await assert.rejects(
                () => tool.invoke({ input: { query }, toolInvocationToken: undefined }),
                /selected profile changed.*odata_getSchema/,
            );
        });
    }

    test("shows the exact query in confirmation without opening it", () => {
        const tool = new OpenQueryTool(
            async () => {
                assert.fail("Preparation must not read a profile");
            },
            async () => assert.fail("Preparation must have no side effects"),
        );
        const query = "GET https://example.test/service/People?$select=FirstName";
        const prepared = tool.prepareInvocation({ input: { query } });
        assert.ok(prepared.invocationMessage instanceof vscode.MarkdownString);
        assert.ok(prepared.confirmationMessages?.message instanceof vscode.MarkdownString);
        for (const message of [prepared.invocationMessage, prepared.confirmationMessages.message]) {
            assert.ok(message.value.includes("```odata\n" + query + "\n```"));
        }
    });

    test("opens a stripped query without HTTP or results until the user runs it", async () => {
        let requests = 0;
        const server = createServer((_request, response) => {
            requests++;
            response.setHeader("Content-Type", "application/json");
            response.end('{"value":[]}');
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/odata/`;
        const selected: Profile = {
            name: "Local test",
            baseUrl,
            auth: { kind: AuthKind.None },
            headers: {},
        };
        const context = {
            globalState: {
                get: (key: string) => (key === globalStates.selectedProfile ? selected : undefined),
            },
        } as unknown as vscode.ExtensionContext;
        const commands = new CommandProvider(
            context,
            new QueryRunner(new VSCodeFileReader()),
            async () => selected,
            false,
        );
        const tool = new OpenQueryTool(
            async () => selected,
            (query) => commands.openQuery(query),
        );
        const query = `${baseUrl}Orders?$top=1`;
        try {
            const result = await tool.invoke({
                input: { query: `  GET ${query}  ` },
                toolInvocationToken: undefined,
            });
            const editor = vscode.window.activeTextEditor;
            assert.ok(editor);
            assert.strictEqual(editor.document.languageId, "odata");
            assert.strictEqual(combineODataUrl(editor.document.getText()), query);
            assert.strictEqual(requests, 0);
            const resultBeforeRun = commands.resultDocument;
            assert.strictEqual(resultBeforeRun, undefined);
            assert.match(resultText(result), /opened/);
            assert.match(resultText(result), /not run/);
            assert.match(resultText(result), /OData: Run/);

            await commands.runEditorQuery();
            assert.strictEqual(requests, 1);
            assert.ok(commands.resultDocument);
            assert.deepStrictEqual(JSON.parse(commands.resultDocument.getText()), { value: [] });
        } finally {
            commands.dispose();
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            );
        }
    });
});
