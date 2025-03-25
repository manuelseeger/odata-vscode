import * as vscode from 'vscode';

import { chatHandler } from './chat';
import { setExtensionContext } from './util';
import { Profile, ProfileTreeProvider } from './profiles';
import { getEndpointMetadata, selectProfile, runQuery, openQuery, requestProfileMetadata } from './commands';
import { ProfileItem } from './profiles';
import { ODataDefaultCompletionItemProvider, ODataSystemQueryCompletionItemProvider } from './completions';
import { MetadataModelService } from './services/MetadataModelService';
import { ODataDiagnosticProvider } from './diagnostics';
export const ODataMode: vscode.DocumentFilter = { language: 'odata' };
let diagnosticCollection: vscode.DiagnosticCollection;


export function activate(context: vscode.ExtensionContext) {
	setExtensionContext(context);

	const profileTreeProvider = new ProfileTreeProvider(context);
	vscode.window.registerTreeDataProvider('odata.profiles-view', profileTreeProvider);

	const odataParticipant = vscode.chat.createChatParticipant('odata.odata-chat', chatHandler);

	// add icon to participant
	odataParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'icon-odata.png');

	context.subscriptions.push(
		vscode.commands.registerCommand('odata.runQuery', runQuery),
		vscode.commands.registerCommand('odata.openQuery', openQuery),
		vscode.commands.registerCommand('odata.getMetadata', getEndpointMetadata),
		vscode.commands.registerCommand('odata.selectProfile', selectProfile),
		vscode.commands.registerCommand('odata.addProfile', () => {
			profileTreeProvider.openProfileWebview();
		}),
		vscode.commands.registerCommand('odata.editProfile', (profileItem: ProfileItem) => {
			profileTreeProvider.openProfileWebview(profileItem.profile);
		}),
		vscode.commands.registerCommand('odata.deleteProfile', (profileItem: ProfileItem) => {
			profileTreeProvider.deleteProfile(profileItem.profile);
		}),
		vscode.commands.registerCommand('odata.requestMetadata', async (profileItem: ProfileItem) => {
			profileItem.profile.metadata = await requestProfileMetadata(profileItem.profile);
			profileTreeProvider.refresh();
		}),
	);

	const profile = context.globalState.get<Profile>('selectedProfile');

	const metadataService = MetadataModelService.getInstance();

	const defaultCompleteProvider = new ODataDefaultCompletionItemProvider(metadataService);
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(ODataMode,
		defaultCompleteProvider, ...defaultCompleteProvider.triggerCharacters));

	const systemQueryCompleteProvider = new ODataSystemQueryCompletionItemProvider();
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(ODataMode,
		systemQueryCompleteProvider, ...systemQueryCompleteProvider.triggerCharacters));

	diagnosticCollection = vscode.languages.createDiagnosticCollection('odata');

	const diagnosticsProvider = new ODataDiagnosticProvider(diagnosticCollection);
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		diagnosticsProvider.onDidChangeTextDocument(event.document);
	}));

}

// This method is called when your extension is deactivated
export function deactivate() { }
