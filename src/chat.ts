import * as vscode from "vscode";

import { APP_NAME, getConfig, globalStates, internalCommands } from "./configuration";
import { Profile } from "./contracts/types";
import { Disposable } from "./provider";
import { extractCodeBlocks, getBaseUrl } from "./util";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { approximateTokenCount } from "./tokenizer";

export class ChatParticipantProvider extends Disposable {
    public _id: string = "ChatParticipantProvider";
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
        private metadataService: IMetadataModelService,
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
            "odata.128x128.png",
        );
        this.subscriptions = [this.participant];
    }

    public chatHandler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
    ) => {
        const profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
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
        const cleanedXml = this.metadataService.getFilteredMetadataXml(text, getConfig());
        const dataModel = await this.metadataService.getModel(profile);

        const replacements: Record<string, string> = {
            metadata: cleanedXml,
            base: getBaseUrl(profile.baseUrl),
            version: dataModel.getODataVersion(),
        };

        // Build the prompt from metadata, base URL and OData Version
        const prompt = this.BASE_PROMPT.replaceAll(/{{(\w+)}}/g, (_, key) => {
            return replacements[key] || "";
        });

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];

        // add the message history, so that we can ask followup questions
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

        // check if the prompt is too long
        let tokenCount = 0;
        for (const m of messages) {
            tokenCount += approximateTokenCount(
                (m.content as unknown as vscode.LanguageModelTextPart[])[0].value,
            );
        }
        console.log(tokenCount);
        console.log(request.model.maxInputTokens);

        if (tokenCount > request.model.maxInputTokens) {
            stream.markdown(
                new vscode.MarkdownString("$(error) Prompt is too long, please shorten it.", true),
            );
            return;
        }

        let chatResponse: vscode.LanguageModelChatResponse;
        try {
            chatResponse = await request.model.sendRequest(messages, {}, token);
        } catch (e) {
            if (e instanceof vscode.LanguageModelError) {
                switch (e.code) {
                    case vscode.LanguageModelError.Blocked.name:
                    case vscode.LanguageModelError.NoPermissions.name:
                    case vscode.LanguageModelError.NotFound.name:
                    case "Unknown":
                        stream.markdown("Error: " + e + "\n" + "Please try again later.");
                        break;
                }
            } else {
                stream.markdown("Error: " + e + "\n" + "Please try again later.");
            }
            return;
        }

        const buffer = [];
        for await (const fragment of chatResponse.text) {
            stream.markdown(fragment);
            buffer.push(fragment);
            const codeBlocks = extractCodeBlocks(buffer.join(""));
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
}
