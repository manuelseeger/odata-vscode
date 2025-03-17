import * as vscode from 'vscode';

export enum AuthKind {
    None = 'none',
    Basic = 'basic',
    Bearer = 'bearer',
    ClientCert = 'cliencert'
}

interface IProfileAuthentication {
    kind: AuthKind;
    username?: string;
    password?: string;
    token?: string;
    cert?: vscode.Uri;
    key?: vscode.Uri;
}

export interface Profile {
    name: string;
    baseUrl: string;
    auth: IProfileAuthentication;
    metadata?: string;
}


export interface EndpointProfileMap {
    [key: string]: Profile;
}

export class ProfileTreeProvider implements vscode.TreeDataProvider<ProfileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProfileItem | undefined | void> = new vscode.EventEmitter<ProfileItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ProfileItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) { }

    getTreeItem(element: ProfileItem): vscode.TreeItem {
        return element;
    }

    getChildren(): ProfileItem[] {
        const profiles = this.context.globalState.get<EndpointProfileMap>('odata.profiles', {});
        return Object.keys(profiles).map(key => new ProfileItem(profiles[key]));
    }
    addProfile(profile: Profile) {
        const profiles = this.context.globalState.get<Profile[]>('httpProfiles', []);
        profiles.push(profile);
        this.context.globalState.update('httpProfiles', profiles);
        this._onDidChangeTreeData.fire();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }

    deleteProfile(profile: Profile) {
        let profiles = this.context.globalState.get<Profile[]>('httpProfiles', []);
        profiles = profiles.filter(p => p.name !== profile.name);
        this.context.globalState.update('httpProfiles', profiles);
        this.refresh();
    }
}

export class ProfileItem extends vscode.TreeItem {
    constructor(public profile: Profile) {
        super(profile.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'odata.profile'; // Enables context menu
    }
}

function getWebviewContent(profile?: Profile): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <script type="module" src="https://unpkg.com/@vscode/webview-ui-toolkit/dist/toolkit.min.js"></script>
        </head>
        <body>
            <h2>${profile ? 'Edit' : 'Create'} OData Endpoint Profile</h2>
            
            <vscode-text-field id="name" placeholder="Profile Name" value="${profile?.name || ''}">Profile Name</vscode-text-field>
            <br><br>
            <vscode-text-field id="baseUrl" placeholder="Base URL" value="${profile?.baseUrl || ''}"></vscode-text-field>
            <br><br>
            <vscode-text-field id="auth" placeholder="Authentication Token" value="${profile?.auth || ''}"></vscode-text-field>
            <br><br>
            <vscode-button id="saveButton">${profile ? 'Update' : 'Save'}</vscode-button>

            <script>
                const vscode = acquireVsCodeApi();

                document.getElementById('saveButton').addEventListener('click', () => {
                    const name = document.getElementById('name').value;
                    const baseUrl = document.getElementById('baseUrl').value;
                    const auth = document.getElementById('auth').value;

                    if (!name || !baseUrl) {
                        alert("Profile Name and Base URL are required!");
                        return;
                    }

                    vscode.postMessage({
                        command: 'saveProfile',
                        data: { name, baseUrl, auth }
                    });
                });
            </script>
        </body>
        </html>
    `;
}

export function openProfileWebview(context: vscode.ExtensionContext, treeProvider: ProfileTreeProvider, profile?: Profile) {
    const panel = vscode.window.createWebviewPanel(
        'profileManager',
        profile ? `Edit Profile: ${profile.name}` : 'Create HTTP Profile',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(profile);

    panel.webview.onDidReceiveMessage(
        (message) => {
            if (message.command === 'saveProfile') {
                let profiles = context.globalState.get<Profile[]>('httpProfiles', []);

                if (profile) {
                    profiles = profiles.map(p => (p.name === profile.name ? message.data : p)); // Update existing
                } else {
                    profiles.push(message.data); // Add new
                }

                context.globalState.update('httpProfiles', profiles);
                treeProvider.refresh();
                vscode.window.showInformationMessage(`Profile "${message.data.name}" ${profile ? 'updated' : 'added'}!`);
                panel.dispose();
            }
        },
        undefined,
        context.subscriptions
    );
}