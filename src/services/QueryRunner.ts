import { getConfig } from "../configuration";
import { AuthKind, Profile } from "../profiles";
import { Agent, fetch } from "undici";
import { IFileReader } from "../contracts";

export class QueryRunner {
    private fileReader: IFileReader;

    constructor(fileReader: IFileReader) {
        this.fileReader = fileReader;
    }

    public async run(query: string, profile: Profile): Promise<Response> {
        const profileRequestInit = await this.requestInit(profile);
        const defaultOptions = {} as RequestInit;

        if (getConfig().defaultFormat === "json") {
            defaultOptions.headers = {
                Accept: "application/json",
            };
        } else {
            defaultOptions.headers = {
                Accept: "application/xml",
            };
        }
        const mergedOptions = deepMerge(defaultOptions, profileRequestInit);

        const r = await fetch(
            query,
            // Workaround for client certificate with native fetch
            // https://github.com/nodejs/node/issues/48977
            mergedOptions as any,
        );
        return r;
    }

    public async fetch(url: string, profile: Profile, options: RequestInit): Promise<Response> {
        const profileRequestInit = await this.requestInit(profile);
        const mergedOptions = deepMerge(options, profileRequestInit);
        const r = await fetch(url, mergedOptions);
        return r;
    }

    async requestInit(profile: Profile): Promise<RequestInit> {
        let requestInit = {} as RequestInit;
        requestInit.headers = {};

        if (profile.headers) {
            for (const header of Object.keys(profile.headers)) {
                requestInit.headers[header] = profile.headers[header];
            }
        }

        if (profile.auth.kind === AuthKind.Basic) {
            requestInit.headers["Authorization"] = `Basic ${Buffer.from(
                profile.auth.username + ":" + profile.auth.password,
            ).toString("base64")}`;
        } else if (profile.auth.kind === AuthKind.Bearer) {
            requestInit.headers["Authorization"] = `Bearer ${profile.auth.token}`;
        } else if (profile.auth.kind === AuthKind.ClientCert) {
            if (profile.auth.pfx) {
                const pfx = await this.fileReader.readFile(profile.auth.pfx.path);
                (requestInit as any).dispatcher = new Agent({
                    connect: {
                        pfx: [
                            {
                                buf: Buffer.from(pfx),
                                passphrase: profile.auth.passphrase,
                            },
                        ],
                    },
                });
            } else if (profile.auth.cert && profile.auth.key) {
                const cert = await this.fileReader.readFile(profile.auth.cert.path);
                const key = await this.fileReader.readFile(profile.auth.key.path);
                (requestInit as any).dispatcher = new Agent({
                    connect: {
                        cert: Buffer.from(cert),
                        key: Buffer.from(key),
                    },
                });
            }
        }
        return requestInit;
    }
}

function deepMerge(target: any, source: any): any {
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && target[key] instanceof Object) {
            target[key] = deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}
