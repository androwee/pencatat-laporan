-- Skema D1 untuk Pencatat Pelanggan Jasa.
-- Jalankan sekali ke database D1, misal:
--   npx wrangler d1 execute pencatat-laporan --file=migrations/schema.sql
-- atau tempel isi file ini di konsol D1 di Dashboard Cloudflare.
-- Login TIDAK memakai tabel user: kredensial hanya dari env Cloudflare
-- (ADMIN_USERNAME, ADMIN_PASSWORD_HASH, SESSION_SECRET).

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  service_type TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'lunas' CHECK (status IN ('lunas', 'dp', 'belum')),
  job_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_date ON jobs(job_date);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- Informasi usaha untuk invoice (key-value, diisi lewat Pengaturan di aplikasi).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
