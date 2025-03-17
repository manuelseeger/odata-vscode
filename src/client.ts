import * as vscode from 'vscode';
import { config } from './configuration';
import { AuthKind, Profile } from './profiles';
import { setGlobalDispatcher, Agent, Dispatcher } from "undici";


declare global {
    interface RequestInit {
        dispatcher?: Agent | undefined;
        headers: Headers;
    }
}

export async function getRequestInit(profile: Profile): Promise<RequestInit> {
    const r: RequestInit & { headers: Headers } = {
        headers: new Headers()
    };

    if (config.defaultFormat === 'json') {
        r.headers.append('Accept', 'application/json');
    } else {
        r.headers.append('Accept', 'application/xml');
    };

    switch (profile.auth.kind) {
        case AuthKind.Basic:
            r.headers.set('Authorization', 'Basic ' + Buffer.from(profile.auth.username + ":" + profile.auth.password).toString('base64'));
            break;

        case AuthKind.Bearer:
            r.headers.set('Authorization', 'Bearer ' + profile.auth.token);
            break;
        case AuthKind.ClientCert:
            const cert = await vscode.workspace.fs.readFile(vscode.Uri.file(profile.auth.cert!.path));
            const key = await vscode.workspace.fs.readFile(vscode.Uri.file(profile.auth.key!.path));

            const agent = new Agent({
                connect: {
                    cert: cert.toString(),
                    key: key.toString()
                },
            });
            r.dispatcher = agent;
            setGlobalDispatcher(agent);
            break;
        default:
    }

    return r;
}