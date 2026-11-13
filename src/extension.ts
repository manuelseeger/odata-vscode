import * as vscode from "vscode";
import { ChatParticipantProvider } from "./chat";
import { CommandProvider } from "./commands";
import {
    DefaultCompletionItemProvider,
    MetadataCompletionItemProvider,
    SystemQueryCompletionItemProvider,
} from "./completions";
import { odata } from "./contracts/types";
import { ODataDiagnosticProvider } from "./diagnostics";
import { ODataDocumentFormatter } from "./formatting";
import * as v2 from "./definitions/odataV2.json";
import * as v4 from "./definitions/odataV4.json";
import { SyntaxParser } from "./parser/syntaxparser";
import { ProfileTreeProvider } from "./profiles";
import { VSCodeFileReader } from "./provider";
import { MetadataModelService } from "./services/MetadataModelService";
import { QueryRunner } from "./services/QueryRunner";
import { SignatureHelpProvider } from "./signatures";
import { Tokenizer } from "./services/Tokenizer";
import { HoverProvider } from "./hovers";

export async function activate(context: vscode.ExtensionContext) {
    const fileReader = new VSCodeFileReader();
    const syntaxParser = new SyntaxParser();
    const metadataService = new MetadataModelService();
    const queryRunner = new QueryRunner(fileReader);
    const tokenizer = new Tokenizer();

    const reference: odata.Reference = {
        v2: v2 as odata.Spec,
        v4: v4 as odata.Spec,
    };

    const commands: CommandProvider = new CommandProvider(context, queryRunner, () =>
        profiles.getSelectedProfile(),
    );
    const profiles: ProfileTreeProvider = new ProfileTreeProvider(
        tokenizer,
        metadataService,
        context,
        (profile, signal) => commands.requestProfileMetadata(profile, signal),
    );
    context.subscriptions.push(
        new SignatureHelpProvider(context, reference),
        profiles,
        commands,
        new DefaultCompletionItemProvider(context, metadataService),
        new SystemQueryCompletionItemProvider(),
        new MetadataCompletionItemProvider(metadataService, context),
        new ODataDocumentFormatter(syntaxParser),
        new HoverProvider(metadataService, context, reference),
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

    try {
        context.subscriptions.push(
            new ChatParticipantProvider(context, metadataService, tokenizer),
        );
    } catch {}

    return context;
}

export function deactivate() {}
