const $ = (id) => document.getElementById(id);
const fmtRp = (n) => "Rp" + new Intl.NumberFormat("id-ID").format(Number(n || 0));
const today = () => {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

function showError(msg) {
  const el = $("app-error");
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Gagal memuat ${path}`);
  return data;
}

function esc(s) {
  return String(s == null ? "" : s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function pill(status) {
  const cls = status === "lunas" ? "pill-lunas" : status === "dp" ? "pill-dp" : "pill-belum";
  return `<span class="pill ${cls}">${esc(status)}</span>`;
}

function showTab(name) {
  document.querySelectorAll(".dock-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("hidden", s.id !== `tab-${name}`));
  if (name === "dashboard") loadDashboard();
  if (name === "customers") loadCustomers();
  if (name === "jobs") loadJobs();
  if (name === "reports") loadReport();
}

async function loadDashboard() {
  try {
    showError("");
    const month = today().slice(0, 7);
    const [daily, monthly, cust, jobs] = await Promise.all([
      api(`/api/reports?period=daily&date=${today()}`),
      api(`/api/reports?period=monthly&month=${month}`),
      api("/api/customers"),
      api("/api/jobs"),
    ]);
    $("stat-today").textContent = fmtRp(daily.totals.total);
    $("stat-month").textContent = fmtRp(monthly.totals.total);
    $("stat-customers").textContent = cust.customers.length;
    $("stat-jobs").textContent = jobs.jobs.length;
    $("recent-jobs").innerHTML = jobs.jobs.slice(0, 10).map((j) => `<tr><td>${esc(j.job_date)}</td><td>${esc(j.customer_name)}</td><td>${esc(j.service_type)}</td><td>${fmtRp(j.amount)}</td><td>${pill(j.status)}</td></tr>`).join("") || "<tr><td colspan='5'>Belum ada transaksi.</td></tr>";
  } catch (e) { showError(e.message); }
}

async function loadCustomers() {
  try {
    showError("");
    const q = $("customer-search").value.trim();
    const data = await api(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    $("customer-list").innerHTML = data.customers.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.address)}</td><td>${esc(c.phone)}</td><td><button data-edit-customer='${c.id}'>Edit</button> <button data-del-customer='${c.id}' class="secondary">Hapus</button></td></tr>`).join("") || "<tr><td colspan='4'>Belum ada pelanggan.</td></tr>";
    const sel = document.querySelector("#job-form select[name='customer_id']");
    sel.innerHTML = `<option value="">-- pilih pelanggan --</option>` + data.customers.map((c) => `<option value="${c.id}">${esc(c.name)} (${esc(c.phone)})</option>`).join("");
    document.querySelectorAll("[data-edit-customer]").forEach((b) => b.onclick = () => {
      const c = data.customers.find((x) => x.id === Number(b.dataset.editCustomer));
      const f = $("customer-form");
      f.id.value = c.id; f.name.value = c.name; f.address.value = c.address; f.phone.value = c.phone;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.querySelectorAll("[data-del-customer]").forEach((b) => b.onclick = async () => {
      if (!confirm("Hapus pelanggan ini beserta semua transaksinya?")) return;
      await api(`/api/customers/${b.dataset.delCustomer}`, { method: "DELETE" });
      loadCustomers();
    });
  } catch (e) { showError(e.message); }
}

async function loadJobs() {
  try {
    showError("");
    const data = await api("/api/jobs");
    $("job-list").innerHTML = data.jobs.map((j) => `<tr><td>${esc(j.job_date)}</td><td>${esc(j.customer_name)}</td><td>${esc(j.service_type)}</td><td>${fmtRp(j.amount)}</td><td>${pill(j.status)}</td><td><button data-edit-job='${j.id}'>Edit</button> <button data-del-job='${j.id}' class="secondary">Hapus</button></td></tr>`).join("") || "<tr><td colspan='6'>Belum ada transaksi.</td></tr>";
    document.querySelectorAll("[data-edit-job]").forEach((b) => b.onclick = () => {
      const j = data.jobs.find((x) => x.id === Number(b.dataset.editJob));
      const f = $("job-form");
      f.id.value = j.id; f.customer_id.value = j.customer_id; f.service_type.value = j.service_type; f.amount.value = j.amount; f.job_date.value = j.job_date; f.status.value = j.status; f.note.value = j.note || "";
    });
    document.querySelectorAll("[data-del-job]").forEach((b) => b.onclick = async () => {
      if (!confirm("Hapus transaksi ini?")) return;
      await api(`/api/jobs/${b.dataset.delJob}`, { method: "DELETE" });
      loadJobs();
    });
  } catch (e) { showError(e.message); }
}

function reportParams() {
  const period = $("report-period").value;
  if (period === "daily") return { qs: `period=daily&date=${$("report-date").value || today()}`, from: $("report-date").value || today(), to: $("report-date").value || today() };
  if (period === "monthly") return { qs: `period=monthly&month=${$("report-month").value || today().slice(0, 7)}`, from: "", to: "" };
  return { qs: `period=range&from=${$("report-from").value}&to=${$("report-to").value}`, from: $("report-from").value, to: $("report-to").value };
}

let lastReport = null;

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600;
  const h = canvas.height || 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#667085";
  return { ctx, w, h };
}

function drawEmpty(canvas, text) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2);
}

function drawBarChart(canvas, labels, values) {
  if (!values.length || Math.max(...values) === 0) return drawEmpty(canvas, "Belum ada data pada periode ini.");
  const { ctx, w, h } = setupCanvas(canvas);
  const padL = 8, padR = 8, padB = 28, padT = 28, max = Math.max(...values);
  const plotH = h - padT - padB, plotW = w - padL - padR;
  const gap = 6, bw = Math.max(8, (plotW - gap * (values.length - 1)) / values.length);
  ctx.textAlign = "center";
  values.forEach((v, i) => {
    const bh = (v / max) * plotH, x = padL + i * (bw + gap), y = padT + plotH - bh;
    ctx.fillStyle = "#0b6e4f";
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = "#1a1a1a";
    if (bw >= 28) ctx.fillText(fmtRp(v), x + bw / 2, y - 6);
    ctx.fillStyle = "#667085";
    const label = labels[i].slice(5);
    ctx.save();
    ctx.translate(x + bw / 2, h - 8);
    ctx.rotate(-0.5);
    ctx.textAlign = "right";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
}

function drawDonut(canvas, parts) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return drawEmpty(canvas, "Belum ada data pada periode ini.");
  const { ctx, w, h } = setupCanvas(canvas);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 16, inner = r * 0.58;
  let start = -Math.PI / 2;
  parts.forEach((p) => {
    const a = (p.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + a);
    ctx.arc(cx, cy, inner, start + a, start, true);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    start += a;
  });
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.font = "bold 15px system-ui, sans-serif";
  ctx.fillText(fmtRp(total), cx, cy - 2);
  ctx.fillStyle = "#667085";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Total periode", cx, cy + 16);
}

function drawHBarChart(canvas, labels, values) {
  if (!values.length || Math.max(...values) === 0) return drawEmpty(canvas, "Belum ada data pada periode ini.");
  const { ctx, w, h } = setupCanvas(canvas);
  const max = Math.max(...values), rowH = Math.min(36, (h - 16) / values.length);
  values.forEach((v, i) => {
    const y = 8 + i * rowH;
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "left";
    ctx.fillText(labels[i].length > 22 ? labels[i].slice(0, 21) + "…" : labels[i], 4, y + 14);
    const barX = 150, barW = Math.max(0, (w - barX - 90) * (v / max));
    ctx.fillStyle = "#0b6e4f";
    ctx.fillRect(barX, y + 2, barW, 18);
    ctx.fillStyle = "#667085";
    ctx.fillText(fmtRp(v), barX + barW + 6, y + 14);
  });
}

function drawCharts(data) {
  if (!data) return;
  const byDate = {};
  data.jobs.forEach((j) => { byDate[j.job_date] = (byDate[j.job_date] || 0) + Number(j.amount); });
  const dates = Object.keys(byDate).sort();
  drawBarChart($("chart-trend"), dates, dates.map((d) => byDate[d]));
  $("chart-trend-note").textContent = dates.length ? `${dates.length} tanggal dengan pemasukan pada periode ini.` : "";
  const parts = [
    { label: "Lunas", value: Number(data.totals.total_lunas), color: "#0b6e4f" },
    { label: "DP", value: Number(data.totals.total_dp), color: "#dc8a04" },
    { label: "Belum bayar", value: Number(data.totals.total_belum), color: "#b42318" },
  ];
  drawDonut($("chart-status"), parts);
  $("chart-status-legend").innerHTML = parts.map((p) => `<span><i style="background:${p.color}"></i>${p.label}: ${fmtRp(p.value)}</span>`).join("");
  drawHBarChart($("chart-service"), data.by_service.map((r) => r.service_type), data.by_service.map((r) => Number(r.total)));
}

async function loadReport() {
  try {
    showError("");
    const { qs } = reportParams();
    const data = await api(`/api/reports?${qs}`);
    lastReport = data;
    $("report-total").textContent = fmtRp(data.totals.total);
    $("report-lunas").textContent = fmtRp(data.totals.total_lunas);
    $("report-dp").textContent = fmtRp(data.totals.total_dp);
    $("report-belum").textContent = fmtRp(data.totals.total_belum);
    $("report-by-service").innerHTML = data.by_service.map((r) => `<tr><td>${esc(r.service_type)}</td><td>${r.count}</td><td>${fmtRp(r.total)}</td></tr>`).join("") || "<tr><td colspan='3'>Belum ada data.</td></tr>";
    $("report-jobs").innerHTML = data.jobs.map((j) => `<tr><td>${esc(j.job_date)}</td><td>${esc(j.customer_name)}</td><td>${esc(j.service_type)}</td><td>${fmtRp(j.amount)}</td><td>${pill(j.status)}</td></tr>`).join("") || "<tr><td colspan='5'>Belum ada data.</td></tr>";
    drawCharts(data);
    return data;
  } catch (e) { showError(e.message); return null; }
}

document.querySelectorAll(".dock-btn, .dock-logo").forEach((b) => b.onclick = () => showTab(b.dataset.tab));
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (lastReport && !$("tab-reports").classList.contains("hidden")) drawCharts(lastReport); }, 200);
});

$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $("login-error");
  err.classList.add("hidden");
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
    await init();
  } catch (e2) { err.textContent = e2.message; err.classList.remove("hidden"); }
};

$("logout-btn").onclick = async () => { await api("/api/logout", { method: "POST" }).catch(() => {}); location.reload(); };

$("customer-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const id = f.id.value;
  const body = JSON.stringify({ name: f.name.value, address: f.address.value, phone: f.phone.value });
  try {
    await api(id ? `/api/customers/${id}` : "/api/customers", { method: id ? "PUT" : "POST", body });
    f.reset(); f.id.value = "";
    loadCustomers();
  } catch (e2) { showError(e2.message); }
};
$("customer-reset").onclick = () => { const f = $("customer-form"); f.reset(); f.id.value = ""; };
$("customer-search").oninput = () => loadCustomers();

$("job-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const id = f.id.value;
  const body = JSON.stringify({ customer_id: Number(f.customer_id.value), service_type: f.service_type.value, amount: Number(f.amount.value), job_date: f.job_date.value, status: f.status.value, note: f.note.value });
  try {
    await api(id ? `/api/jobs/${id}` : "/api/jobs", { method: id ? "PUT" : "POST", body });
    f.reset(); f.id.value = ""; f.job_date.value = today();
    loadJobs();
  } catch (e2) { showError(e2.message); }
};
$("job-reset").onclick = () => { const f = $("job-form"); f.reset(); f.id.value = ""; f.job_date.value = today(); };

$("report-load").onclick = () => loadReport();
$("report-export").onclick = async () => {
  const data = await loadReport();
  if (!data) return;
  window.location.href = `/api/export?from=${data.from}&to=${data.to}`;
};

async function init() {
  try {
    const me = await api("/api/me");
    $("login-view").classList.add("hidden");
    $("app-view").classList.remove("hidden");
    $("who").textContent = `Login sebagai ${me.username}`;
    $("job-form").job_date.value = today();
    $("report-date").value = today();
    $("report-month").value = today().slice(0, 7);
    $("report-from").value = today().slice(0, 7) + "-01";
    $("report-to").value = today();
    showTab("dashboard");
  } catch {
    $("login-view").classList.remove("hidden");
    $("app-view").classList.add("hidden");
  }
}

init();
