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

function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
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
    $("recent-jobs").innerHTML = jobs.jobs.slice(0, 10).map((j) => `<tr><td>${esc(j.job_date)}</td><td>${esc(j.customer_name)}</td><td>${esc(j.service_type)}</td><td>${fmtRp(j.amount)}</td><td>${esc(j.status)}</td></tr>`).join("") || "<tr><td colspan='5'>Belum ada transaksi.</td></tr>";
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
    $("job-list").innerHTML = data.jobs.map((j) => `<tr><td>${esc(j.job_date)}</td><td>${esc(j.customer_name)}</td><td>${esc(j.service_type)}</td><td>${fmtRp(j.amount)}</td><td>${esc(j.status)}</td><td><button data-edit-job='${j.id}'>Edit</button> <button data-del-job='${j.id}' class="secondary">Hapus</button></td></tr>`).join("") || "<tr><td colspan='6'>Belum ada transaksi.</td></tr>";
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

async function loadReport() {
  try {
    showError("");
    const { qs } = reportParams();
    const data = await api(`/api/reports?${qs}`);
    $("report-total").textContent = fmtRp(data.totals.total);
    $("report-lunas").textContent = fmtRp(data.totals.total_lunas);
    $("report-dp").textContent = fmtRp(data.totals.total_dp);
    $("report-belum").textContent = fmtRp(data.totals.total_belum);
    $("report-by-service").innerHTML = data.by_service.map((r) => `<tr><td>${esc(r.service_type)}</td><td>${r.count}</td><td>${fmtRp(r.total)}</td></tr>`).join("") || "<tr><td colspan='3'>Belum ada data.</td></tr>";
    $("report-jobs").innerHTML = data.jobs.map((j) => `<tr><td>${esc(j.job_date)}</td><td>${esc(j.customer_name)}</td><td>${esc(j.service_type)}</td><td>${fmtRp(j.amount)}</td><td>${esc(j.status)}</td></tr>`).join("") || "<tr><td colspan='5'>Belum ada data.</td></tr>";
    return data;
  } catch (e) { showError(e.message); return null; }
}

document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => showTab(b.dataset.tab));

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
