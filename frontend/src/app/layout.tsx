import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Multi-Agent Platform",
  description: "Autonomous software engineering with multi-agent pipelines",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode; 
}) { 
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
