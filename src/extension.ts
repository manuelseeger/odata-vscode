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
import { QueryRunner } from "./services/QueryRunner";
import { VSCodeFileReader } from "./provider";

export function activate(context: vscode.ExtensionContext) {
    const syntaxParser = new SyntaxParser();
    const metadataService = new MetadataModelService();
    const queryRunner = new QueryRunner(new VSCodeFileReader());

    context.subscriptions.push(
        new ChatParticipantProvider(context, metadataService),
        new ProfileTreeProvider(context),
        new CommandProvider(context, queryRunner),
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

    return context;
}

export function deactivate() {}
