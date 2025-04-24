//@ts-check

"use strict";
const CopyPlugin = require("copy-webpack-plugin");
const path = require("path");

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
    target: "node", // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
    mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

    entry: "./src/extension.ts", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: {
        // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, "dist"),
        filename: "extension.js",
        libraryTarget: "commonjs2",
        publicPath: "",
    },
    externals: {
        vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
        // modules added here also need to be added in the .vscodeignore file
    },
    resolve: {
        // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: [".ts", ".js", ".tsx"],
    },
    module: {
        rules: [
            {
                test: /\.tsx$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "ts-loader",
                    },
                ],
            },
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "ts-loader",
                    },
                ],
            },
        ],
    },
    devtool: "nosources-source-map",
    infrastructureLogging: {
        level: "log", // enables logging required for problem matchers
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, "node_modules/@vscode/codicons/dist"),
                    to: path.resolve(__dirname, "dist/modules/@vscode/codicons/dist"),
                },
                {
                    from: path.resolve(
                        __dirname,
                        "node_modules/@vscode-elements/elements-lite/components",
                    ),
                    to: path.resolve(
                        __dirname,
                        "dist/modules/@vscode-elements/elements-lite/components",
                    ),
                },
                {
                    from: path.resolve(__dirname, "src/definitions/odataV2.json"),
                },
                {
                    from: path.resolve(__dirname, "src/definitions/odataV4.json"),
                },
                {
                    from: path.resolve(__dirname, "src/definitions/tokenWeights.json"),
                },
            ],
        }),
    ],
};

const MiniCssExtractPlugin = require("mini-css-extract-plugin");

// Add separate webviewConfig for bundling React UI into assets
/** @type WebpackConfig */
const webviewConfig = {
    target: "web",
    mode: "none",
    entry: {
        styles: "./src/webview/styles.ts",
        main: "./src/webview/main.ts",
    },
    output: {
        path: path.resolve(__dirname, "dist/webview"),
        filename: "index.js",
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: "ts-loader",
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader"],
            },
        ],
    },
    plugins: [new MiniCssExtractPlugin({ filename: "webview.bundle.css" })],
};
// Export both extension and webview configurations
module.exports = [extensionConfig, webviewConfig];
