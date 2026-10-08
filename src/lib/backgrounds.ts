const params = "?auto=format&fit=crop&w=1920&q=80";

export const BACKGROUNDS = {
  auth: `https://images.unsplash.com/photo-1523050854058-8df90110c9f1${params}`,
  landing: `https://images.unsplash.com/photo-1541339907198-e08756dedf3f${params}`,
  landingAlt: `https://images.unsplash.com/photo-1562774053-701939374585${params}`,
  notFound: `https://images.unsplash.com/photo-1524178232363-1fb2b075b655${params}`,
  mainLight: `https://images.unsplash.com/photo-1579546929518-9e396f3cc809${params}`,
  mainDark: `https://images.unsplash.com/photo-1557683316-973673baf926${params}`,
  loginPanel: `https://images.unsplash.com/photo-1541339907198-e08756dedf3f${params}`,
  dashboardAttendance: `https://images.unsplash.com/photo-1523050854058-8df90110c9f1${params}`,
  dashboardUnpaid: `https://images.unsplash.com/photo-1524178232363-1fb2b075b655${params}`,
  dashboardPaid: `https://images.unsplash.com/photo-1562774053-701939374585${params}`,
  dashboardWaived: `https://images.unsplash.com/photo-1541339907198-e08756dedf3f${params}`,
} as const;


/** Portrait derivatives give mobile browsers a deliberate crop at a suitable size. */
export const BACKGROUND_MOBILE = Object.fromEntries(
  Object.entries(BACKGROUNDS).map(([key, url]) => [
    key,
    url.replace(/\?.*$/, "?auto=format&fit=crop&crop=entropy&w=828&h=1792&q=76"),
  ]),
) as Record<keyof typeof BACKGROUNDS, string>;

/** Small, lazy-loaded image derivatives for dashboard cards and secondary images. */
export const BACKGROUND_CARD = Object.fromEntries(
  Object.entries(BACKGROUNDS).map(([key, url]) => [
    key,
    url.replace(/\?.*$/, "?auto=format&fit=crop&crop=entropy&w=640&h=480&q=74"),
  ]),
) as Record<keyof typeof BACKGROUNDS, string>;

export function portraitBackground(image: string): string {
  return image.replace(/\?.*$/, "?auto=format&fit=crop&crop=entropy&w=828&h=1792&q=76");
}
