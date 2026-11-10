import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const archive = process.argv[2];
assert(archive, "Supply the VSIX file path.");
const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" }).trim().split("\n");
const files = new Set(entries);
const read = (name) =>
    execFileSync("unzip", ["-p", archive, name], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
const manifest = JSON.parse(read("extension/package.json"));
const requireFile = (name) => {
    const normalized = path.posix.normalize(name.replace(/^\.\//, ""));
    assert(
        !normalized.startsWith("../") && !path.posix.isAbsolute(normalized),
        `Unsafe resource path ${name}`,
    );
    assert(files.has(`extension/${normalized}`), `Missing contributed resource ${normalized}`);
};
requireFile(manifest.main);
requireFile(manifest.icon);
function resources(value) {
    if (!value || typeof value !== "object") {
        return;
    }
    for (const [key, item] of Object.entries(value)) {
        if (
            ["path", "configuration", "icon", "light", "dark"].includes(key) &&
            typeof item === "string" &&
            !item.startsWith("$(")
        ) {
            requireFile(item);
        } else {
            resources(item);
        }
    }
}
resources(manifest.contributes);
for (const resource of [
    "dist/webview/main.js",
    "dist/webview/webview.bundle.css",
    "dist/webview/profileForm.html",
]) {
    requireFile(resource);
}
const css = read("extension/dist/webview/webview.bundle.css");
const fonts = [...css.matchAll(/url\((?:["']?)([^)"']+)(?:["']?)\)/g)].map((match) => match[1]);
assert(
    fonts.some((font) => /\.(ttf|woff2?)(?:\?|$)/.test(font)),
    "The webview font must be packaged.",
);
for (const font of fonts) {
    if (font.startsWith("data:")) {
        continue;
    }
    assert(!/^(?:https?:|\/\/)/.test(font), "Webview resources must be local.");
    requireFile(path.posix.join("dist/webview", font.split("?")[0]));
}
for (const entry of entries) {
    assert(
        !/(?:^|\/)(?:\.pi|\.git|\.github|\.vscode|\.vscode-test|src|scripts|docs|node_modules|out|coverage|test|tests|testdata|\.artifacts|\.secrets)(?:\/|$)/.test(
            entry,
        ),
        `Development file in VSIX ${entry}`,
    );
    assert(
        !/(?:\.map|\.ts|\.vsix|\.pem|\.key|\.pfx|\.p12|\.private\.edmx)$|(?:^|\/)\.env/.test(entry),
        `Private or source file in VSIX ${entry}`,
    );
    assert(
        !/(?:^|\/)(?:webpack\.config\.js|mise\.toml|package-lock\.json|\.nvmrc|tsconfig\.json|eslint\.config\.mjs|\.prettierrc|\.vscode-test\.[^/]+)$|\.(?:test|spec)\.[cm]?js$/.test(
            entry,
        ),
        `Development file in VSIX ${entry}`,
    );
    assert(!entry.includes("..") && !entry.startsWith("/"), `Unsafe archive path ${entry}`);
    if (!entry.endsWith("/") && /\.(?:js|json|html|css|md|txt)$/.test(entry)) {
        assert(
            !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(read(entry)),
            `Private key in ${entry}`,
        );
    }
}
console.log(`Validated ${archive} with ${entries.length} entries and all contributed resources.`);
