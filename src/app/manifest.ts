import type { MetadataRoute } from "next";

// Web app manifest — makes the app installable ("Add to Home Screen") so
// scouts can open it like a native app in the stands, offline included.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FRC Scouting",
    short_name: "Scouting",
    description: "Real-time pit and match scouting for FRC teams.",
    start_url: "/home",
    display: "standalone",
    background_color: "#faf7f5",
    theme_color: "#5e141c",
    icons: [
      {
        src: "/lion-logo.png",
        sizes: "200x200",
        type: "image/png",
      },
    ],
  };
}
