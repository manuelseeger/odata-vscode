import * as vscode from "vscode";

import cl100kBase from "tiktoken/encoders/cl100k_base.json";
import { Tiktoken } from "tiktoken/lite";

import { APP_NAME, internalCommands } from "./configuration";
import { Profile } from "./profiles";
import { MetadataModelService } from "./services/MetadataModelService";
import { Disposable } from "./util";

export class ChatParticipantProvider extends Disposable {
    private readonly BASE_PROMPT = `You help generate OData queries from EDMX medadata. Keep usage of functions,lambdas or other advanced features to a minimum. Return query code as an \`\`\`odata \`\`\` code block and give a short explanation.

OData Version: {{version}}

Metadata: 
{{metadata}}

Use this Uri is a base for the generated queries: {{base}}

Examples, but use the properties from the metadata in your answers: 
{{base}}/RequestedEntities?$filter=Name eq 'John'
{{base}}/RequestedEntities?$select=Name, Age, ReferenceId
{{base}}/RequestedEntities?$expand=RelatedEntity&$filter=Name eq 'John'&$select=Name, Age, RelatedEntity/ParentId`;

    private participant: vscode.ChatParticipant;
    constructor(
        private context: vscode.ExtensionContext,
        private metadataService: MetadataModelService,
    ) {
        super();
        this.participant = vscode.chat.createChatParticipant(
            `${APP_NAME}.odata-chat`,
            this.chatHandler,
        );

        // add icon to participant
        this.participant.iconPath = vscode.Uri.joinPath(
            context.extensionUri,
            "assets",
            "icon-odata.png",
        );
        this.subscriptions = [this.participant];
    }

    public chatHandler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
    ) => {
        const encoding = new Tiktoken(
            cl100kBase.bpe_ranks,
            cl100kBase.special_tokens,
            cl100kBase.pat_str,
        );

        const profile = this.context.globalState.get<Profile>("selectedProfile");
        if (!profile) {
            vscode.window.showWarningMessage("No profile selected.");
            return;
        }

        const text = profile.metadata;
        if (!text || !this.metadataService.isMetadataXml(text)) {
            vscode.window.showWarningMessage(
                "No metadata document found, check and update profile",
            );
            return;
        }
        const cleanedXml = this.metadataService.getFilteredMetadataXml(text);
        const dataModel = await this.metadataService.getModel(profile);

        const replacements: Record<string, string> = {
            metadata: cleanedXml,
            base: profile.baseUrl,
            version: dataModel.getODataVersion(),
        };

        // Build the prompt from metadata, base URL and OData Version
        const prompt = this.BASE_PROMPT.replaceAll(/{{(\w+)}}/g, (_, key) => {
            return replacements[key] || "";
        });

        // Github Copilot Chat has an input limit of 64000 tokens
        const tokens = encoding.encode(prompt);
        if (tokens.length > 64000) {
            vscode.window.showWarningMessage(
                "Metadata file too large, please provide a smaller file.",
            );
            return;
        }
        encoding.free();

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];

        // add the message history
        const previousMessages = context.history.filter(
            (h) => h instanceof vscode.ChatResponseTurn,
        );
        previousMessages.forEach((m) => {
            let fullMessage = "";
            m.response.forEach((r) => {
                const mdPart = r as vscode.ChatResponseMarkdownPart;
                fullMessage += mdPart.value.value;
            });
            messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
        });
        messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

        const chatResponse = await request.model.sendRequest(messages, {}, token);

        const buffer = [];
        for await (const fragment of chatResponse.text) {
            stream.markdown(fragment);
            buffer.push(fragment);
            const codeBlocks = this.extractCodeBlocks(buffer.join(""));
            if (codeBlocks.length === 1) {
                const query = codeBlocks[0].trim();

                stream.button({
                    title: "Run",
                    command: internalCommands.openAndRunQuery,
                    arguments: [query],
                    tooltip: "Open and run the generated query and show results",
                });
                buffer.length = 0;
            }
        }
    };

    private extractCodeBlocks(response: string): string[] {
        const codeBlockRegex = /```odata(?:\w+)?\n([\s\S]*?)\n```/g;
        let match;
        const codeBlocks: string[] = [];

        while ((match = codeBlockRegex.exec(response)) !== null) {
            codeBlocks.push(match[1]); // Extracts the code inside the triple backticks
        }

        return codeBlocks;
    }
}
