export function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function buildPageTitle(label: string, eventSlug?: string) {
  if (!eventSlug) {
    return `${label} | Qianlu Events`;
  }

  return `${label} | ${humanizeSlug(eventSlug)} | Qianlu Events`;
}
