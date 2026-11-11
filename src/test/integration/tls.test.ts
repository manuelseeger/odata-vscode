import * as assert from "assert";
import { readFileSync } from "fs";
import { createServer, Server, ServerOptions } from "https";
import { AddressInfo } from "net";
import { join } from "path";
import { getCACertificates, setDefaultCACertificates, TLSSocket } from "tls";
import { URI } from "vscode-uri";
import { AuthKind, IProfileAuthentication, Profile } from "../../contracts/types";
import { QueryRunner } from "../../services/QueryRunner";

// Committed, test-only fixtures. Regenerate with scripts/gen-test-certs.sh.
// Tests run from out/test/integration, so resolve against the source tree.
const fixtures = join(__dirname, "..", "..", "..", "src", "test", "testdata", "tls");
const fixture = (name: string) => join(fixtures, name);
const passphrase = "test-passphrase";

type Seen = { authorization?: string; custom?: string; peer?: string };

async function listen(
    options: ServerOptions,
    seen: Seen[],
    onRequest?: (url: string, res: import("http").ServerResponse, base: string) => void,
): Promise<{ server: Server; baseUrl: string }> {
    let baseUrl = "";
    const server = createServer(options, (req, res) => {
        const peer = (req.socket as TLSSocket).getPeerCertificate();
        seen.push({
            authorization: req.headers.authorization,
            custom: req.headers["x-key"] as string | undefined,
            peer: peer?.subject?.CN as string | undefined,
        });
        onRequest?.(req.url ?? "", res, baseUrl);
        res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { server, baseUrl };
}

async function close(server: Server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
}

suite("HTTPS authentication", () => {
    let authorities: string[];
    let server: Server;
    let baseUrl: string;
    let requests: Seen[];
    const policy = { timeoutMs: 2000, maxResponseBytes: 1024 };
    const tlsServer = {
        cert: readFileSync(fixture("server.pem")),
        key: readFileSync(fixture("server-key.pem")),
        ca: readFileSync(fixture("ca.pem")),
    };
    const profile = (auth: Profile["auth"] = { kind: AuthKind.None }): Profile => ({
        name: "TLS",
        baseUrl,
        headers: {},
        auth,
    });
    const runner = () =>
        new QueryRunner({ readFile: async (path) => readFileSync(path) }, policy, () => undefined);

    suiteSetup(() => {
        // The client must validate the server against the test CA, as it would in production.
        authorities = getCACertificates();
        setDefaultCACertificates([...authorities, tlsServer.ca.toString()]);
    });
    suiteTeardown(() => {
        setDefaultCACertificates(authorities);
    });

    suite("headers and redirects", () => {
        setup(async () => {
            requests = [];
            ({ server, baseUrl } = await listen(tlsServer, requests, (url, res, base) => {
                if (url === "/redirect") {
                    res.writeHead(302, { Location: `${base}/destination` });
                }
            }));
        });
        teardown(() => close(server));

        test("sends Basic, Bearer, and custom headers only to the validated HTTPS origin", async () => {
            await runner().fetch(
                baseUrl,
                profile({ kind: AuthKind.Basic, username: "test", password: "password" }),
                "text/plain",
            );
            await runner().fetch(
                baseUrl,
                {
                    ...profile({ kind: AuthKind.Bearer, token: "token" }),
                    headers: { "X-Key": "header" },
                },
                "text/plain",
            );
            assert.strictEqual(
                requests[0].authorization,
                `Basic ${Buffer.from("test:password").toString("base64")}`,
            );
            assert.strictEqual(requests[1].authorization, "Bearer token");
            assert.strictEqual(requests[1].custom, "header");
            await assert.rejects(
                runner().fetch(
                    `${baseUrl}/redirect`,
                    profile({ kind: AuthKind.Bearer, token: "token" }),
                    "text/plain",
                ),
                /Redirects/,
            );
            assert.strictEqual(requests.length, 3);
        });
    });

    // The server enforces client certificates during the handshake, so a request only
    // reaches the handler if the client presented a certificate issued by the trusted CA.
    suite("mutual TLS", () => {
        setup(async () => {
            requests = [];
            ({ server, baseUrl } = await listen(
                { ...tlsServer, requestCert: true, rejectUnauthorized: true },
                requests,
            ));
        });
        teardown(() => close(server));

        const clientCert = (auth: Omit<IProfileAuthentication, "kind">): Profile["auth"] => ({
            kind: AuthKind.ClientCert,
            ...auth,
        });
        const accepted = async (auth: Profile["auth"]) => {
            const result = await runner().fetch(baseUrl, profile(auth), "text/plain");
            assert.strictEqual(result.status, 200);
            assert.strictEqual(result.text, "ok");
            assert.deepStrictEqual(
                requests.map((r) => r.peer),
                ["odata-test-client"],
            );
        };
        const rejected = async (auth: Profile["auth"]) => {
            await assert.rejects(
                runner().fetch(baseUrl, profile(auth), "text/plain"),
                /Request failed/,
            );
            assert.strictEqual(requests.length, 0);
        };

        test("PEM certificate and key are accepted and the TLS connection is closed", async () => {
            const closed = new Promise<void>((resolve) =>
                server.once("secureConnection", (socket) => socket.once("close", () => resolve())),
            );
            await accepted(
                clientCert({
                    cert: URI.file(fixture("client.pem")),
                    key: URI.file(fixture("client-key.pem")),
                }),
            );
            await closed;
        });

        test("PEM certificate with a passphrase-protected key is accepted", () =>
            accepted(
                clientCert({
                    cert: URI.file(fixture("client.pem")),
                    key: URI.file(fixture("client-key-encrypted.pem")),
                    passphrase,
                }),
            ));

        test("PKCS#12 bundle with a passphrase is accepted", () =>
            accepted(clientCert({ pfx: URI.file(fixture("client.pfx")), passphrase })));

        test("no client certificate is rejected by the server", () =>
            rejected({ kind: AuthKind.None }));

        test("PKCS#12 bundle with the wrong passphrase fails", () =>
            rejected(clientCert({ pfx: URI.file(fixture("client.pfx")), passphrase: "wrong" })));

        test("encrypted PEM key with the wrong passphrase fails", () =>
            rejected(
                clientCert({
                    cert: URI.file(fixture("client.pem")),
                    key: URI.file(fixture("client-key-encrypted.pem")),
                    passphrase: "wrong",
                }),
            ));

        test("client certificate from an untrusted CA is rejected by the server", () =>
            rejected(
                clientCert({
                    cert: URI.file(fixture("untrusted-client.pem")),
                    key: URI.file(fixture("untrusted-client-key.pem")),
                }),
            ));

        test("deadline also bounds a pending certificate read", async () => {
            const pending = new QueryRunner(
                { readFile: () => new Promise<Uint8Array>(() => undefined) },
                { timeoutMs: 30, maxResponseBytes: 1024 },
                () => undefined,
            );
            await assert.rejects(
                pending.fetch(
                    baseUrl,
                    profile(clientCert({ pfx: URI.file(fixture("client.pfx")) })),
                    "text/plain",
                ),
                /deadline/,
            );
            assert.strictEqual(requests.length, 0);
        });
    });
});
