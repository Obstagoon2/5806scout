import { AuthProvider } from "@/lib/auth/AuthProvider";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FRC Scouting",
  description: "Real-time pit and match scouting for FRC teams.",
  manifest: "/manifest.webmanifest",
  applicationName: "Scouting",
  // Installed-to-home-screen behavior on iPhone/iPad: run full-screen like a
  // native app with a translucent status bar (paired with viewport-fit=cover
  // and the safe-area padding in globals.css / the header + bottom nav).
  appleWebApp: {
    capable: true,
    title: "Scouting",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/lion-logo.png",
    apple: "/lion-logo.png",
  },
  // Stop iOS Safari from auto-linking match/team numbers as phone numbers.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch/home indicator; components pad with the safe-area
  // insets so nothing important lands beneath them.
  viewportFit: "cover",
  themeColor: "#5e141c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The theme script below may add .dark before hydration.
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved (or system) theme before first paint so dark-mode
            users never see a white flash. Runs before hydration; must stay
            dependency-free and inline. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <RegisterServiceWorker />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
