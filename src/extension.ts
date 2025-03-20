import * as vscode from 'vscode';

import { chatHandler } from './chat';
import { setExtensionContext } from './util';
import { ProfileTreeProvider } from './profiles';
import { getEndpointMetadata, selectProfile, runQuery, openQuery, requestProfileMetadata } from './commands';
import { ProfileItem } from './profiles';


export function activate(context: vscode.ExtensionContext) {
	setExtensionContext(context);

	const provider = new ProfileTreeProvider(context);
	vscode.window.registerTreeDataProvider('odata.profiles-view', provider);

	const odataParticipant = vscode.chat.createChatParticipant('odata.odata-chat', chatHandler);

	// add icon to participant
	odataParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'icon-odata.png');

	context.subscriptions.push(
		vscode.commands.registerCommand('odata.runQuery', runQuery),
		vscode.commands.registerCommand('odata.openQuery', openQuery),
		vscode.commands.registerCommand('odata.getMetadata', getEndpointMetadata),
		vscode.commands.registerCommand('odata.selectProfile', selectProfile),
		vscode.commands.registerCommand('odata.addProfile', () => {
			provider.openProfileWebview();
		}),
		vscode.commands.registerCommand('odata.editProfile', (profileItem: ProfileItem) => {
			provider.openProfileWebview(profileItem.profile);
		}),
		vscode.commands.registerCommand('odata.deleteProfile', (profileItem: ProfileItem) => {
			provider.deleteProfile(profileItem.profile);
		}),
		vscode.commands.registerCommand('odata.requestMetadata', async (profileItem: ProfileItem) => {
			profileItem.profile.metadata = await requestProfileMetadata(profileItem.profile);
			provider.refresh();
		}),
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
