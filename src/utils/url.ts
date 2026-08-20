/** Strip the http(s):// scheme from a URL, leaving the bare domain + path. */
export const stripProtocol = (url: string): string => url.replace(/^https?:\/\//, '');

/**
 * Returns true only for http/https URLs. Use before rendering user-supplied
 * URLs as <a href> to block javascript: and data: URIs.
 */
export const isSafeUrl = (url: string): boolean => /^https?:\/\//i.test(url);
