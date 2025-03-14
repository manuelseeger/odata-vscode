import * as vscode from 'vscode';

import { Tiktoken } from "tiktoken/lite";
import cl100kBase from "tiktoken/encoders/cl100k_base.json";

import { isMetadataXml, digestMetadata, getFilteredMetadataXml } from './metadata';
import { getExtensionContext, hasProperty } from './util';
import { Profile } from './profiles';

const BASE_PROMPT = `You help generate OData queries from EDMX medadata. Keep usage of functions,lambdas or other advanced features to a minimum. Return query code as an \`\`\`odata code block and give a short explanation.

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
    const metadataDocuments: string[] = [];

    const extensionContext = getExtensionContext();

    const profile = extensionContext.globalState.get<Profile>("selectedProfile");
    if (!profile) {
        vscode.window.showWarningMessage('No profile selected.');
        return;
    }
    /*
    const metadata = extensionContext.globalState.get<string>("selectedMetadata");
    if (metadata) {
        metadataDocuments.push(metadata);
    }
    
    const metadataReferences = request.references.map(async (ref) => {
        let uri: vscode.Uri | undefined;
        if (ref.value instanceof vscode.Uri) {
            uri = ref.value;
        } else if (hasProperty(ref.value, "uri")) {
            uri = (ref.value as { uri: vscode.Uri }).uri;
        }
        if (!uri || uri.scheme !== "file") {
            return;
        }
        const text = await vscode.workspace.fs.readFile(uri);
        if (isMetadataXml(text.toString())) {
            return text.toString();
        }
    });
    
    (await Promise.all(metadataReferences))
        .filter((metadataReference) => {
            return metadataReference !== undefined;
        })
        .map((metadataReference) => metadataDocuments.push(metadataReference as string));
    
    if (metadataDocuments.length === 0) {
        const editor = vscode.window.activeTextEditor;
    
        if (editor) {
            const document = editor.document;
            const text = document.getText();
            if (isMetadataXml(text)) {
                metadataDocuments.push(text);
            }
        }
    }
    
    
    if (metadataDocuments.length === 0) {
        vscode.window.showWarningMessage('No metadata document found, provide as context or open in editor.');
        return;
    }
    
    const text = metadataDocuments[0];
    */

    const text = profile.metadata;
    if (!text || !isMetadataXml(text)) {
        vscode.window.showWarningMessage('No metadata document found, provide as context or open in editor.');
        return;
    }

    const cleanedXml = getFilteredMetadataXml(text);

    const dataModel = await digestMetadata(cleanedXml);

    const namespaces = dataModel.getNamespaces();

    const replacements: Record<string, string> = {
        metadata: cleanedXml,
        base: profile.baseUrl,
        version: dataModel.getODataVersion()
    };

    const prompt = BASE_PROMPT.replaceAll(/{{(\w+)}}/g, (_, key) => {
        return replacements[key] || "";
    });

    const tokens = encoding.encode(prompt);
    console.log(`Prompt tokens: ${tokens.length}`);
    if (tokens.length > 64000) {
        vscode.window.showWarningMessage('Metadata file too large, please provide a smaller file.');
        return;
    }
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


    // stream and buffer the response
    const buffer = [];
    for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
        buffer.push(fragment);
    }
    const response = buffer.join('');

    const codeBlocks = extractCodeBlocks(response);

    let query = codeBlocks[0] || '';

    stream.button({
        title: 'Run',
        command: 'odata.runQuery',
        arguments: [query]
    });
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