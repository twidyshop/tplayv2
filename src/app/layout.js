import "./globals.css";

export const metadata = {
  title: "TPLAY - Nonton Drama & Anime Gratis",
  description: "Platform streaming drama panjang, anime, dan drama pendek gratis tanpa login.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="bg-[#0b0c10] text-slate-100 antialiased font-sans selection:bg-purple-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
