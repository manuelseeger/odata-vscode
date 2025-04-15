export interface ITokenizer {
    approximateTokenCount: (text: string) => number;
}

export interface TokenWeights {
    [key: string]: number;
}
