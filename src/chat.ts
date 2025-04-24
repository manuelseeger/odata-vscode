import * as vscode from "vscode";
import { renderPrompt } from "@vscode/prompt-tsx";
import { APP_NAME, getConfig, globalStates, internalCommands } from "./configuration";
import { Profile } from "./contracts/types";
import { Disposable } from "./provider";
import { extractCodeBlocks, getBaseUrl } from "./util";
import { IMetadataModelService } from "./contracts/IMetadataModelService";

import { BasePrompt } from "./prompts/base";
import { ITokenizer } from "./contracts/ITokenizer";

export class ChatParticipantProvider extends Disposable {
    public _id: string = "ChatParticipantProvider";

    private participant: vscode.ChatParticipant;
    constructor(
        private context: vscode.ExtensionContext,
        private metadataService: IMetadataModelService,
        private tokenizer: ITokenizer,
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
        // Use the internal command to get the selected profile with secrets
        const profile = await vscode.commands.executeCommand<Profile | undefined>(
            internalCommands.getSelectedProfileWithSecrets,
        );
        if (!profile) {
            vscode.window.showWarningMessage("No profile selected.");
            return;
        }

        if (!profile.metadata || !this.metadataService.isMetadataXml(profile.metadata)) {
            vscode.window.showWarningMessage(
                "No metadata document found, check and update profile",
            );
            return;
        }
        console.time("getFilteredMetadataXml");
        const cleanedXml = this.metadataService.getFilteredMetadataXml(
            profile.metadata,
            getConfig(),
        );
        console.timeEnd("getFilteredMetadataXml");
        const dataModel = await this.metadataService.getModel(profile);

        const tsx = await renderPrompt(
            BasePrompt,
            {
                base: getBaseUrl(profile.baseUrl),
                metadata: cleanedXml,
                version: dataModel.getODataVersion(),
                userPrompt: request.prompt,
                context: context,
            },
            { modelMaxPromptTokens: request.model.maxInputTokens },
            request.model,
        );

        // approximate token count and check if it exceeds the model's max input tokens
        let tokenCount = 0;
        for (const m of tsx.messages) {
            tokenCount += this.tokenizer.approximateTokenCount(
                m.content
                    .filter((part) => part instanceof vscode.LanguageModelTextPart)
                    .map((part: vscode.LanguageModelTextPart) => part.value)
                    .join(""),
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
            chatResponse = await request.model.sendRequest(tsx.messages, {}, token);
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
                    title: getConfig().disableRunner ? "Open" : "Run",
                    command: internalCommands.openAndRunQuery,
                    arguments: [query],
                    tooltip: `Open ${getConfig().disableRunner ? "" : "and run "}the generated query and show results`,
                });
                buffer.length = 0;
            }
        }
    };
}
