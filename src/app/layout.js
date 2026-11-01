import "./globals.css";

export const metadata = {
  title: "Pencatat Pelanggan Jasa",
  description: "Pencatat pelanggan jasa dan laporan pemasukan harian sampai bulanan.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
