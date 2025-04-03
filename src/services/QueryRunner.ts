import { AuthKind, Profile } from "../profiles";
import { Agent } from "undici";

export interface IFileReader {
    readFile(path: string): Promise<Uint8Array>;
}

export class QueryRunner {
    private fileReader: IFileReader;

    constructor(fileReader: IFileReader) {
        this.fileReader = fileReader;
    }

    public async run(query: string, profile: Profile): Promise<Response> {
        const r = await fetch(query, await this.requestInit(profile));
        return r;
    }

    async requestInit(profile: Profile): Promise<RequestInit> {
        if (profile.auth.kind === "basic") {
            return {
                headers: {
                    Accept: "application/json",
                    Authorization: `Basic ${Buffer.from(
                        profile.auth.username + ":" + profile.auth.password,
                    ).toString("base64")}`,
                },
            };
        } else if (profile.auth.kind === "bearer") {
            return {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${profile.auth.token}`,
                },
            };
        } else if (profile.auth.kind === AuthKind.ClientCert) {
            if (profile.auth.pfx) {
                const pfx = await this.fileReader.readFile(profile.auth.pfx.path);
                return {
                    dispatcher: new Agent({
                        connect: {
                            pfx: [
                                {
                                    buf: Buffer.from(pfx),
                                    passphrase: profile.auth.passphrase,
                                },
                            ],
                        },
                    }),
                } as any as RequestInit; // trick TypeScript to accept Agent as dispatcher
            } else if (profile.auth.cert && profile.auth.key) {
                const cert = await this.fileReader.readFile(profile.auth.cert.path);
                const key = await this.fileReader.readFile(profile.auth.key.path);
                return {
                    dispatcher: new Agent({
                        connect: {
                            cert: Buffer.from(cert),
                            key: Buffer.from(key),
                        },
                    }),
                } as any as RequestInit; // trick TypeScript to accept Agent as dispatcher
            }
        }
        return {
            headers: {
                Accept: "application/json",
            },
        };
    }
}
