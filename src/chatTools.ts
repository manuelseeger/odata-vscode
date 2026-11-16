import * as vscode from "vscode";
import { getConfig } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { Profile } from "./contracts/types";
import { Disposable } from "./provider";
import { requireTrustedWorkspace } from "./security";
import { getBaseUrl } from "./util";

function serviceRoot(profile: Profile): string {
    const endpoint = new URL(profile.baseUrl);
    return getBaseUrl(endpoint.origin + endpoint.pathname);
}

export interface OpenQueryInput {
    query: string;
}

export class GetSchemaTool implements vscode.LanguageModelTool<Record<string, never>> {
    constructor(
        private getProfile: () => Promise<Profile | undefined>,
        private metadataService: IMetadataModelService,
    ) {}

    async invoke(): Promise<vscode.LanguageModelToolResult> {
        requireTrustedWorkspace();
        const profile = await this.getProfile();
        if (!profile) {
            throw new Error(
                'No endpoint profile selected. Ask the user to run "OData: Select Endpoint Profile".',
            );
        }
        if (!profile.metadata || !this.metadataService.isMetadataXml(profile.metadata)) {
            throw new Error('No OData metadata loaded. Ask the user to run "OData: Get Metadata".');
        }

        const summary = this.metadataService.getSchemaSummary(
            profile.metadata,
            serviceRoot(profile),
        );
        const maximum = getConfig().chat.schema.maxTokens;
        if (summary.tokens > maximum) {
            throw new Error(
                `The compact OData schema has approximately ${summary.tokens} tokens. The current maximum is ${maximum}. Raise odata.chat.schema.maxTokens to at least ${summary.tokens} to share the whole schema. No schema was returned.`,
            );
        }
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(summary.yaml)]);
    }
}

export class OpenQueryTool implements vscode.LanguageModelTool<OpenQueryInput> {
    constructor(
        private getProfile: () => Promise<Profile | undefined>,
        private openQuery: (query: string) => Promise<unknown>,
    ) {}

    prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<OpenQueryInput>,
    ): vscode.PreparedToolInvocation {
        const message = new vscode.MarkdownString(
            "Open this query in an OData editor without running it.\n\n",
        ).appendCodeblock(options.input.query, "odata");
        return {
            invocationMessage: message,
            confirmationMessages: {
                title: "Open OData query",
                message,
            },
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<OpenQueryInput>,
    ): Promise<vscode.LanguageModelToolResult> {
        requireTrustedWorkspace();
        const profile = await this.getProfile();
        const query = options.input.query
            .trim()
            .replace(/^GET\s+/, "")
            .trim();
        let sameService = false;
        try {
            sameService =
                !!profile &&
                query.startsWith(serviceRoot(profile)) &&
                new URL(query).href.startsWith(serviceRoot(profile));
        } catch {}
        if (!sameService) {
            throw new Error(
                "The selected profile changed. Call odata_getSchema again before opening a query for the selected service.",
            );
        }
        await this.openQuery(options.input.query);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
                'The query was opened in an OData editor. It was not run. The user can run it with "OData: Run".',
            ),
        ]);
    }
}

export class ChatToolsProvider extends Disposable {
    public _id = "ChatToolsProvider";

    constructor(
        getProfile: () => Promise<Profile | undefined>,
        metadataService: IMetadataModelService,
        openQuery: (query: string) => Promise<unknown>,
    ) {
        super();
        this.subscriptions = [
            vscode.lm.registerTool(
                "odata_getSchema",
                new GetSchemaTool(getProfile, metadataService),
            ),
            vscode.lm.registerTool("odata_openQuery", new OpenQueryTool(getProfile, openQuery)),
        ];
    }
}
