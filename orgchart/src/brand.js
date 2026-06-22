// Fixed brand configuration for OrgDraft.
// Edit the values here to match your organization — they apply to the chart on
// screen and to every PNG/SVG export. There is intentionally no in-app UI for this.
//
//   accent   - left spine on current roles + connector accents (hex)
//   proposed - color for not-yet-hired roles (hex)
//   title    - text shown in the export header (set "" to hide)
//   logo     - a data: URL for the logo shown in the export header, or null.
//              Use a base64 data URL so exports stay self-contained (no network,
//              no canvas tainting). To generate one from an image file:
//                  base64 -w0 logo.png   ->  prefix with "data:image/png;base64,"
//              logoW/logoH set its drawn size in px (keep the logo's aspect ratio).

export const BRAND = {
  accent: "#04103f",
  proposed: "#057eb6",
  title: "",
  logo: null,
  logoW: 120,
  logoH: 40,
};

// Shape the BRAND config into the object the renderer expects.
export function brandingForRender() {
  return {
    accent: BRAND.accent,
    proposed: BRAND.proposed,
    title: BRAND.title,
    logo: BRAND.logo ? { dataURL: BRAND.logo, w: BRAND.logoW, h: BRAND.logoH } : null,
  };
}
