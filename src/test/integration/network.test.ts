import * as assert from "assert";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { gzipSync } from "zlib";
import { AuthKind, Profile } from "../../contracts/types";
import { QueryRunner } from "../../services/QueryRunner";

suite("Request security policy", () => {
    let server: Server;
    let baseUrl: string;
    let requests: string[];
    const fileReader = {
        readFile: async () => {
            throw new Error("Unexpected certificate read");
        },
    };
    const runner = (timeoutMs = 1000, maxResponseBytes = 1024) =>
        new QueryRunner(fileReader, { timeoutMs, maxResponseBytes }, () => undefined);
    const profile = (): Profile => ({
        name: "Local",
        baseUrl,
        headers: {},
        auth: { kind: AuthKind.None },
    });

    setup(async () => {
        requests = [];
        server = createServer((req, res) => {
            requests.push(req.url || "");
            if (req.url === "/redirect") {
                res.writeHead(302, { Location: `${baseUrl}/destination` });
                res.end();
            } else if (req.url === "/large") {
                res.writeHead(200, { "Content-Encoding": "gzip" });
                res.end(gzipSync(Buffer.alloc(2048, "a")));
            } else if (req.url === "/slow") {
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.flushHeaders();
                const timer = setInterval(() => res.write("a"), 10);
                res.on("close", () => clearInterval(timer));
            } else {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end('{"ok":true}');
            }
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    teardown(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    });

    test("returns bounded text and response metadata from a real endpoint", async () => {
        const result = await runner().fetch(baseUrl, profile(), "application/json");
        assert.deepStrictEqual(result, {
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: '{"ok":true}',
        });
        assert.strictEqual(requests.length, 1);
    });

    test("does not follow redirects", async () => {
        await assert.rejects(
            runner().fetch(`${baseUrl}/redirect`, profile(), "text/plain"),
            /Redirects/,
        );
        assert.deepStrictEqual(requests, ["/redirect"]);
    });

    test("checks the decoded response limit during consumption", async () => {
        await assert.rejects(
            runner().fetch(`${baseUrl}/large`, profile(), "text/plain"),
            /decoded size limit/,
        );
    });

    test("deadline includes streaming body reads", async () => {
        await assert.rejects(
            runner(60).fetch(`${baseUrl}/slow`, profile(), "text/plain"),
            /deadline/,
        );
    });

    test("cancels an active streamed response", async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 50);
        try {
            await assert.rejects(
                runner().fetch(`${baseUrl}/slow`, profile(), "text/plain", controller.signal),
                /cancelled/,
            );
        } finally {
            clearTimeout(timer);
        }
    });

    test("a pre-cancelled request has no network effect", async () => {
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
            runner().fetch(baseUrl, profile(), "text/plain", controller.signal),
            /cancelled/,
        );
        assert.strictEqual(requests.length, 0);
    });

    test("rejects cross-origin, userinfo, fragments, and HTTP secrets before a request", async () => {
        for (const target of [
            "https://example.test/",
            `${baseUrl}/#fragment`,
            baseUrl.replace("//", "//user:secret@"),
        ]) {
            await assert.rejects(
                runner().fetch(target, profile(), "text/plain"),
                (error) => !String(error).includes("secret"),
            );
        }
        await assert.rejects(
            runner().fetch(
                baseUrl,
                { ...profile(), headers: { Authorization: "secret" } },
                "text/plain",
            ),
        );
        await assert.rejects(
            runner().fetch(
                baseUrl,
                {
                    ...profile(),
                    auth: { kind: AuthKind.Basic, username: "test", password: "secret" },
                },
                "text/plain",
            ),
        );
        assert.strictEqual(requests.length, 0);
    });

    test("trust blocks certificate reads and network", async () => {
        let reads = 0;
        const untrusted = new QueryRunner(
            {
                readFile: async () => {
                    reads++;
                    return new Uint8Array();
                },
            },
            undefined,
            () => {
                throw new Error("Trust required");
            },
        );
        await assert.rejects(
            untrusted.fetch(
                "https://example.test/",
                {
                    ...profile(),
                    baseUrl: "https://example.test/",
                    auth: { kind: AuthKind.ClientCert },
                },
                "text/plain",
            ),
            /Trust/,
        );
        assert.strictEqual(reads, 0);
        assert.strictEqual(requests.length, 0);
    });
});
