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

export function combineODataUrl(input: string): string {
    // Join lines. A line break between two tokens becomes a space.
    // A line break after an opening delimiter or before a closing delimiter is removed.
    const singleLine: string = input
        .trim()
        .replace(/\s*\r?\n\s*/g, (match: string, offset: number, whole: string) => {
            const before = whole[offset - 1] ?? "";
            const after = whole[offset + match.length] ?? "";
            return /[(/,=&?]/.test(before) || /[)/,=&?]/.test(after) ? "" : " ";
        });

    // Split the URL into host/resource path and query parameters
    const queryStart = singleLine.indexOf("?");
    const baseUrl = queryStart < 0 ? singleLine : singleLine.slice(0, queryStart);
    const queryParams = queryStart < 0 ? "" : singleLine.slice(queryStart + 1);

    // Remove all whitespace from the base URL
    const cleanedBaseUrl: string = baseUrl.replace(/\s+/g, "");

    let formattedParams: string = "";
    if (queryParams) {
        // Trim and normalize query parameters
        formattedParams = queryParams
            .split("&")
            .map((param) => param.trim())
            .map((param) => {
                const valueStart = param.indexOf("=");
                const key = valueStart < 0 ? param : param.slice(0, valueStart);
                const value = valueStart < 0 ? "" : param.slice(valueStart + 1);
                return `${key.trim()}=${value.trim().replace(/\s+/g, " ")}`;
            })
            .join("&");
        formattedParams = `?${formattedParams}`;
    }

    // Combine the cleaned base URL and formatted query parameters
    return `${cleanedBaseUrl}${formattedParams}`;
}
