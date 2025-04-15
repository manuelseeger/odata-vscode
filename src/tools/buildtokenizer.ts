import * as fs from "fs";
import * as path from "path";

import cl100kBase from "tiktoken/encoders/cl100k_base.json";
import { Tiktoken } from "tiktoken/lite";
import { TokenClass } from "../contracts/types";
import { Tokenizer } from "../services/Tokenizer";
import { TokenWeights } from "../contracts/ITokenizer";

interface TestData {
    filename: string;
    content: string;
}
interface ClassSummaryEntry {
    charsHr: string[];
    chars: number[];
    totalAvg: number;
    count: number;
    avgContrib?: number;
}

const testData: TestData[] = [];

/**
 * Compute the average contribution of each character to the token count when tokenizing
 * with tiktoken.
 *
 * We then use this heuristic to approximate the token count of a string. This approximation
 * is ~50% better than using a naive token per character approach.
 */
function main(): void {
    const testDataDir: string = path.join(__dirname, "../test/testdata");
    const files: string[] = fs.readdirSync(testDataDir).filter((file) => file.endsWith("edmx"));
    for (const file of files) {
        const filePath: string = path.join(testDataDir, file);
        const content: string = fs.readFileSync(filePath, "utf8");

        testData.push({ filename: file, content });
    }
    // Analyze tokenization statistics on existing metadata files
    const weights = analyzeTestData();

    // Verify heuristic against tiktoken
    verify(weights);
}

function analyzeTestData(): TokenWeights {
    const encoder = new Tiktoken(
        cl100kBase.bpe_ranks,
        cl100kBase.special_tokens,
        cl100kBase.pat_str,
    );
    const charStats: Record<number, { contribution: number; count: number }> = {};

    for (const { content } of testData) {
        const tokens: Uint32Array = encoder.encode(content);
        for (const token of tokens) {
            const tokenStr = encoder.decode(new Uint32Array([token]));
            const weight = tokenStr.length > 0 ? 1 / tokenStr.length : 0;
            for (const code of tokenStr) {
                if (!charStats[code]) {
                    charStats[code] = { contribution: 0, count: 0 };
                }
                charStats[code].contribution += weight;
                charStats[code].count++;
            }
        }
    }

    let stats = Object.entries(charStats).map(([code, { contribution, count }]) => ({
        ch: Number(code),
        count,
        total: contribution,
        avg: contribution / count,
        classLabel: "",
    }));

    // Determine min/max average and assign one of 8 buckets (Class 1...8)
    const avgValues = stats.map((s) => s.avg);
    const minAvg = Math.min(...avgValues);
    const maxAvg = Math.max(...avgValues);
    const range = maxAvg - minAvg;
    stats = stats.map((s) => {
        const classIndex =
            range === 0 ? 0 : Math.min(7, Math.floor(((s.avg - minAvg) / range) * 8));
        return { ...s, classLabel: `Class ${classIndex + 1}` };
    });

    // Sort descending by average contribution
    stats.sort((a, b) => b.avg - a.avg);

    console.log("Char\tHr\tCount\tTotal\tAvg\tClass");
    for (const stat of stats) {
        const hr = JSON.stringify(String.fromCodePoint(stat.ch));
        console.log(
            `${stat.ch}\t${hr}\t${stat.count}\t${stat.total.toFixed(2)}\t${stat.avg.toFixed(2)}\t${stat.classLabel}`,
        );
    }

    // Group by class and compute summary statistics
    const classSummary: Record<string, ClassSummaryEntry> = {};
    for (const stat of stats) {
        if (!classSummary[stat.classLabel]) {
            classSummary[stat.classLabel] = { charsHr: [], chars: [], totalAvg: 0, count: 0 };
        }
        classSummary[stat.classLabel].charsHr.push(JSON.stringify(String.fromCodePoint(stat.ch)));
        classSummary[stat.classLabel].chars.push(stat.ch);
        classSummary[stat.classLabel].totalAvg += stat.avg;
        classSummary[stat.classLabel].count++;
    }

    // Compute and store average contribution per class once
    for (const key of Object.keys(classSummary)) {
        const cls = classSummary[key];
        cls.avgContrib = cls.totalAvg / cls.count;
    }

    console.log("\n--- Class Summary ---");
    console.log("Class\tCharacters\tAvg Contribution");
    for (const cl of Object.keys(classSummary).sort()) {
        const { charsHr, avgContrib } = classSummary[cl];
        console.log(`${cl}\t[${charsHr.join(", ")}]\t${avgContrib!.toFixed(2)}`);
    }

    const classArray: TokenClass[] = Object.entries(classSummary).map(([classLabel, entry]) => ({
        classLabel,
        characters: entry.chars,
        avgContribution: entry.avgContrib!,
    }));

    const outputPath = path.join(__dirname, "../definitions/tokenClasses.json");
    fs.writeFileSync(outputPath, JSON.stringify(classArray, null, 2));

    // also write an exploded map of character to their class's weight:
    const explodedMapPath = path.join(__dirname, "../definitions/tokenWeights.json");
    const explodedMap: TokenWeights = {};
    for (const cl of classArray) {
        for (const ch of cl.characters) {
            explodedMap[ch] = cl.avgContribution;
        }
    }
    explodedMap["TOTAL"] = classArray.reduce((acc, cl) => acc + cl.avgContribution, 0);
    explodedMap["COUNT"] = classArray.length;
    explodedMap["AVG"] = explodedMap["TOTAL"] / explodedMap["COUNT"];
    fs.writeFileSync(explodedMapPath, JSON.stringify(explodedMap, null, 2));

    return explodedMap;
}

function verify(weights: TokenWeights): void {
    const encoder = new Tiktoken(
        cl100kBase.bpe_ranks,
        cl100kBase.special_tokens,
        cl100kBase.pat_str,
    );
    console.log("\n--- Verification ---");

    const tokenizer = new Tokenizer();
    tokenizer.weights = weights;

    // Compute global benchmark: total tokens / total characters
    let totalTokens = 0,
        totalChars = 0;
    for (const { content } of testData) {
        const tokenCount = encoder.encode(content).length;
        totalTokens += tokenCount;
        totalChars += content.length;
    }
    const globalBenchmark = totalChars ? totalTokens / totalChars : 0;
    console.log(`Global Benchmark (tokens per character): ${globalBenchmark.toFixed(4)}`);

    let totalActual = 0;
    const heuristicPercList: number[] = [];
    const globalPercList: number[] = [];
    testData.forEach(({ filename, content }) => {
        const actual = encoder.encode(content).length;
        totalActual += actual;
        // Use the tokenizer instance to compute the heuristic token count
        const approx = tokenizer.approximateTokenCount(content);
        const heuristicDeviation = approx - actual;
        const heuristicPerc = actual ? Math.abs(heuristicDeviation / actual) * 100 : 0;

        const globalApprox = content.length * globalBenchmark;
        const globalDeviation = globalApprox - actual;
        const globalPerc = actual ? Math.abs(globalDeviation / actual) * 100 : 0;

        heuristicPercList.push(heuristicPerc);
        globalPercList.push(globalPerc);

        console.log(
            `File: ${filename} | Actual: ${actual} | Heuristic Dev%: ${heuristicPerc.toFixed(2)}% | Global Dev%: ${globalPerc.toFixed(2)}%`,
        );
    });

    // Compute average deviation per test file
    const avgHeuristicPerc = heuristicPercList.length
        ? heuristicPercList.reduce((acc, perc) => acc + perc, 0) / heuristicPercList.length
        : 0;
    const avgGlobalPerc = globalPercList.length
        ? globalPercList.reduce((acc, perc) => acc + perc, 0) / globalPercList.length
        : 0;

    console.log("\n--- Final Average Deviation per File ---");
    console.log(`Average Heuristic Dev%: ${avgHeuristicPerc.toFixed(2)}%`);
    console.log(`Average Global Dev%: ${avgGlobalPerc.toFixed(2)}%`);
}

if (require.main === module) {
    main();
}
