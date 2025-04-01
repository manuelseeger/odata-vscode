import * as vscode from "vscode";

import { chatHandler } from "./chat";
import { setExtensionContext } from "./util";
import { Profile, ProfileTreeProvider } from "./profiles";
import { CommandProvider } from "./commands";
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
import { APP_NAME, ODataMode } from "./configuration";

export function activate(context: vscode.ExtensionContext) {
    setExtensionContext(context);

    const syntaxParser = new SyntaxParser();
    const metadataService = new MetadataModelService();

    const odataParticipant = vscode.chat.createChatParticipant(
        `${APP_NAME}.odata-chat`,
        chatHandler,
    );

    // add icon to participant
    odataParticipant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "icon-odata.png",
    );

    context.subscriptions.push(
        new ProfileTreeProvider(context),
        new CommandProvider(context),
        new ODataDefaultCompletionItemProvider(context, metadataService),
        new ODataSystemQueryCompletionItemProvider(),
        new ODataMetadataCompletionItemProvider(metadataService, syntaxParser, context),
        new ODataDocumentFormatter(syntaxParser),
    );

    const diagnosticsProvider = new ODataDiagnosticProvider(metadataService, context);
    context.subscriptions.push(diagnosticsProvider);

    syntaxParser.onSyntaxError(diagnosticsProvider.handleSyntaxError.bind(diagnosticsProvider));
    syntaxParser.onParseSuccess(diagnosticsProvider.handleParseSucess.bind(diagnosticsProvider));

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            syntaxParser.handleChangeTextDocument(event.document);
        }),
    );
}

export function deactivate() {}
