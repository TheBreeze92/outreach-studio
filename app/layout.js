import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://outreach-studio-eight.vercel.app";
const TITLE = "Cold Outreach Studio — cold emails built on a real reason to reach out";
const DESCRIPTION = "Upload a LinkedIn PDF. We research the prospect, find a recent signal, and write the email — in about 30 seconds. You verify, you send. 3 free.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Cold Outreach Studio",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
