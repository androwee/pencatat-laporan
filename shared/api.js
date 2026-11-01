// Core API untuk Pencatat Pelanggan Jasa.
// Dijalankan di Cloudflare Pages Functions (runtime Workers).
// Satu-satunya sumber login adalah environment variable Cloudflare,
// TIDAK ada tabel user di D1 dan TIDAK ada kredensial di repo ini.
//
// Env yang wajib di-set di Dashboard Pages (Settings > Functions):
//   ADMIN_USERNAME       (Variable, contoh: andro)
//   ADMIN_PASSWORD_HASH  (Secret, SHA-256 hex dari password, lihat README)
//   SESSION_SECRET       (Secret, string acak, contoh hasil `openssl rand -hex 32`)
// Opsional (fallback, kurang disarankan dibanding hash):
//   ADMIN_PASSWORD       (Secret, password mentah — hanya dipakai bila
//                          ADMIN_PASSWORD_HASH tidak di-set)

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 hari, dalam detik
const STATUSES = ["lunas", "dp", "belum"];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function textEncoder() {
  return new TextEncoder();
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Perbandingan string yang tidak bocor lewat timing secara kasar.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseCookies(request) {
  const out = {};
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

async function makeSessionToken(env, username) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${encodeURIComponent(username)}.${exp}`;
  const sig = await hmacHex(env.SESSION_SECRET, payload);
  return `${payload}.${sig}`;
}

async function verifySession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedUser, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const payload = `${encodedUser}.${expStr}`;
  const expected = await hmacHex(env.SESSION_SECRET, payload);
  if (!safeEqual(sig, expected)) return null;
  return decodeURIComponent(encodedUser);
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function readJson(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function isValidDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function todayId() {
  // Tanggal WIB (UTC+7) untuk default form, tanpa library tambahan.
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // hari terakhir bulan itu
  return { from: start, to: endDate };
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function dbMissingTableError(err) {
  return err && /no such table/i.test(String(err.message || err));
}

async function qAll(env, sql, ...params) {
  try {
    const res = await env.DB.prepare(sql).bind(...params).all();
    return res.results || [];
  } catch (err) {
    if (dbMissingTableError(err)) {
      const e = new Error("Tabel D1 belum dibuat. Jalankan migrations/schema.sql ke database D1 (lihat README).");
      e.status = 500;
      throw e;
    }
    throw err;
  }
}

async function qFirst(env, sql, ...params) {
  const rows = await qAll(env, sql, ...params);
  return rows[0] || null;
}

async function qRun(env, sql, ...params) {
  try {
    return await env.DB.prepare(sql).bind(...params).run();
  } catch (err) {
    if (dbMissingTableError(err)) {
      const e = new Error("Tabel D1 belum dibuat. Jalankan migrations/schema.sql ke database D1 (lihat README).");
      e.status = 500;
      throw e;
    }
    throw err;
  }
}

export async function handleApi(request, env) {
  try {
    if (!env.DB) {
      return json({ error: "Binding D1 belum di-set. Di Dashboard Pages, tambahkan D1 binding dengan nama variabel DB." }, 500);
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    // ---- Login: satu-satunya endpoint publik ----
    if (path === "/api/login" && method === "POST") {
      if (!env.ADMIN_USERNAME || !env.SESSION_SECRET || (!env.ADMIN_PASSWORD_HASH && !env.ADMIN_PASSWORD)) {
        return json({ error: "Login belum dikonfigurasi. Set ADMIN_USERNAME, ADMIN_PASSWORD_HASH, dan SESSION_SECRET di Cloudflare (lihat README)." }, 503);
      }
      const body = await readJson(request);
      if (!body) return json({ error: "Body JSON tidak valid." }, 400);
      const usernameOk = safeEqual(String(body.username || ""), String(env.ADMIN_USERNAME));
      let passwordOk = false;
      if (env.ADMIN_PASSWORD_HASH) {
        passwordOk = safeEqual(await sha256Hex(String(body.password || "")), String(env.ADMIN_PASSWORD_HASH));
      } else {
        passwordOk = safeEqual(String(body.password || ""), String(env.ADMIN_PASSWORD));
      }
      if (!usernameOk || !passwordOk) {
        return json({ error: "Username atau password salah." }, 401);
      }
      const token = await makeSessionToken(env, String(env.ADMIN_USERNAME));
      return json({ ok: true, username: String(env.ADMIN_USERNAME) }, 200, {
        "Set-Cookie": sessionCookie(token, SESSION_MAX_AGE),
      });
    }

    if (path === "/api/logout" && method === "POST") {
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }

    // ---- Semua endpoint lain wajib login ----
    const username = await verifySession(request, env);
    if (!username) return json({ error: "Belum login." }, 401);

    if (path === "/api/me" && method === "GET") {
      return json({ username });
    }

    // ---- Pengaturan usaha (key-value di D1, bukan env) ----
    if (path === "/api/settings" && (method === "GET" || method === "PUT")) {
      await qRun(env, "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')");
      if (method === "GET") {
        const rows = await qAll(env, "SELECT key, value FROM settings");
        const settings = {};
        rows.forEach((r) => { settings[r.key] = r.value; });
        return json({ settings });
      }
      const body = await readJson(request);
      if (!body) return json({ error: "Body JSON tidak valid." }, 400);
      const allowed = ["business_name", "business_address", "business_phone", "business_website"];
      for (const key of allowed) {
        if (key in body) {
          const value = String(body[key] || "").trim();
          if (value.length > 200) return json({ error: `Isi ${key} maksimal 200 karakter.` }, 400);
          await qRun(env, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
        }
      }
      const rows = await qAll(env, "SELECT key, value FROM settings");
      const settings = {};
      rows.forEach((r) => { settings[r.key] = r.value; });
      return json({ settings });
    }

    // ---- Pelanggan ----
    if (path === "/api/customers" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      const rows = q
        ? await qAll(env, "SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name COLLATE NOCASE ASC LIMIT 200", `%${q}%`, `%${q}%`)
        : await qAll(env, "SELECT * FROM customers ORDER BY name COLLATE NOCASE ASC LIMIT 500");
      return json({ customers: rows });
    }

    if (path === "/api/customers" && method === "POST") {
      const body = await readJson(request);
      const name = (body?.name || "").trim();
      if (!name) return json({ error: "Nama pelanggan wajib diisi." }, 400);
      const now = new Date().toISOString();
      const res = await qRun(
        env,
        "INSERT INTO customers (name, address, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        name, (body.address || "").trim(), (body.phone || "").trim(), now, now,
      );
      const row = await qFirst(env, "SELECT * FROM customers WHERE id = ?", res.meta.last_row_id);
      return json({ customer: row }, 201);
    }

    // ---- Hapus massal ----
    if (path === "/api/customers/bulk-delete" && method === "POST") {
      const body = await readJson(request);
      const ids = [...new Set((body?.ids || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
      if (!ids.length || ids.length > 200) return json({ error: "Pilih 1–200 pelanggan." }, 400);
      const ph = ids.map(() => "?").join(",");
      // Hitung dulu (bukan meta.changes, yang di runtime D1 tidak selalu terisi untuk DELETE).
      const nJobs = (await qFirst(env, `SELECT COUNT(*) AS n FROM jobs WHERE customer_id IN (${ph})`, ...ids))?.n || 0;
      const nCust = (await qFirst(env, `SELECT COUNT(*) AS n FROM customers WHERE id IN (${ph})`, ...ids))?.n || 0;
      await qRun(env, `DELETE FROM jobs WHERE customer_id IN (${ph})`, ...ids);
      await qRun(env, `DELETE FROM customers WHERE id IN (${ph})`, ...ids);
      return json({ ok: true, deleted_customers: nCust, deleted_jobs: nJobs });
    }

    if (path === "/api/jobs/bulk-delete" && method === "POST") {
      const body = await readJson(request);
      const ids = [...new Set((body?.ids || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
      if (!ids.length || ids.length > 200) return json({ error: "Pilih 1–200 transaksi." }, 400);
      const ph = ids.map(() => "?").join(",");
      const n = (await qFirst(env, `SELECT COUNT(*) AS n FROM jobs WHERE id IN (${ph})`, ...ids))?.n || 0;
      await qRun(env, `DELETE FROM jobs WHERE id IN (${ph})`, ...ids);
      return json({ ok: true, deleted_jobs: n });
    }

    const customerIdMatch = path.match(/^\/api\/customers\/(\d+)$/);
    if (customerIdMatch) {
      const id = Number(customerIdMatch[1]);
      if (method === "PUT") {
        const body = await readJson(request);
        const name = (body?.name || "").trim();
        if (!name) return json({ error: "Nama pelanggan wajib diisi." }, 400);
        await qRun(env, "UPDATE customers SET name = ?, address = ?, phone = ?, updated_at = ? WHERE id = ?",
          name, (body.address || "").trim(), (body.phone || "").trim(), new Date().toISOString(), id);
        const row = await qFirst(env, "SELECT * FROM customers WHERE id = ?", id);
        if (!row) return json({ error: "Pelanggan tidak ditemukan." }, 404);
        return json({ customer: row });
      }
      if (method === "DELETE") {
        await qRun(env, "DELETE FROM jobs WHERE customer_id = ?", id);
        await qRun(env, "DELETE FROM customers WHERE id = ?", id);
        return json({ ok: true });
      }
    }

    // ---- Transaksi jasa (pemasukan) ----
    if (path === "/api/jobs" && method === "GET") {
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      const customerId = url.searchParams.get("customer_id") || "";
      const status = url.searchParams.get("status") || "";
      let sql = `SELECT j.*, c.name AS customer_name, c.phone AS customer_phone
                 FROM jobs j JOIN customers c ON c.id = j.customer_id WHERE 1 = 1`;
      const params = [];
      if (from && isValidDate(from)) { sql += " AND j.job_date >= ?"; params.push(from); }
      if (to && isValidDate(to)) { sql += " AND j.job_date <= ?"; params.push(to); }
      if (customerId) { sql += " AND j.customer_id = ?"; params.push(Number(customerId)); }
      if (STATUSES.includes(status)) { sql += " AND j.status = ?"; params.push(status); }
      sql += " ORDER BY j.job_date DESC, j.id DESC LIMIT 1000";
      return json({ jobs: await qAll(env, sql, ...params) });
    }

    if (path === "/api/jobs" && method === "POST") {
      const body = await readJson(request);
      const customerId = Number(body?.customer_id);
      const serviceType = (body?.service_type || "").trim();
      const amount = Number(body?.amount);
      const jobDate = body?.job_date || todayId();
      const status = body?.status || "lunas";
      if (!customerId) return json({ error: "Pilih pelanggan dulu." }, 400);
      if (!serviceType) return json({ error: "Jenis jasa wajib diisi." }, 400);
      if (!Number.isSafeInteger(amount) || amount < 0) return json({ error: "Nominal harus angka >= 0." }, 400);
      if (!isValidDate(jobDate)) return json({ error: "Tanggal tidak valid (YYYY-MM-DD)." }, 400);
      if (!STATUSES.includes(status)) return json({ error: "Status tidak valid." }, 400);
      const customer = await qFirst(env, "SELECT id FROM customers WHERE id = ?", customerId);
      if (!customer) return json({ error: "Pelanggan tidak ditemukan." }, 404);
      const now = new Date().toISOString();
      const res = await qRun(env,
        "INSERT INTO jobs (customer_id, service_type, amount, status, job_date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        customerId, serviceType, amount, status, jobDate, (body.note || "").trim(), now, now);
      const row = await qFirst(env, "SELECT * FROM jobs WHERE id = ?", res.meta.last_row_id);
      return json({ job: row }, 201);
    }

    const jobIdMatch = path.match(/^\/api\/jobs\/(\d+)$/);
    if (jobIdMatch) {
      const id = Number(jobIdMatch[1]);
      if (method === "PUT") {
        const body = await readJson(request);
        const serviceType = (body?.service_type || "").trim();
        const amount = Number(body?.amount);
        const jobDate = body?.job_date || "";
        const status = body?.status || "";
        if (!serviceType || !Number.isSafeInteger(amount) || amount < 0 || !isValidDate(jobDate) || !STATUSES.includes(status)) {
          return json({ error: "Data transaksi tidak valid." }, 400);
        }
        await qRun(env, "UPDATE jobs SET service_type = ?, amount = ?, status = ?, job_date = ?, note = ?, updated_at = ? WHERE id = ?",
          serviceType, amount, status, jobDate, (body.note || "").trim(), new Date().toISOString(), id);
        const row = await qFirst(env, "SELECT * FROM jobs WHERE id = ?", id);
        if (!row) return json({ error: "Transaksi tidak ditemukan." }, 404);
        return json({ job: row });
      }
      if (method === "DELETE") {
        await qRun(env, "DELETE FROM jobs WHERE id = ?", id);
        return json({ ok: true });
      }
    }

    // ---- Laporan pemasukan ----
    if (path === "/api/reports" && method === "GET") {
      const period = url.searchParams.get("period") || "monthly";
      let from = url.searchParams.get("from") || "";
      let to = url.searchParams.get("to") || "";
      if (period === "daily") {
        const date = url.searchParams.get("date") || todayId();
        if (!isValidDate(date)) return json({ error: "Tanggal tidak valid." }, 400);
        from = date; to = date;
      } else if (period === "monthly") {
        const month = url.searchParams.get("month") || todayId().slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: "Bulan tidak valid (YYYY-MM)." }, 400);
        ({ from, to } = monthRange(month));
      } else {
        if (!isValidDate(from) || !isValidDate(to)) return json({ error: "Rentang from/to tidak valid." }, 400);
      }
      const totals = await qFirst(env,
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(amount), 0) AS total,
                COALESCE(SUM(CASE WHEN status = 'lunas' THEN amount ELSE 0 END), 0) AS total_lunas,
                COALESCE(SUM(CASE WHEN status = 'dp' THEN amount ELSE 0 END), 0) AS total_dp,
                COALESCE(SUM(CASE WHEN status = 'belum' THEN amount ELSE 0 END), 0) AS total_belum
         FROM jobs WHERE job_date BETWEEN ? AND ?`, from, to);
      const byService = await qAll(env,
        `SELECT service_type, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM jobs WHERE job_date BETWEEN ? AND ? GROUP BY service_type ORDER BY total DESC`, from, to);
      const jobs = await qAll(env,
        `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id = j.customer_id
         WHERE j.job_date BETWEEN ? AND ? ORDER BY j.job_date DESC, j.id DESC`, from, to);
      return json({ from, to, totals, by_service: byService, jobs });
    }

    // ---- Ekspor CSV laporan ----
    if (path === "/api/export" && method === "GET") {
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      if (!isValidDate(from) || !isValidDate(to)) return json({ error: "Rentang from/to tidak valid." }, 400);
      const jobs = await qAll(env,
        `SELECT j.job_date, c.name AS customer_name, c.phone, j.service_type, j.amount, j.status, j.note
         FROM jobs j JOIN customers c ON c.id = j.customer_id
         WHERE j.job_date BETWEEN ? AND ? ORDER BY j.job_date ASC, j.id ASC`, from, to);
      const lines = ["tanggal,nama_pelanggan,telepon_wa,jenis_jasa,nominal_rp,status,catatan"];
      for (const j of jobs) {
        lines.push([j.job_date, j.customer_name, j.phone, j.service_type, j.amount, j.status, j.note].map(csvEscape).join(","));
      }
      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="laporan-${from}-sampai-${to}.csv"`,
        },
      });
    }

    return json({ error: "Endpoint tidak ditemukan." }, 404);
  } catch (err) {
    return json({ error: err?.message || "Terjadi kesalahan server." }, err?.status || 500);
  }
}
