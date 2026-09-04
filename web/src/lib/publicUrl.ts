const DEFAULT_PUBLIC_SITE = "https://www.oribarakah.com";

export const publicSiteUrl = (): string => {
  const configured = String(import.meta.env.VITE_PUBLIC_SITE_URL ?? "").trim();
  return (configured || DEFAULT_PUBLIC_SITE).replace(/\/$/, "");
};

export const publicCreditUrl = (token?: string | null): string =>
  token ? `${publicSiteUrl()}/bill/${encodeURIComponent(token)}` : "";
