"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart, DonutChart, HBarChart, fmtRp, groupByDate, statusParts, statusPill } from "../components/Charts";

const todayWib = () => {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Gagal memuat ${path}`);
  return data;
}

function LogoMark({ size = 44 }) {
  return (
    <span className="inline-flex leading-none" aria-hidden="true">
      <svg viewBox="0 0 48 48" width={size} height={size} fill="none" aria-hidden="true">
        <rect x="2" y="2" width="44" height="44" rx="10" fill="#e60012" />
        <path d="M14 32v-8M22 32V14M30 32v-12M38 32H10" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Card({ title, children, wide }) {
  return (
    <section className={`bg-panel border border-line rounded-2xl p-4 shadow ${wide ? "md:col-span-2" : ""}`}>
      {title && <h3 className="font-bold mb-3">{title}</h3>}
      {children}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-panel border border-line border-l-4 border-l-persona rounded-xl p-4">
      <span className="block text-zinc-400 text-sm">{label}</span>
      <strong className="text-xl">{value}</strong>
    </div>
  );
}

const emptyCustomer = { id: "", name: "", address: "", phone: "" };
const emptyJob = { id: "", customer_id: "", service_type: "", amount: "", job_date: todayWib(), status: "lunas", note: "" };

export default function Home() {
  const [view, setView] = useState("loading");
  const [username, setUsername] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [tab, setTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [dash, setDash] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [jobs, setJobs] = useState([]);
  const [jobForm, setJobForm] = useState(emptyJob);
  const [report, setReport] = useState(null);
  const [reportPeriod, setReportPeriod] = useState("monthly");
  const [reportDate, setReportDate] = useState(todayWib());
  const [reportMonth, setReportMonth] = useState(todayWib().slice(0, 7));
  const [reportFrom, setReportFrom] = useState(todayWib().slice(0, 7) + "-01");
  const [reportTo, setReportTo] = useState(todayWib());

  const loadDashboard = useCallback(async () => {
    try {
      setError("");
      const month = todayWib().slice(0, 7);
      const [daily, monthly, cust, allJobs] = await Promise.all([
        api(`/api/reports?period=daily&date=${todayWib()}`),
        api(`/api/reports?period=monthly&month=${month}`),
        api("/api/customers"),
        api("/api/jobs"),
      ]);
      const trend = groupByDate(allJobs.jobs);
      setDash({
        today: daily.totals.total, month: monthly.totals.total,
        customers: cust.customers.length, jobs: allJobs.jobs.length,
        recent: allJobs.jobs.slice(0, 10),
        trendDates: trend.dates.slice(-10), trendValues: trend.values.slice(-10),
        status: statusParts({
          total_lunas: allJobs.jobs.filter((j) => j.status === "lunas").reduce((s, j) => s + Number(j.amount), 0),
          total_dp: allJobs.jobs.filter((j) => j.status === "dp").reduce((s, j) => s + Number(j.amount), 0),
          total_belum: allJobs.jobs.filter((j) => j.status === "belum").reduce((s, j) => s + Number(j.amount), 0),
        }),
      });
    } catch (e) { setError(e.message); }
  }, []);

  const loadCustomers = useCallback(async (q = "") => {
    try {
      setError("");
      const data = await api(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setCustomers(data.customers);
    } catch (e) { setError(e.message); }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      setError("");
      const data = await api("/api/jobs");
      setJobs(data.jobs);
    } catch (e) { setError(e.message); }
  }, []);

  const loadReport = useCallback(async () => {
    try {
      setError("");
      let qs;
      if (reportPeriod === "daily") qs = `period=daily&date=${reportDate || todayWib()}`;
      else if (reportPeriod === "monthly") qs = `period=monthly&month=${reportMonth || todayWib().slice(0, 7)}`;
      else qs = `period=range&from=${reportFrom}&to=${reportTo}`;
      const data = await api(`/api/reports?${qs}`);
      setReport(data);
      return data;
    } catch (e) { setError(e.message); return null; }
  }, [reportPeriod, reportDate, reportMonth, reportFrom, reportTo]);

  const showTab = useCallback((name) => {
    setTab(name);
    if (name === "dashboard") loadDashboard();
    if (name === "customers") loadCustomers(search);
    if (name === "jobs") { loadCustomers(); loadJobs(); }
    if (name === "reports") loadReport();
  }, [loadDashboard, loadCustomers, loadJobs, loadReport, search]);

  useEffect(() => {
    (async () => {
      try {
        const me = await api("/api/me");
        setUsername(me.username);
        setView("app");
        loadDashboard();
      } catch { setView("login"); }
    })();
  }, [loadDashboard]);

  useEffect(() => { if (tab === "customers") loadCustomers(search); }, [search, tab, loadCustomers]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify(loginForm) });
      const me = await api("/api/me");
      setUsername(me.username);
      setView("app");
      loadDashboard();
    } catch (err) { setLoginError(err.message); }
  };

  const handleLogout = async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    location.reload();
  };

  const handleAddNew = () => {
    setJobForm({ ...emptyJob, job_date: todayWib() });
    setTab("jobs");
    loadCustomers(); loadJobs();
    setTimeout(() => {
      document.getElementById("job-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("job-customer-select")?.focus();
    }, 100);
  };

  const submitCustomer = async (e) => {
    e.preventDefault();
    try {
      const id = customerForm.id;
      await api(id ? `/api/customers/${id}` : "/api/customers", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({ name: customerForm.name, address: customerForm.address, phone: customerForm.phone }),
      });
      setCustomerForm(emptyCustomer);
      loadCustomers(search);
    } catch (err) { setError(err.message); }
  };

  const submitJob = async (e) => {
    e.preventDefault();
    try {
      const id = jobForm.id;
      await api(id ? `/api/jobs/${id}` : "/api/jobs", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          customer_id: Number(jobForm.customer_id), service_type: jobForm.service_type,
          amount: Number(jobForm.amount), job_date: jobForm.job_date, status: jobForm.status, note: jobForm.note,
        }),
      });
      setJobForm({ ...emptyJob, job_date: todayWib() });
      loadJobs();
    } catch (err) { setError(err.message); }
  };

  const deleteCustomer = async (id) => {
    if (!confirm("Hapus pelanggan ini beserta semua transaksinya?")) return;
    await api(`/api/customers/${id}`, { method: "DELETE" });
    loadCustomers(search);
  };
  const deleteJob = async (id) => {
    if (!confirm("Hapus transaksi ini?")) return;
    await api(`/api/jobs/${id}`, { method: "DELETE" });
    loadJobs();
  };

  if (view === "loading") return <main className="max-w-3xl mx-auto p-6 text-zinc-400">Memuat…</main>;

  if (view === "login") {
    return (
      <main className="max-w-md mx-auto px-4 pt-16 pb-24">
        <div className="flex flex-col items-center text-center gap-2">
          <LogoMark size={72} />
          <h1 className="p5-title text-3xl">Pencatat Laporan</h1>
          <p className="text-zinc-400">Pencatat Pelanggan Jasa</p>
        </div>
        <div className="bg-panel border border-line rounded-2xl p-5 mt-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-persona" />
          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block text-sm font-medium">Username
              <input className="mt-1" name="username" autoComplete="username" required
                value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">Password
              <input className="mt-1" type="password" autoComplete="current-password" required
                value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
            </label>
            {loginError && <p className="text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">{loginError}</p>}
            <button type="submit" className="w-full bg-persona hover:bg-persona-dark text-white font-bold py-3 rounded-xl">Masuk</button>
          </form>
          <p className="text-zinc-400 text-xs text-center mt-4">Akun diatur lewat environment variable di Cloudflare, bukan dari database.</p>
        </div>
      </main>
    );
  }

  const dockBtn = (name, label, icon) => (
    <button key={name} onClick={() => showTab(name)} aria-label={label}
      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full text-[11px] font-bold ${tab === name ? "text-persona-bright bg-red-500/10" : "text-zinc-400 hover:text-white"}`}>
      {icon}<span>{label}</span>
    </button>
  );
  const icon = (d) => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  );

  const reportTrend = report ? groupByDate(report.jobs) : { dates: [], values: [] };

  return (
    <main className="max-w-5xl mx-auto px-4 pt-4 pb-32">
      <div className="p5-dots h-2 opacity-40 rounded-full mb-4" aria-hidden="true" />
      <header className="flex justify-between items-start gap-3">
        <div className="flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <h1 className="p5-title text-2xl leading-none">Pencatat Laporan</h1>
            <p className="text-zinc-400 text-sm mt-1">Login sebagai {username}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl font-bold text-sm">Keluar</button>
      </header>

      {error && <p className="text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm mt-4">{error}</p>}

      {tab === "dashboard" && dash && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Hari ini" value={fmtRp(dash.today)} />
            <Stat label="Bulan ini" value={fmtRp(dash.month)} />
            <Stat label="Total pelanggan" value={dash.customers} />
            <Stat label="Total transaksi" value={dash.jobs} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Tren pemasukan (10 tanggal terakhir)"><BarChart labels={dash.trendDates} values={dash.trendValues} /></Card>
            <Card title="Pemasukan per status (semua transaksi)"><DonutChart parts={dash.status} /></Card>
          </div>
          <section className="bg-panel border border-line rounded-2xl overflow-hidden">
            <h2 className="font-bold p-4 pb-0">Transaksi terbaru</h2>
            <div className="overflow-x-auto p-4 pt-2">
              <table className="w-full text-sm min-w-[560px]">
                <thead><tr className="text-left text-zinc-400"><th className="py-2 pr-3">Tanggal</th><th className="py-2 pr-3">Pelanggan</th><th className="py-2 pr-3">Jasa</th><th className="py-2 pr-3">Nominal</th><th className="py-2">Status</th></tr></thead>
                <tbody>
                  {dash.recent.map((j) => (
                    <tr key={j.id} className="border-t border-line">
                      <td className="py-2 pr-3">{j.job_date}</td><td className="py-2 pr-3">{j.customer_name}</td>
                      <td className="py-2 pr-3">{j.service_type}</td><td className="py-2 pr-3">{fmtRp(j.amount)}</td><td className="py-2">{statusPill(j.status)}</td>
                    </tr>
                  ))}
                  {!dash.recent.length && <tr><td colSpan="5" className="py-4 text-zinc-400">Belum ada transaksi.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "customers" && (
        <div className="mt-5 space-y-5">
          <form onSubmit={submitCustomer} className="bg-panel border border-line rounded-2xl p-4 space-y-3">
            <h2 className="font-bold">Tambah / edit pelanggan</h2>
            <label className="block text-sm font-medium">Nama *<input className="mt-1" required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} /></label>
            <label className="block text-sm font-medium">Alamat<input className="mt-1" value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} /></label>
            <label className="block text-sm font-medium">Nomor telepon / WA<input className="mt-1" inputMode="tel" value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /></label>
            <div className="flex gap-2 flex-wrap">
              <button type="submit" className="bg-persona hover:bg-persona-dark px-5 py-2.5 rounded-xl font-bold">Simpan pelanggan</button>
              <button type="button" onClick={() => setCustomerForm(emptyCustomer)} className="bg-zinc-800 px-5 py-2.5 rounded-xl font-bold">Batal</button>
            </div>
          </form>
          <label className="block text-sm font-medium">Cari pelanggan
            <input className="mt-1" placeholder="Nama atau nomor WA…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="bg-panel border border-line rounded-2xl overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]"><thead><tr className="text-left text-zinc-400"><th className="p-3">Nama</th><th className="p-3">Alamat</th><th className="p-3">Telepon / WA</th><th className="p-3"></th></tr></thead>
              <tbody>{customers.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="p-3">{c.name}</td><td className="p-3">{c.address}</td><td className="p-3">{c.phone}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button onClick={() => setCustomerForm({ id: c.id, name: c.name, address: c.address, phone: c.phone })} className="bg-persona px-3 py-1.5 rounded-lg text-sm font-bold mr-2">Edit</button>
                    <button onClick={() => deleteCustomer(c.id)} className="bg-zinc-800 px-3 py-1.5 rounded-lg text-sm font-bold">Hapus</button>
                  </td>
                </tr>))}
                {!customers.length && <tr><td colSpan="4" className="p-4 text-zinc-400">Belum ada pelanggan.</td></tr>}
              </tbody></table>
          </div></div>
        </div>
      )}

      {tab === "jobs" && (
        <div className="mt-5 space-y-5">
          <form id="job-form" onSubmit={submitJob} className="bg-panel border border-line rounded-2xl p-4 space-y-3">
            <h2 className="font-bold">Tambah / edit transaksi</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm font-medium">Pelanggan *
                <select id="job-customer-select" className="mt-1" required value={jobForm.customer_id} onChange={(e) => setJobForm({ ...jobForm, customer_id: e.target.value })}>
                  <option value="">-- pilih pelanggan --</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">Jenis jasa *<input className="mt-1" required placeholder="cth: Sedot WC, Service AC…" value={jobForm.service_type} onChange={(e) => setJobForm({ ...jobForm, service_type: e.target.value })} /></label>
              <label className="block text-sm font-medium">Nominal (Rp) *<input className="mt-1" type="number" min="0" step="1" required value={jobForm.amount} onChange={(e) => setJobForm({ ...jobForm, amount: e.target.value })} /></label>
              <label className="block text-sm font-medium">Tanggal *<input className="mt-1" type="date" required value={jobForm.job_date} onChange={(e) => setJobForm({ ...jobForm, job_date: e.target.value })} /></label>
              <label className="block text-sm font-medium">Status
                <select className="mt-1" value={jobForm.status} onChange={(e) => setJobForm({ ...jobForm, status: e.target.value })}>
                  <option value="lunas">Lunas</option><option value="dp">DP</option><option value="belum">Belum bayar</option>
                </select>
              </label>
              <label className="block text-sm font-medium">Catatan<input className="mt-1" value={jobForm.note} onChange={(e) => setJobForm({ ...jobForm, note: e.target.value })} /></label>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="submit" className="bg-persona hover:bg-persona-dark px-5 py-2.5 rounded-xl font-bold">Simpan transaksi</button>
              <button type="button" onClick={() => setJobForm({ ...emptyJob, job_date: todayWib() })} className="bg-zinc-800 px-5 py-2.5 rounded-xl font-bold">Batal</button>
            </div>
          </form>
          <div className="bg-panel border border-line rounded-2xl overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]"><thead><tr className="text-left text-zinc-400"><th className="p-3">Tanggal</th><th className="p-3">Pelanggan</th><th className="p-3">Jasa</th><th className="p-3">Nominal</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
              <tbody>{jobs.map((j) => (
                <tr key={j.id} className="border-t border-line">
                  <td className="p-3">{j.job_date}</td><td className="p-3">{j.customer_name}</td><td className="p-3">{j.service_type}</td>
                  <td className="p-3">{fmtRp(j.amount)}</td><td className="p-3">{statusPill(j.status)}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button onClick={() => setJobForm({ id: j.id, customer_id: String(j.customer_id), service_type: j.service_type, amount: String(j.amount), job_date: j.job_date, status: j.status, note: j.note || "" })} className="bg-persona px-3 py-1.5 rounded-lg text-sm font-bold mr-2">Edit</button>
                    <button onClick={() => deleteJob(j.id)} className="bg-zinc-800 px-3 py-1.5 rounded-lg text-sm font-bold">Hapus</button>
                  </td>
                </tr>))}
                {!jobs.length && <tr><td colSpan="6" className="p-4 text-zinc-400">Belum ada transaksi.</td></tr>}
              </tbody></table>
          </div></div>
        </div>
      )}

      {tab === "reports" && (
        <div className="mt-5 space-y-5">
          <div className="bg-panel border border-line rounded-2xl p-4 space-y-3">
            <h2 className="font-bold">Laporan pemasukan</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="block text-sm font-medium flex-1 min-w-[140px]">Jenis
                <select className="mt-1" value={reportPeriod} onChange={(e) => setReportPeriod(e.target.value)}>
                  <option value="daily">Harian</option><option value="monthly">Bulanan</option><option value="range">Rentang tanggal</option>
                </select>
              </label>
              <label className="block text-sm font-medium flex-1 min-w-[140px]">Tanggal<input className="mt-1" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></label>
              <label className="block text-sm font-medium flex-1 min-w-[140px]">Bulan<input className="mt-1" type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} /></label>
              <label className="block text-sm font-medium flex-1 min-w-[140px]">Dari<input className="mt-1" type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></label>
              <label className="block text-sm font-medium flex-1 min-w-[140px]">Sampai<input className="mt-1" type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></label>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={loadReport} className="bg-persona hover:bg-persona-dark px-5 py-2.5 rounded-xl font-bold">Tampilkan laporan</button>
              <button onClick={async () => { const d = await loadReport(); if (d) window.location.href = `/api/export?from=${d.from}&to=${d.to}`; }} className="bg-zinc-800 px-5 py-2.5 rounded-xl font-bold">Ekspor CSV</button>
            </div>
          </div>
          {report && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Total periode" value={fmtRp(report.totals.total)} />
                <Stat label="Lunas" value={fmtRp(report.totals.total_lunas)} />
                <Stat label="DP" value={fmtRp(report.totals.total_dp)} />
                <Stat label="Belum bayar" value={fmtRp(report.totals.total_belum)} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Card title="Pemasukan per tanggal"><BarChart labels={reportTrend.dates} values={reportTrend.values} /></Card>
                <Card title="Per status pembayaran"><DonutChart parts={statusParts(report.totals)} /></Card>
                <Card title="Pemasukan per jenis jasa" wide><HBarChart rows={report.by_service} /></Card>
              </div>
              <div className="bg-panel border border-line rounded-2xl overflow-hidden"><h3 className="font-bold p-4 pb-0">Per jenis jasa</h3><div className="overflow-x-auto p-4 pt-2">
                <table className="w-full text-sm"><thead><tr className="text-left text-zinc-400"><th className="py-2 pr-3">Jenis jasa</th><th className="py-2 pr-3">Jumlah</th><th className="py-2">Total</th></tr></thead>
                  <tbody>{report.by_service.map((r) => <tr key={r.service_type} className="border-t border-line"><td className="py-2 pr-3">{r.service_type}</td><td className="py-2 pr-3">{r.count}</td><td className="py-2">{fmtRp(r.total)}</td></tr>)}
                    {!report.by_service.length && <tr><td colSpan="3" className="py-4 text-zinc-400">Belum ada data.</td></tr>}
                  </tbody></table>
              </div></div>
              <div className="bg-panel border border-line rounded-2xl overflow-hidden"><h3 className="font-bold p-4 pb-0">Detail transaksi</h3><div className="overflow-x-auto p-4 pt-2">
                <table className="w-full text-sm min-w-[560px]"><thead><tr className="text-left text-zinc-400"><th className="py-2 pr-3">Tanggal</th><th className="py-2 pr-3">Pelanggan</th><th className="py-2 pr-3">Jasa</th><th className="py-2 pr-3">Nominal</th><th className="py-2">Status</th></tr></thead>
                  <tbody>{report.jobs.map((j) => <tr key={j.id} className="border-t border-line"><td className="py-2 pr-3">{j.job_date}</td><td className="py-2 pr-3">{j.customer_name}</td><td className="py-2 pr-3">{j.service_type}</td><td className="py-2 pr-3">{fmtRp(j.amount)}</td><td className="py-2">{statusPill(j.status)}</td></tr>)}
                    {!report.jobs.length && <tr><td colSpan="5" className="py-4 text-zinc-400">Belum ada data.</td></tr>}
                  </tbody></table>
              </div></div>
            </>
          )}
        </div>
      )}

      <nav className="fixed left-1/2 -translate-x-1/2 bottom-4 z-50 flex items-end gap-1 bg-panel border border-line rounded-full px-2 py-2 shadow-2xl shadow-black/60 max-w-[calc(100vw-24px)]" aria-label="Navigasi utama">
        {dockBtn("dashboard", "Dashboard", icon(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>))}
        {dockBtn("customers", "Pelanggan", icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3 3.2-4.5 6.5-4.5S15 17 15.8 20" /></>))}
        <button onClick={handleAddNew} aria-label="Tambah catatan baru"
          className="mx-1 -mt-8 w-14 h-14 rounded-full bg-persona hover:bg-persona-dark text-white flex items-center justify-center shadow-lg shadow-red-900/50 border-4 border-ink shrink-0">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        {dockBtn("jobs", "Transaksi", icon(<><path d="M5 3h14v18H5z" /><path d="M8 7h8M8 11h8M8 15h5" /></>))}
        {dockBtn("reports", "Laporan", icon(<><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>))}
      </nav>
    </main>
  );
}
