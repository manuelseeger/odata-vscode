// @ts-check
import * as esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * Prints build boundaries and errors in the format the esbuild problem matcher in
 * .vscode/tasks.json expects.
 * @type {esbuild.Plugin}
 */
const problemMatcher = {
    name: "problem-matcher",
    setup(build) {
        build.onStart(() => {
            console.log("[watch] build started");
        });
        build.onEnd((result) => {
            for (const { text, location } of result.errors) {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            }
            console.log("[watch] build finished");
        });
    },
};

/** @type {esbuild.Plugin} */
const copyWebviewHtml = {
    name: "copy-webview-html",
    setup(build) {
        build.onEnd(async () => {
            await mkdir("dist/webview", { recursive: true });
            await copyFile("src/webview/profileForm.html", "dist/webview/profileForm.html");
        });
    },
};

/** @type {esbuild.BuildOptions} */
const common = {
    bundle: true,
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: "silent",
};

const contexts = await Promise.all([
    esbuild.context({
        ...common,
        entryPoints: ["src/extension.ts"],
        outfile: "dist/extension.js",
        platform: "node",
        target: "node24",
        format: "cjs",
        external: ["vscode"],
        plugins: [problemMatcher],
    }),
    esbuild.context({
        ...common,
        entryPoints: {
            main: "src/webview/main.js",
            "webview.bundle": "src/webview/webview.css",
        },
        outdir: "dist/webview",
        platform: "browser",
        target: "es2022",
        format: "iife",
        loader: { ".ttf": "file" },
        assetNames: "[name]-[hash]",
        plugins: [problemMatcher, copyWebviewHtml],
    }),
]);

if (watch) {
    await Promise.all(contexts.map((context) => context.watch()));
} else {
    const results = await Promise.allSettled(contexts.map((context) => context.rebuild()));
    await Promise.all(contexts.map((context) => context.dispose()));
    if (results.some((result) => result.status === "rejected")) {
        process.exit(1);
    }
}
