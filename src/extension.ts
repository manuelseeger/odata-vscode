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
import * as v2 from "./odataV2.json";
import * as v4 from "./odataV4.json";
import { odata } from "./contracts/types";
import { SignatureHelpProvider } from "./signatures";
import { IQueryRunner } from "./contracts/IQueryRunner";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { IFileReader } from "./contracts/IFileReader";
import { ISyntaxParser } from "./contracts/ISyntaxParser";

export async function activate(
    context: vscode.ExtensionContext,
    deps?: {
        queryRunner?: IQueryRunner;
        fileReader?: IFileReader;
        metadataService?: IMetadataModelService;
        syntaxParser?: ISyntaxParser;
    },
) {
    const fileReader = deps?.fileReader || new VSCodeFileReader();
    const syntaxParser = new SyntaxParser();
    const metadataService = deps?.metadataService || new MetadataModelService();
    const queryRunner = deps?.queryRunner || new QueryRunner(fileReader);

    const reference: odata.Reference = {
        v2: v2 as odata.Spec,
        v4: v4 as odata.Spec,
    };

    context.subscriptions.push(
        new SignatureHelpProvider(context, reference),
        new ChatParticipantProvider(context, metadataService),
        new ProfileTreeProvider(context),
        new CommandProvider(context, queryRunner),
        new DefaultCompletionItemProvider(context, metadataService),
        new SystemQueryCompletionItemProvider(),
        new MetadataCompletionItemProvider(metadataService, context),
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
