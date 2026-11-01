# Pencatat Pelanggan Jasa

Webapp pribadi untuk mencatat pelanggan jasa dan laporan pemasukan harian sampai bulanan. Dibuat untuk pemakaian sendiri (satu akun), tanpa server/VPS sendiri.

**Stack:** Cloudflare Pages (frontend statis) + Pages Functions (API) + D1 (database SQLite Cloudflare). Semua gratis di paket gratis Cloudflare untuk pemakaian pribadi — Workers 100.000 request/hari, D1 5 juta baris dibaca/hari, 100.000 baris ditulis/hari, storage 5 GB.

## Fitur

- Login satu akun (lihat bagian Login di bawah)
- Data pelanggan: nama, alamat, nomor telepon/WA, cari berdasarkan nama/WA
- Transaksi jasa: pelanggan, jenis jasa, nominal (Rp), tanggal, status (lunas / DP / belum bayar), catatan
- Dashboard: pemasukan hari ini, bulan ini, jumlah pelanggan, transaksi terbaru
- Laporan: harian, bulanan, atau rentang tanggal — total, per status, per jenis jasa, detail transaksi
- Ekspor laporan ke CSV

## Login: hanya dari Cloudflare env

Tidak ada tabel user, tidak ada halaman daftar, dan tidak ada kredensial di repo ini. Login dicek terhadap environment variable yang di-set di Cloudflare saja.

Di Dashboard Pages project ini, buka **Settings > Functions > Environment variables**, lalu set:

| Nama | Jenis | Isi |
|---|---|---|
| `ADMIN_USERNAME` | Variable | Username login, misal `andro` |
| `ADMIN_PASSWORD_HASH` | Secret (terenkripsi) | SHA-256 hex dari password |
| `SESSION_SECRET` | Secret (terenkripsi) | String acak untuk menandatangani cookie sesi |

Buat nilainya di terminal sendiri (jangan kirim password ke chat / commit ke repo):

```bash
# Hash password (ganti PASSWORD_KAMU, tanpa spasi tambahan):
printf '%s' 'PASSWORD_KAMU' | sha256sum

# Secret sesi:
openssl rand -hex 32
```

Sesi berlaku 7 hari lewat cookie HttpOnly. Kalau env belum di-set, halaman login akan menampilkan pesan "Login belum dikonfigurasi" — itu sengaja, bukan bug.

## Deploy (sekali saja)

### 1. Buat database D1

Di Dashboard Cloudflare: **Workers & Pages > D1 > Create**, nama `pencatat-laporan`. Lalu jalankan skema:

```bash
npx wrangler d1 execute pencatat-laporan --file=migrations/schema.sql
```

Alternatif tanpa CLI: tempel isi `migrations/schema.sql` di konsol D1 di dashboard.

### 2. Buat Pages project

**Workers & Pages > Create > Pages > Connect to Git**, pilih repo ini, lalu:

- Framework preset: None
- Build command: (kosongkan)
- Build output directory: `public`

### 3. Binding D1

Di Pages project: **Settings > Functions > D1 database bindings**, tambah binding:

- Variable name: `DB`
- D1 database: `pencatat-laporan`

### 4. Set env login

Seperti tabel di atas, lalu **Retry deployment** (atau deploy ulang) agar env baru aktif.

### 5. Coba

Buka URL Pages project, login dengan username/password yang tadi dibuat, lalu:

1. Tambah 1 pelanggan di tab Pelanggan
2. Tambah 1 transaksi di tab Transaksi
3. Cek tab Dashboard dan Laporan — angkanya harus berubah

## Pengembangan lokal (opsional)

```bash
cp .dev.vars.example .dev.vars   # lalu isi nilai asli di .dev.vars (jangan di-commit)
npx wrangler pages dev public --d1 DB=pencatat-laporan
```

## Backup

Data pelanggan adalah data pribadi. Ekspor CSV dari tab Laporan secara berkala, dan simpan salinannya di tempat aman. Jangan jadikan repo ini publik: repo harus tetap **private**.

## Struktur

```
public/                 Frontend statis (tanpa build step)
  index.html            Satu halaman: login, dashboard, pelanggan, transaksi, laporan
  app.js                Logika frontend (fetch ke /api/*)
  styles.css
functions/api/          Pages Functions, satu file per endpoint
  login.js logout.js me.js customers.js customers/[id].js
  jobs.js jobs/[id].js reports.js export.js
shared/api.js           Seluruh logika API + auth env + query D1 (dipakai semua endpoint)
migrations/schema.sql   Tabel customers dan jobs
wrangler.toml           Konfigurasi Pages (binding D1 di-set lewat dashboard)
```
