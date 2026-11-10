import { URI } from "vscode-uri";
import { AuthKind, IProfileAuthentication, Profile, PublicProfile } from "./contracts/types";

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid profile data.");
    }
    return value as Record<string, unknown>;
}

function text(value: unknown, fallback = ""): string {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value !== "string") {
        throw new Error("Invalid profile field.");
    }
    return value;
}

export function parseEndpoint(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("Invalid endpoint URL.");
    }
    if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        value.includes("#") ||
        /^[a-z]+:\/\/[^/?#]*@/i.test(value.trim())
    ) {
        throw new Error("Endpoint must be HTTP or HTTPS without user information or fragments.");
    }
    return url;
}

export function parseHeaders(value: unknown): Record<string, string> {
    const headers: Record<string, string> = Object.create(null);
    for (const [name, raw] of Object.entries(value === undefined ? {} : record(value))) {
        const lower = name.toLowerCase();
        if (
            !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) ||
            [
                "host",
                "connection",
                "content-length",
                "transfer-encoding",
                "upgrade",
                "proxy-authorization",
            ].includes(lower) ||
            lower.startsWith("proxy-") ||
            lower.startsWith("sec-")
        ) {
            throw new Error("Invalid custom header name.");
        }
        if (typeof raw !== "string") {
            throw new Error("Invalid custom header value.");
        }
        const header = raw;
        if (/[^\t\x20-\x7e\x80-\xff]/.test(header)) {
            throw new Error("Invalid custom header value.");
        }
        if (Object.keys(headers).some((key) => key.toLowerCase() === lower)) {
            throw new Error("Duplicate custom header.");
        }
        headers[name] = header;
    }
    return headers;
}

function file(value: unknown): URI | undefined {
    if (value === undefined || value === "") {
        return undefined;
    }
    let uri: URI;
    if (typeof value === "string") {
        if (!value.startsWith("file:") && !value.startsWith("/") && !/^[a-z]:[\\/]/i.test(value)) {
            throw new Error("Certificate paths must be absolute local file paths.");
        }
        uri = value.startsWith("file:") ? URI.parse(value) : URI.file(value);
    } else {
        const data = record(value);
        uri = URI.from({
            scheme: text(data.scheme),
            authority: text(data.authority),
            path: text(data.path),
            query: text(data.query),
            fragment: text(data.fragment),
        });
    }
    if (
        uri.scheme !== "file" ||
        uri.authority ||
        !uri.path.startsWith("/") ||
        uri.query ||
        uri.fragment
    ) {
        throw new Error("Certificate paths must be local file URIs.");
    }
    return uri;
}

export function parseProfile(value: unknown): Profile {
    const data = record(value);
    const name = text(data.name).trim();
    if (!name || name.length > 200 || /[\x00-\x1f]/.test(name)) {
        throw new Error("A valid profile name is required.");
    }
    const baseUrl = text(data.baseUrl).trim();
    const url = parseEndpoint(baseUrl);
    const input = record(data.auth);
    if (!Object.values(AuthKind).includes(input.kind as AuthKind)) {
        throw new Error("Invalid authentication kind.");
    }
    const auth: IProfileAuthentication = { kind: input.kind as AuthKind };
    if (auth.kind === AuthKind.Basic) {
        auth.username = text(input.username);
        auth.password = text(input.password);
        if (auth.username.includes(":")) {
            throw new Error("Basic authentication username cannot contain a colon.");
        }
    } else if (auth.kind === AuthKind.Bearer) {
        auth.token = text(input.token);
        if (/[^\x20-\x7e]/.test(auth.token)) {
            throw new Error("Invalid bearer token.");
        }
    } else if (auth.kind === AuthKind.ClientCert) {
        auth.cert = file(input.cert);
        auth.key = file(input.key);
        auth.pfx = file(input.pfx);
        auth.passphrase = text(input.passphrase);
        if (auth.pfx ? auth.cert || auth.key : !auth.cert || !auth.key) {
            throw new Error("Use either a PFX file or a certificate and key pair.");
        }
    }
    const headers = parseHeaders(data.headers);
    if (
        auth.kind !== AuthKind.None &&
        Object.keys(headers).some((name) => name.toLowerCase() === "authorization")
    ) {
        throw new Error("Use either profile authentication or an Authorization header.");
    }
    if (url.protocol !== "https:" && (auth.kind !== AuthKind.None || Object.keys(headers).length)) {
        throw new Error("Authentication and custom headers require HTTPS.");
    }
    const metadata = text(data.metadata);
    return { name, baseUrl, auth, headers, metadata: metadata || undefined };
}

export function publicProfile(profile: Profile): PublicProfile {
    const { password: _password, token: _token, passphrase: _passphrase, ...auth } = profile.auth;
    return { ...profile, auth, headers: {} };
}
