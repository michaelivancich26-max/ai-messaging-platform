import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Grounds for Debate",
  description: "AI fact-checked debate platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Grounds for Debate",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#ffffff",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.theme==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="fixed inset-x-0 top-0 h-dvh overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
