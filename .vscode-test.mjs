import { defineConfig } from "@vscode/test-cli";
import path from "path";

export default defineConfig([
    {
        files: ["out/test/integration/*.test.js"],
        mocha: {
            ui: "tdd",
            timeout: 20000,
        },
		label: "integration",
    },
    {
        files: ["out/test/e2e/*.test.js"],
        mocha: {
            ui: "tdd",
            timeout: 20000,

        },
		
		label: "e2e",
    },
]);
