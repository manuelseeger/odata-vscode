import * as vscode from "vscode";
import { ChatParticipantProvider } from "./chat";
import { ProfileTreeProvider } from "./profiles";
import { CommandProvider } from "./commands";
import {
    DefaultCompletionItemProvider,
    MetadataCompletionItemProvider,
    SystemQueryCompletionItemProvider,
} from "./completions";
import { MetadataModelService } from "./services/MetadataModelService";
import { ODataDiagnosticProvider } from "./diagnostics";
import { SyntaxParser } from "./parser/syntaxparser";
import { ODataDocumentFormatter } from "./formatting";

export function activate(context: vscode.ExtensionContext) {
    const syntaxParser = new SyntaxParser();
    const metadataService = new MetadataModelService();

    context.subscriptions.push(
        new ChatParticipantProvider(context, metadataService),
        new ProfileTreeProvider(context),
        new CommandProvider(context),
        new DefaultCompletionItemProvider(context, metadataService),
        new SystemQueryCompletionItemProvider(),
        new MetadataCompletionItemProvider(metadataService, syntaxParser, context),
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
