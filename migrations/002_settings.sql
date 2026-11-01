-- Informasi usaha untuk invoice (key-value, diisi lewat Pengaturan di aplikasi).
-- Tabel ini juga dibuat otomatis oleh API /api/settings saat pertama dipakai,
-- jadi file ini hanya dokumentasi / untuk database yang dibuat manual.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
