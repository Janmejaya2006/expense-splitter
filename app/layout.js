import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata = {
  title: "Expense Split + Receipt OCR",
  description: "Full-stack app to split expenses, parse receipts, and generate settlements.",
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
