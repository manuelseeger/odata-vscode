import * as vscode from "vscode";

import { Tiktoken } from "tiktoken/lite";
import cl100kBase from "tiktoken/encoders/cl100k_base.json";

import { isMetadataXml, digestMetadata, getFilteredMetadataXml } from "./metadata";
import { getExtensionContext, hasProperty } from "./util";
import { Profile } from "./profiles";

const BASE_PROMPT = `You help generate OData queries from EDMX medadata. Keep usage of functions,lambdas or other advanced features to a minimum. Return query code as an \`\`\`odata code block and give a short explanation.

OData Version: {{version}}

Metadata: 
{{metadata}}

Use this Uri is a base for the generated queries: {{base}}

Examples, but use the properties from the metadata in your answers: 
{{base}}/RequestedEntities?$filter=Name eq 'John'
{{base}}/RequestedEntities?$select=Name, Age, ReferenceId
{{base}}/RequestedEntities?$expand=RelatedEntity&$filter=Name eq 'John'&$select=Name, Age, RelatedEntity/ParentId`;

// define a chat handler
export const chatHandler: vscode.ChatRequestHandler = async (
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
    const extensionContext = getExtensionContext();

    const profile = extensionContext.globalState.get<Profile>("selectedProfile");
    if (!profile) {
        vscode.window.showWarningMessage("No profile selected.");
        return;
    }

    const text = profile.metadata;
    if (!text || !isMetadataXml(text)) {
        vscode.window.showWarningMessage("No metadata document found, check and update profile");
        return;
    }

    const cleanedXml = getFilteredMetadataXml(text);
    const dataModel = await digestMetadata(cleanedXml);

    const replacements: Record<string, string> = {
        metadata: cleanedXml,
        base: profile.baseUrl,
        version: dataModel.getODataVersion(),
    };

    const prompt = BASE_PROMPT.replaceAll(/{{(\w+)}}/g, (_, key) => {
        return replacements[key] || "";
    });

    const tokens = encoding.encode(prompt);

    if (tokens.length > 64000) {
        vscode.window.showWarningMessage("Metadata file too large, please provide a smaller file.");
        return;
    }
    encoding.free();

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    const previousMessages = context.history.filter((h) => h instanceof vscode.ChatResponseTurn);
    // add the previous messages to the messages array
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
        const codeBlocks = extractCodeBlocks(buffer.join(""));
        if (codeBlocks.length === 1) {
            const query = codeBlocks[0].trim();

            stream.button({
                title: "Run",
                command: "odata.runAndOpenQuery",
                arguments: [query],
                tooltip: "Open and run the generated query and show results",
            });
            // clear buffer
            buffer.length = 0;
        }
    }
};

function extractCodeBlocks(response: string): string[] {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
    let match;
    const codeBlocks: string[] = [];

    while ((match = codeBlockRegex.exec(response)) !== null) {
        codeBlocks.push(match[1]); // Extracts the code inside the triple backticks
    }

    return codeBlocks;
}
