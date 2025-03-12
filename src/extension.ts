import * as vscode from 'vscode';

import { handler } from './chat-participant';

interface ODataMetadataConfiguration {
	map: Array<IODataMetadataConfigurationMapEntry>;
}

interface IODataMetadataConfigurationMapEntry {
	url: string,
	path: string
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('odata.helloWorld', async () => {


		const config = vscode.workspace.getConfiguration('odata').get('metadata') as ODataMetadataConfiguration;

		const metadataXml = await vscode.workspace.fs.readFile(vscode.Uri.file(config.map[0].path));

	});


	// create participant
	const odataParticipant = vscode.chat.createChatParticipant('odata.odata-participant', handler);

	// add icon to participant
	odataParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'icon-odata.png');


	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }