export function getMetadataUrl(baseUrl: string): string {
    // Normalize the baseUrl by removing trailing slashes
    baseUrl = baseUrl.replace(/\/+$/, "");
    // Check if the URL ends with /$metadata or /$metadata?param=value
    if (/\/\$metadata(\?.*)?$/.test(baseUrl)) {
        return baseUrl;
    }
    const [basePart, queryPart] = baseUrl.split("?");
    // Append /$metadata to the base URL
    return queryPart ? `${basePart}/$metadata?${queryPart}` : `${basePart}/$metadata`;
}

export function getBaseUrl(url: string): string {
    // Normalize the URL by removing trailing slashes
    url = url.replace(/\/+$/, "");
    url = url.replace(/\/\$metadata(\?.*)?$/, "");
    const [basePart, queryPart] = url.split("?");
    // Remove /$metadata and any query parameters following it
    return `${basePart}/`;
}

export function extractCodeBlocks(response: string): string[] {
    const codeBlockRegex =
        /```odata(?:\w+)?[ \t]*\r?\n((?:(?!```[\w]?)[\s\S])*)[ \t\r\n]*```[ \t]*(?:\r?\n|$)/g;

    let match;
    const codeBlocks: string[] = [];

    while ((match = codeBlockRegex.exec(response)) !== null) {
        if (match[1]) {
            codeBlocks.push(match[1].trim());
        }
    }

    return codeBlocks;
}
