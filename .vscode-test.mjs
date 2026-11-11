import { defineConfig } from "@vscode/test-cli";

const common = {
    version: process.env.VSCODE_VERSION || "1.146.0",
    useInstallation: process.env.VSCODE_EXECUTABLE
        ? { fromPath: process.env.VSCODE_EXECUTABLE }
        : undefined,
    launchArgs: [
        "--disable-extensions",
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-gpu",
        ...(process.env.VSCODE_HEADLESS === "1" ? ["--ozone-platform=headless"] : []),
    ],
    skipExtensionDependencies: true,
    installExtensions: [],
    mocha: { ui: "tdd", timeout: 20_000 },
};

export default defineConfig([
    { ...common, files: ["out/test/integration/*.test.js"], label: "integration" },
    { ...common, files: ["out/test/e2e/*.test.js"], label: "e2e" },
]);
