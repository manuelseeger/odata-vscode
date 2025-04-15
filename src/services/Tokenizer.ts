import * as fs from "fs";
import * as path from "path";
import { TokenWeights, ITokenizer } from "../contracts/ITokenizer";

/**
 * Approximate the number of tokens in a string using a heuristic based on the
 * average contribution of each character to the token count when tokenizing
 * EDMX files with tiktoken.
 */
export class Tokenizer implements ITokenizer {
    // tiktoken produces very few tokens for continuous whitespace
    private spaceFollowingSpaceWeight = 0.05;
    private _weights: TokenWeights;
    public get weights(): TokenWeights {
        return this._weights;
    }
    public set weights(value: TokenWeights) {
        this._weights = value;
    }
    constructor() {
        // load the weights using fs to ensure the latest file is always read
        const weightsPath = path.join(__dirname, "../", "definitions", "tokenWeights.json");
        const weightsData = fs.readFileSync(weightsPath, "utf8");
        this._weights = JSON.parse(weightsData) as TokenWeights;
    }

    public approximateTokenCount(text: string): number {
        let total = 0;
        let prevChar = 0;
        for (const ch of text) {
            const char = ch.codePointAt(0);
            if (char === undefined) {
                throw new Error(`Invalid character in string: ${ch}`);
            }
            // if both char and prevChar are space,
            // apply the special weight for space following space
            if (char === 32 && prevChar === 32) {
                total += this.spaceFollowingSpaceWeight;
                continue;
            } else {
                const weight = this.weights[char] || this.weights["AVG"];
                total += weight;
            }
            prevChar = char;
        }
        return Math.ceil(total);
    }
}
