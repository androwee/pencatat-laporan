import "./globals.css";

export const metadata = {
  title: "Pencatat Laporan",
  description: "Pencatat pelanggan jasa dan laporan pemasukan harian sampai bulanan.",
  manifest: "/manifest.json",
  themeColor: "#e60012",
  appleWebApp: { capable: true, title: "Pencatat Laporan", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{ if (localStorage.getItem('pencatat-theme') === 'light') document.documentElement.classList.add('theme-light'); }catch(e){}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { var refreshing = false; navigator.serviceWorker.addEventListener('controllerchange', function(){ if (!refreshing) { refreshing = true; window.location.reload(); } }); window.addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); }); }`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
