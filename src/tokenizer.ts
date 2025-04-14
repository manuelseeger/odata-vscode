import { TokenWeights } from "./contracts/types";
import * as weights from "./definitions/tokenWeights.json";

const tokenWeights = weights as TokenWeights;
const spaveFollowingSpaceWeight = 0.08;

export function approximateTokenCount(text: string): number {
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
            total += spaveFollowingSpaceWeight;
            continue;
        } else {
            const weight = tokenWeights[char] || tokenWeights["AVG"];
            total += weight;
        }
        prevChar = char;
    }
    return Math.ceil(total);
}
