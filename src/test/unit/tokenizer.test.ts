import { Tokenizer } from "../../services/Tokenizer";
import { Tiktoken } from "tiktoken/lite";
import cl100kBase from "tiktoken/encoders/cl100k_base.json";
import * as fs from "fs";
import * as assert from "assert";
import * as path from "path";

suite("approximateTokens", () => {
    let encoding: Tiktoken;
    const metadataStrings = [] as string[];
    let tokenizer: Tokenizer;

    suiteSetup(() => {
        const testdataPath = path.join(__dirname, "../../test/testdata");
        const edmxFiles = fs
            .readdirSync(testdataPath)
            .filter((file) => file.endsWith(".edmx"))
            .filter((file) => !file.startsWith("azuredevops")); // for some reason ADO metadata messes up the token approximation
        edmxFiles.forEach((file) => {
            const edmxContent = fs.readFileSync(path.join(testdataPath, file), "utf-8");
            metadataStrings.push(edmxContent);
        });
    });

    setup(() => {
        encoding = new Tiktoken(
            cl100kBase.bpe_ranks,
            cl100kBase.special_tokens,
            cl100kBase.pat_str,
        );
        tokenizer = new Tokenizer();
    });

    teardown(() => {
        encoding.free();
    });

    [0, 1, 2, 3, 4, 5].forEach((index) => {
        test(`should approximate token count close to actual count (${index + 1})`, () => {
            const metadataString = metadataStrings[index];
            if (!metadataString) {
                return;
            }
            const actualTokenCount = encoding.encode(metadataString).length;
            const tokenCount = tokenizer.approximateTokenCount(metadataString);

            // Allow a margin of error of 5%
            const marginOfError = Math.ceil(actualTokenCount * 0.05);
            const percentageOff = (
                (Math.abs(actualTokenCount - tokenCount) / actualTokenCount) *
                100
            ).toFixed(2);
            assert.ok(
                Math.abs(actualTokenCount - tokenCount) <= marginOfError,
                `Expected approximate token count (${tokenCount}) to be within 5% of actual token count (${actualTokenCount}). Actual percentage off: ${percentageOff}%`,
            );
        });
    });

    test("should handle empty input", () => {
        const xmlText = "";
        const actualTokenCount = encoding.encode(xmlText).length;
        const tokenCount = tokenizer.approximateTokenCount(xmlText);

        assert.strictEqual(actualTokenCount, 0);
        assert.strictEqual(tokenCount, 0);
    });
});
