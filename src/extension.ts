import * as vscode from "vscode";

import { chatHandler } from "./chat";
import { setExtensionContext } from "./util";
import { Profile, ProfileTreeProvider } from "./profiles";
import {
    getEndpointMetadata,
    selectProfile,
    openQuery,
    requestProfileMetadata,
    runAndOpenQuery,
    runEditorQuery,
} from "./commands";
import { ProfileItem } from "./profiles";
import {
    ODataDefaultCompletionItemProvider,
    ODataMetadataCompletionItemProvider,
    ODataSystemQueryCompletionItemProvider,
} from "./completions";
import { MetadataModelService } from "./services/MetadataModelService";
import { ODataDiagnosticProvider } from "./diagnostics";
import { SyntaxParser } from "./parser/syntaxparser";
import { ODataDocumentFormatter } from "./formatting";
export const ODataMode: vscode.DocumentFilter = { language: "odata" };

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    setExtensionContext(context);

    const profileTreeProvider = new ProfileTreeProvider(context);
    vscode.window.registerTreeDataProvider("odata.profiles-view", profileTreeProvider);

    const odataParticipant = vscode.chat.createChatParticipant("odata.odata-chat", chatHandler);

    // add icon to participant
    odataParticipant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "icon-odata.png",
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("odata.runAndOpenQuery", runAndOpenQuery),
        vscode.commands.registerCommand("odata.runQuery", runEditorQuery),
        vscode.commands.registerCommand("odata.openQuery", openQuery),
        vscode.commands.registerCommand("odata.getMetadata", getEndpointMetadata),
        vscode.commands.registerCommand("odata.selectProfile", selectProfile),
        vscode.commands.registerCommand("odata.addProfile", () => {
            profileTreeProvider.openProfileWebview();
        }),
        vscode.commands.registerCommand("odata.editProfile", (profileItem: ProfileItem) => {
            profileTreeProvider.openProfileWebview(profileItem.profile);
        }),
        vscode.commands.registerCommand("odata.deleteProfile", (profileItem: ProfileItem) => {
            profileTreeProvider.deleteProfile(profileItem.profile);
        }),
        vscode.commands.registerCommand(
            "odata.requestMetadata",
            async (profileItem: ProfileItem) => {
                profileItem.profile.metadata = await requestProfileMetadata(profileItem.profile);
                profileTreeProvider.refresh();
            },
        ),
    );

    const profile = context.globalState.get<Profile>("selectedProfile");
    const syntaxParser = new SyntaxParser();
    const metadataService = MetadataModelService.getInstance();

    const defaultCompletionProvider = new ODataDefaultCompletionItemProvider(metadataService);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            ODataMode,
            defaultCompletionProvider,
            ...defaultCompletionProvider.triggerCharacters,
        ),
    );

    const systemQueryCompletionProvider = new ODataSystemQueryCompletionItemProvider();
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            ODataMode,
            systemQueryCompletionProvider,
            ...systemQueryCompletionProvider.triggerCharacters,
        ),
    );

    const metadataCompletionProvider = new ODataMetadataCompletionItemProvider(
        metadataService,
        syntaxParser,
        context,
    );
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            ODataMode,
            metadataCompletionProvider,
            ...metadataCompletionProvider.triggerCharacters,
        ),
    );

    diagnosticCollection = vscode.languages.createDiagnosticCollection("odata");

    const diagnosticsProvider = new ODataDiagnosticProvider(
        diagnosticCollection,
        metadataService,
        context,
    );

    syntaxParser.onSyntaxError(diagnosticsProvider.handleSyntaxError.bind(diagnosticsProvider));
    syntaxParser.onParseSuccess(diagnosticsProvider.handleParseSucess.bind(diagnosticsProvider));

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            syntaxParser.handleChangeTextDocument(event.document);
        }),
    );

    const odataFormatter = new ODataDocumentFormatter(syntaxParser, context);
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(ODataMode, odataFormatter),
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
