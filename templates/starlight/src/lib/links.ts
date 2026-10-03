const EXTERNAL_URL = /^https?:\/\//;

export function isExternalUrl(href: string | undefined): boolean {
  return Boolean(href && EXTERNAL_URL.test(href));
}
