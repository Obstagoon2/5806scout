import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages are client components (Firebase Auth runs client-side), but the
  // app is no longer a static export: the Event sync (milestone 5) and
  // Manual Q&A (milestone 8) API routes hold server-side secrets
  // (TBA_API_KEY, ANTHROPIC_API_KEY), so the app needs a Node host —
  // `npm start`, Vercel, or Firebase App Hosting instead of classic
  // static Firebase Hosting.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
