import * as vscode from 'vscode';

import { Tiktoken } from "tiktoken/lite";
import cl100kBase from "tiktoken/encoders/cl100k_base.json";

import { digestMetadata, getFilteredMetadataXml } from './metadata';

const BASE_PROMPT = `You help generate OData queries from EDMX medadata. Keep usage of functions,lambdas or other advanced features to a minimum.

OData Version: {{version}}

Metadata: 
{{metadata}}

Use this is a base for the generated queries: {{base}}

Examples, but use the properties from the metadata in your answers: 
{{base}}/RequestedEntities?$filter=Name eq 'John'
{{base}}/RequestedEntities?$select=Name, Age, ReferenceId
{{base}}/RequestedEntities?$expand=RelatedEntity&$filter=Name eq 'John'&$select=Name, Age, RelatedEntity/ParentId`;

// define a chat handler
export const chatHandler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
) => {

    const encoding = new Tiktoken(
        cl100kBase.bpe_ranks,
        cl100kBase.special_tokens,
        cl100kBase.pat_str
    );

    const editor = vscode.window.activeTextEditor;

    if (editor) {
        const document = editor.document;
        const text = document.getText();

        const cleanedXml = getFilteredMetadataXml(text);

        const dataModel = await digestMetadata(cleanedXml);

        const replacements: Record<string, string> = {
            metadata: cleanedXml,
            base: "/customer",
            version: dataModel.getODataVersion()
        };

        const prompt = BASE_PROMPT.replaceAll(/{{(\w+)}}/g, (_, key) => {
            return replacements[key] || "";
        });

        const tokens = encoding.encode(prompt);
        console.log(`Prompt tokens: ${tokens.length}`);
        encoding.free();

        // initialize the messages array with the prompt
        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        // get all the previous participant messages
        const previousMessages = context.history.filter(
            h => h instanceof vscode.ChatResponseTurn
        );
        // add the previous messages to the messages array
        previousMessages.forEach(m => {
            let fullMessage = '';
            m.response.forEach(r => {
                const mdPart = r as vscode.ChatResponseMarkdownPart;
                fullMessage += mdPart.value.value;
            });
            messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
        });

        // add in the user's message
        messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

        // send the request
        const chatResponse = await request.model.sendRequest(messages, {}, token);

        // stream the response
        for await (const fragment of chatResponse.text) {
            stream.markdown(fragment);
        }

    } else {
        vscode.window.showWarningMessage('No active editor detected.');
        return;
    }
};
