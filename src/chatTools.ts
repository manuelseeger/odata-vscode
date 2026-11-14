import * as vscode from "vscode";
import { getConfig } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { Profile } from "./contracts/types";
import { Disposable } from "./provider";
import { requireTrustedWorkspace } from "./security";
import { getBaseUrl } from "./util";

export interface MetadataToolResult {
    baseUrl: string;
    version: string;
    metadata: string;
}

export interface OpenQueryInput {
    query: string;
}

export class GetMetadataTool implements vscode.LanguageModelTool<Record<string, never>> {
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

        const endpoint = new URL(profile.baseUrl);
        const result: MetadataToolResult = {
            baseUrl: getBaseUrl(endpoint.origin + endpoint.pathname),
            version: (await this.metadataService.getModel(profile)).getODataVersion(),
            metadata: this.metadataService.getFilteredMetadataXml(profile.metadata, getConfig()),
        };
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result)),
        ]);
    }
}

export class OpenQueryTool implements vscode.LanguageModelTool<OpenQueryInput> {
    constructor(private openQuery: (query: string) => Promise<unknown>) {}

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
                "odata_getMetadata",
                new GetMetadataTool(getProfile, metadataService),
            ),
            vscode.lm.registerTool("odata_openQuery", new OpenQueryTool(openQuery)),
        ];
    }
}
