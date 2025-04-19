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
    url = url.trim();
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

export function combineODataUrl(input: string): string {
    // Remove line breaks and condense to a single line
    const singleLine: string = input.replace(/\s*\n\s*/g, "");

    // Split the URL into host/resource path and query parameters
    let [baseUrl, queryParams] = singleLine.split("?");

    // Remove all whitespace from the base URL
    const cleanedBaseUrl: string = baseUrl.replace(/\s+/g, "");

    let formattedParams: string = "";
    if (queryParams) {
        // Trim and normalize query parameters
        formattedParams = queryParams
            .split("&")
            .map((param) => param.trim())
            .map((param) => {
                let [key, value] = param.split("=");
                // Handle cases where key or value might be undefined
                key = key ? key.trim() : "";
                value = value ? value.trim() : "";
                const trimmedKey: string = key.trim();
                const trimmedValue: string = value.trim().replace(/\s+/g, " "); // Condense whitespace
                return `${trimmedKey}=${trimmedValue}`;
            })
            .join("&");
        formattedParams = `?${formattedParams}`;
    }

    // Combine the cleaned base URL and formatted query parameters
    return `${cleanedBaseUrl}${formattedParams}`;
}
