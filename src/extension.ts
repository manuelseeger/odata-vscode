import * as vscode from 'vscode';

import { chatHandler } from './chat';
import { setExtensionContext } from './util';
import { ProfileTreeProvider } from './profiles';
import { selectMetadata, getEndpointMetadata, addEndpointProfile, selectProfile, runQuery } from './commands';
import { openProfileWebview, ProfileItem } from './profiles';

export function activate(context: vscode.ExtensionContext) {
	setExtensionContext(context);

	const provider = new ProfileTreeProvider(context);
	vscode.window.registerTreeDataProvider('odata.profiles-view', provider);

	const disposable = vscode.commands.registerCommand('odata.selectMetadata', selectMetadata);

	const odataParticipant = vscode.chat.createChatParticipant('odata.odata-chat', chatHandler);

	// add icon to participant
	odataParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'icon-odata.png');

	context.subscriptions.push(disposable);


	context.subscriptions.push(
		vscode.commands.registerCommand('odata.runQuery', runQuery),
		vscode.commands.registerCommand('odata.getMetadata', getEndpointMetadata),
		vscode.commands.registerCommand('odata.selectProfile', selectProfile),
		vscode.commands.registerCommand('odata.addProfile', addEndpointProfile),
		vscode.commands.registerCommand('odata.editProfile', (profileItem: ProfileItem) => {
			openProfileWebview(context, provider, profileItem.profile);
		}),
		vscode.commands.registerCommand('odata.deleteProfile', (profileItem: ProfileItem) => {
			provider.deleteProfile(profileItem.profile);
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
