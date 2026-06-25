import "./globals.css";

export const metadata = {
  title: "Cold Outreach Studio",
  description: "Turn cold profiles into high-signal outreach using our signature 6-part framework.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
