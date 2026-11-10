import * as assert from "assert";
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { createServer, Server } from "https";
import { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { getCACertificates, setDefaultCACertificates, TLSSocket } from "tls";
import { URI } from "vscode-uri";
import { AuthKind, Profile } from "../../contracts/types";
import { QueryRunner } from "../../services/QueryRunner";

suite("HTTPS authentication", () => {
    let directory: string;
    let cert: Buffer;
    let key: Buffer;
    let authorities: string[];
    let server: Server;
    let baseUrl: string;
    let requests: { authorization?: string; custom?: string; peer?: string }[];
    const policy = { timeoutMs: 2000, maxResponseBytes: 1024 };
    const profile = (): Profile => ({
        name: "TLS",
        baseUrl,
        headers: {},
        auth: { kind: AuthKind.None },
    });
    const runner = () =>
        new QueryRunner({ readFile: async (path) => readFileSync(path) }, policy, () => undefined);

    suiteSetup(() => {
        directory = mkdtempSync(join(tmpdir(), "odata-tls-"));
        execFileSync(
            "openssl",
            [
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                join(directory, "test key.pem"),
                "-out",
                join(directory, "test cert.pem"),
                "-days",
                "1",
                "-subj",
                "/CN=localhost",
                "-addext",
                "subjectAltName=IP:127.0.0.1",
            ],
            { stdio: "ignore" },
        );
        cert = readFileSync(join(directory, "test cert.pem"));
        key = readFileSync(join(directory, "test key.pem"));
        authorities = getCACertificates();
        setDefaultCACertificates([...authorities, cert.toString()]);
    });
    suiteTeardown(() => {
        setDefaultCACertificates(authorities);
        rmSync(directory, { recursive: true, force: true });
    });
    setup(async () => {
        requests = [];
        server = createServer(
            { cert, key, ca: cert, requestCert: true, rejectUnauthorized: false },
            (req, res) => {
                const peer = (req.socket as TLSSocket).getPeerCertificate();
                requests.push({
                    authorization: req.headers.authorization,
                    custom: req.headers["x-key"] as string | undefined,
                    peer: peer?.subject?.CN as string | undefined,
                });
                if (req.url === "/redirect") {
                    res.writeHead(302, { Location: `${baseUrl}/destination` });
                }
                res.end("ok");
            },
        );
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        baseUrl = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    teardown(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    });

    test("sends Basic, Bearer, and custom headers only to the validated HTTPS origin", async () => {
        await runner().fetch(
            baseUrl,
            {
                ...profile(),
                auth: { kind: AuthKind.Basic, username: "test", password: "password" },
            },
            "text/plain",
        );
        await runner().fetch(
            baseUrl,
            {
                ...profile(),
                auth: { kind: AuthKind.Bearer, token: "token" },
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
                { ...profile(), auth: { kind: AuthKind.Bearer, token: "token" } },
                "text/plain",
            ),
            /Redirects/,
        );
        assert.strictEqual(requests.length, 3);
    });

    test("loads certificate filesystem paths and closes its owned TLS connection", async () => {
        const closed = new Promise<void>((resolve) =>
            server.once("secureConnection", (socket) => socket.once("close", () => resolve())),
        );
        await runner().fetch(
            baseUrl,
            {
                ...profile(),
                auth: {
                    kind: AuthKind.ClientCert,
                    cert: URI.file(join(directory, "test cert.pem")),
                    key: URI.file(join(directory, "test key.pem")),
                },
            },
            "text/plain",
        );
        assert.strictEqual(requests[0].peer, "localhost");
        await closed;
    });

    test("deadline also bounds a pending certificate read", async () => {
        const pending = new QueryRunner(
            { readFile: () => new Promise<Uint8Array>(() => undefined) },
            { timeoutMs: 30, maxResponseBytes: 1024 },
            () => undefined,
        );
        await assert.rejects(
            pending.fetch(
                baseUrl,
                {
                    ...profile(),
                    auth: { kind: AuthKind.ClientCert, pfx: URI.file(join(directory, "test.pfx")) },
                },
                "text/plain",
            ),
            /deadline/,
        );
        assert.strictEqual(requests.length, 0);
    });
});
