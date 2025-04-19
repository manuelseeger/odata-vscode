/**
 * Interface for a tokenizer that provides methods to estimate the number of tokens in a given text.
 */
export interface ITokenizer {
    /**
     * Approximates the number of tokens in the provided text.
     * @param text - The input text to analyze.
     * @returns The estimated token count.
     */
    approximateTokenCount: (text: string) => number;
}

/**
 * Represents a mapping of token parts (characters) to their respective weights when tokenizing.
 */
export interface TokenWeights {
    /**
     * A dictionary where the key is the character and the value is its weight.
     */
    [key: string]: number;
}
