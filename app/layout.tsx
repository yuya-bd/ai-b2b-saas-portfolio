import type { Metadata } from "next";
import { Toaster } from "sonner";
import { APP_NAME } from "@/lib/constants/app";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Multi-tenant B2B application foundation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
