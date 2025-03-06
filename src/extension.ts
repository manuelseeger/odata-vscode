import * as vscode from 'vscode';

import { parseStringPromise } from "xml2js";

import { ODataEdmxModelBase } from './model/edmx/ODataEdmxModelBase';



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

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "odata" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('odata.helloWorld', async () =>{
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user

		const path = '~\\dev\\C4C-OData-Metadata\\my344469\\customer$metadata.xml';

		const config = vscode.workspace.getConfiguration('odata').get('metadata') as ODataMetadataConfiguration;

		const metadataXml = await vscode.workspace.fs.readFile(vscode.Uri.file(config.map[0].path));

		const metadataJson = (await parseStringPromise(metadataXml)) as ODataEdmxModelBase<any>;




		vscode.window.showInformationMessage(metadataJson['edmx:Edmx'].$.Version);
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
