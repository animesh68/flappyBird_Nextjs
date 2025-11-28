import "./styles/globals.css";
// layout
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
