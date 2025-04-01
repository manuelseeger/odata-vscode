import * as vscode from "vscode";
import { getConfig } from "./configuration";
import { AuthKind, Profile } from "./profiles";
import { Agent } from "undici";

declare global {
    interface RequestInit {
        dispatcher?: Agent | undefined;
        headers: Headers;
    }
}

export async function getRequestInit(profile: Profile): Promise<RequestInit> {
    const r: RequestInit & { headers: Headers } = {
        headers: new Headers(),
    };

    if (getConfig().defaultFormat === "json") {
        r.headers.append("Accept", "application/json");
    } else {
        r.headers.append("Accept", "application/xml");
    }

    if (profile.headers) {
        for (const header of Object.keys(profile.headers)) {
            r.headers.append(header, profile.headers[header]);
        }
    }

    switch (profile.auth.kind) {
        case AuthKind.Basic:
            if (!profile.auth.username) {
                profile.auth.username = "";
            }
            r.headers.set(
                "Authorization",
                "Basic " +
                    Buffer.from(profile.auth.username + ":" + profile.auth.password).toString(
                        "base64",
                    ),
            );
            break;

        case AuthKind.Bearer:
            r.headers.set("Authorization", "Bearer " + profile.auth.token);
            break;
        case AuthKind.ClientCert:
            // if PFX, use pfx, else use cert and key
            if (profile.auth.pfx) {
                const pfx = await vscode.workspace.fs.readFile(
                    vscode.Uri.file(profile.auth.pfx.path),
                );
                r.dispatcher = new Agent({
                    connect: {
                        pfx: [{ buf: Buffer.from(pfx), passphrase: profile.auth.passphrase }],
                    },
                });
            } else if (profile.auth.cert && profile.auth.key) {
                const cert = await vscode.workspace.fs.readFile(
                    vscode.Uri.file(profile.auth.cert.path),
                );
                const key = await vscode.workspace.fs.readFile(
                    vscode.Uri.file(profile.auth.key.path),
                );
                r.dispatcher = new Agent({
                    connect: {
                        cert: cert.toString(),
                        key: key.toString(),
                    },
                });
            }
            break;
        default:
    }

    return r;
}
