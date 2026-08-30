export function getApiUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    return window.location.origin;
  }

  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export function getWebSocketApiUrl(path: string): string {
  return `${getApiUrl().replace(/^http/, "ws")}${path}`;
}
