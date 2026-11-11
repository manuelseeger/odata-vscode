import * as assert from "assert";
import { AuthKind } from "../../contracts/types";
import { parseEndpoint, parseProfile, publicProfile } from "../../profileData";

suite("Profile boundary", () => {
    const profile = {
        name: "Test",
        baseUrl: "https://example.test/service",
        auth: { kind: AuthKind.None },
        headers: {},
    };

    test("rejects unknown profile shapes", () => {
        for (const input of [
            undefined,
            null,
            [],
            {},
            { ...profile, name: "" },
            { ...profile, auth: { kind: "unknown" } },
            { ...profile, metadata: {} },
            { ...profile, headers: [] },
        ]) {
            assert.throws(() => parseProfile(input));
        }
    });

    test("rejects unsafe endpoints without echoing credentials", () => {
        for (const url of [
            "file:///tmp/data",
            "https://user:secret@example.test/",
            "https://example.test/#fragment",
            "https://example.test/#",
            "https://@example.test/",
            "invalid",
        ]) {
            assert.throws(
                () => parseEndpoint(url),
                (error) => !String(error).includes("secret"),
            );
        }
    });

    test("allows anonymous HTTP but rejects HTTP credentials and custom headers", () => {
        assert.strictEqual(
            parseProfile({ ...profile, baseUrl: "http://192.0.2.1/service" }).auth.kind,
            AuthKind.None,
        );
        assert.throws(() =>
            parseProfile({
                ...profile,
                baseUrl: "http://192.0.2.1/service",
                headers: { Test: "value" },
            }),
        );
        assert.throws(() =>
            parseProfile({
                ...profile,
                baseUrl: "http://192.0.2.1/service",
                auth: { kind: AuthKind.Basic, username: "test", password: "secret" },
            }),
        );
    });

    test("rejects invalid and transport-control headers", () => {
        for (const headers of [
            { "Bad Name": "x" },
            { Test: "x\r\nInjected: x" },
            { Host: "example.test" },
            { "Content-Length": "10" },
            { test: 10 },
            { test: "x", Test: "y" },
        ]) {
            assert.throws(() => parseProfile({ ...profile, headers }));
        }
        assert.strictEqual(
            parseProfile({ ...profile, headers: { "X-Key": '"<value>"' } }).headers["X-Key"],
            '"<value>"',
        );
    });

    test("accepts only local file URIs and complete certificate combinations", () => {
        for (const auth of [
            { kind: AuthKind.ClientCert },
            { kind: AuthKind.ClientCert, cert: "file:///tmp/test.pem" },
            { kind: AuthKind.ClientCert, pfx: "https://example.test/test.pfx" },
            { kind: AuthKind.ClientCert, pfx: "file:///tmp/test.pfx", key: "file:///tmp/test.key" },
        ]) {
            assert.throws(() => parseProfile({ ...profile, auth }));
        }
        const parsed = parseProfile({
            ...profile,
            auth: { kind: AuthKind.ClientCert, pfx: "file:///tmp/test%20file.pfx" },
        });
        assert.strictEqual(parsed.auth.pfx?.fsPath, "/tmp/test file.pfx");
    });

    test("public profile contains no custom header values or authentication secrets", () => {
        const parsed = parseProfile({
            ...profile,
            headers: { "X-Key": "header-secret" },
            auth: { kind: AuthKind.Basic, username: "test", password: "password-secret" },
        });
        const safe = publicProfile(parsed);
        assert.deepStrictEqual(safe.headers, {});
        assert.ok(!JSON.stringify(safe).includes("secret"));
    });
});
