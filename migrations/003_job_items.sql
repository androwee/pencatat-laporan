-- Baris layanan per transaksi (multi-layanan + kubikasi/pcs per baris).
-- Dibuat otomatis oleh API saat pertama dipakai; file ini hanya dokumentasi.
CREATE TABLE IF NOT EXISTS job_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  service_type TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '',
  unit_price INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_job_items_job ON job_items(job_id);
