import { Agent, fetch, Headers } from "undici";
import { getConfig } from "../configuration";
import { AuthKind, Profile } from "../contracts/types";
import { IQueryRunner, RequestPolicy, RequestResult } from "../contracts/IQueryRunner";
import { IFileReader } from "../contracts/IFileReader";
import { parseEndpoint, parseProfile } from "../profileData";
import { requireTrustedWorkspace } from "../security";

export class QueryRunner implements IQueryRunner {
    constructor(
        private fileReader: IFileReader,
        private policy: RequestPolicy = { timeoutMs: 30_000, maxResponseBytes: 10 * 1024 * 1024 },
        private checkTrust: () => void = requireTrustedWorkspace,
    ) {}

    run(query: string, profile: Profile, signal?: AbortSignal): Promise<RequestResult> {
        return this.fetch(
            query,
            profile,
            getConfig().defaultFormat === "json" ? "application/json" : "application/xml",
            signal,
        );
    }

    async fetch(
        target: string,
        input: Profile,
        accept: string,
        signal?: AbortSignal,
    ): Promise<RequestResult> {
        this.checkTrust();
        const profile = parseProfile(input);
        const url = parseEndpoint(target);
        if (url.origin !== parseEndpoint(profile.baseUrl).origin) {
            throw new Error("The query must use the selected endpoint origin.");
        }
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) {
            abort();
        }
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            abort();
        }, this.policy.timeoutMs);
        let agent: Agent | undefined;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const checkActive = () => {
            this.checkTrust();
            if (controller.signal.aborted) {
                throw new Error(timedOut ? "Request deadline exceeded." : "Request cancelled.");
            }
        };
        try {
            checkActive();
            const headers = new Headers({ Accept: accept });
            for (const [name, value] of Object.entries(profile.headers)) {
                headers.set(name, value);
            }
            if (profile.auth.kind === AuthKind.Basic) {
                headers.set(
                    "Authorization",
                    `Basic ${Buffer.from(`${profile.auth.username}:${profile.auth.password}`).toString("base64")}`,
                );
            } else if (profile.auth.kind === AuthKind.Bearer) {
                headers.set("Authorization", `Bearer ${profile.auth.token}`);
            } else if (profile.auth.kind === AuthKind.ClientCert) {
                const auth = profile.auth;
                const read = async (uri: NonNullable<typeof auth.cert>) => {
                    checkActive();
                    const data = await new Promise<Uint8Array>((resolve, reject) => {
                        const cancelled = () => {
                            controller.signal.removeEventListener("abort", cancelled);
                            reject(new Error("Request cancelled."));
                        };
                        controller.signal.addEventListener("abort", cancelled, { once: true });
                        this.fileReader
                            .readFile(uri.fsPath)
                            .then(resolve, reject)
                            .finally(() =>
                                controller.signal.removeEventListener("abort", cancelled),
                            );
                    });
                    checkActive();
                    return Buffer.from(data);
                };
                if (auth.pfx) {
                    agent = new Agent({
                        connect: { pfx: await read(auth.pfx), passphrase: auth.passphrase },
                    });
                } else if (auth.cert && auth.key) {
                    agent = new Agent({
                        connect: {
                            cert: await read(auth.cert),
                            key: await read(auth.key),
                            passphrase: auth.passphrase,
                        },
                    });
                }
            }
            checkActive();
            const response = await fetch(url, {
                headers,
                redirect: "manual",
                signal: controller.signal,
                dispatcher: agent,
            });
            if (response.status >= 300 && response.status < 400) {
                await response.body?.cancel();
                throw new Error("Redirects are not permitted.");
            }
            reader = response.body?.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            if (reader) {
                while (true) {
                    const chunk = await reader.read();
                    checkActive();
                    if (chunk.done) {
                        break;
                    }
                    size += chunk.value.byteLength;
                    if (size > this.policy.maxResponseBytes) {
                        throw new Error("Response exceeds the decoded size limit.");
                    }
                    chunks.push(chunk.value);
                }
            }
            checkActive();
            return {
                status: response.status,
                statusText: response.statusText,
                contentType: response.headers.get("content-type") || "",
                text: Buffer.concat(chunks, size).toString("utf8"),
            };
        } catch (error) {
            if (timedOut) {
                throw new Error("Request deadline exceeded.");
            }
            if (controller.signal.aborted) {
                throw new Error("Request cancelled.");
            }
            if (
                error instanceof Error &&
                [
                    "Redirects are not permitted.",
                    "Response exceeds the decoded size limit.",
                ].includes(error.message)
            ) {
                throw error;
            }
            throw new Error("Request failed. Check the endpoint and authentication settings.");
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            await reader?.cancel().catch(() => undefined);
            reader?.releaseLock();
            await agent?.destroy();
        }
    }
}
