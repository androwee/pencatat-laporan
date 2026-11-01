"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function AppLogo({ size = 44, theme = "dark" }) {
  return (
    <img src={theme === "light" ? "/logo-light.png" : "/logo-dark.png"} alt="Logo Pencatat Laporan"
      width={size} height={size} className="rounded-xl shrink-0" style={{ width: size, height: size }} />
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
const emptyJob = { id: "", customer_id: "", job_date: todayWib(), status: "lunas", note: "" };
const emptyJobItem = { service_type: "", qty: 1, unit: "kubik", unit_price: "" };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Tutup" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative bg-panel border border-line rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
        <div className="flex justify-between items-start gap-3 mb-4">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} aria-label="Tutup popup" className="bg-zinc-800 w-9 h-9 rounded-full font-bold shrink-0">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function isoWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekToRange(weekStr) {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekStr || "");
  if (!m) return { from: "", to: "" };
  const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + (Number(m[2]) - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

function monthToRange(monthStr) {
  const [y, mo] = (monthStr || "").split("-").map(Number);
  if (!y || !mo) return { from: "", to: "" };
  const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  return { from: `${monthStr}-01`, to: last };
}

export default function Home() {
  const [view, setView] = useState("loading");
  const [username, setUsername] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [dash, setDash] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [jobs, setJobs] = useState([]);
  const [jobForm, setJobForm] = useState(emptyJob);
  const [jobItems, setJobItems] = useState([{ ...emptyJobItem }]);
  const fmtQty = (q) => { const n = Number(q); if (!Number.isFinite(n)) return q; return Number.isInteger(n) ? String(n) : String(n).replace(".", ","); };
  const jobItemsTotal = jobItems.reduce((sum, it) => sum + Math.round(Number(it.qty || 0) * Number(it.unit_price || 0)), 0);
  const [jobCustomerMode, setJobCustomerMode] = useState("existing");
  const [newCustomer, setNewCustomer] = useState({ name: "", address: "", phone: "" });
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [detailJob, setDetailJob] = useState(null);
  const [settings, setSettings] = useState({});
  const [settingsForm, setSettingsForm] = useState({ business_name: "", business_address: "", business_phone: "", business_website: "", business_logo: "", bank_name: "", bank_account_number: "", bank_account_holder: "" });
  const [settingsSaved, setSettingsSaved] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [jobFilterType, setJobFilterType] = useState("all");
  const [jobFilterWeek, setJobFilterWeek] = useState(isoWeek(todayWib()));
  const [jobFilterMonth, setJobFilterMonth] = useState(todayWib().slice(0, 7));
  const [jobFilterFrom, setJobFilterFrom] = useState(todayWib().slice(0, 7) + "-01");
  const [jobFilterTo, setJobFilterTo] = useState(todayWib());
  const [jobFilterStatus, setJobFilterStatus] = useState("");
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

  const jobFilterRange = useCallback(() => {
    if (jobFilterType === "weekly") return weekToRange(jobFilterWeek);
    if (jobFilterType === "monthly") return monthToRange(jobFilterMonth);
    if (jobFilterType === "custom") return { from: jobFilterFrom, to: jobFilterTo };
    return { from: "", to: "" };
  }, [jobFilterType, jobFilterWeek, jobFilterMonth, jobFilterFrom, jobFilterTo]);

  const loadJobs = useCallback(async (override) => {
    try {
      setError("");
      const range = override || jobFilterRange();
      const status = override && "status" in override ? override.status : jobFilterStatus;
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      if (status) params.set("status", status);
      const qs = params.toString();
      const data = await api(`/api/jobs${qs ? `?${qs}` : ""}`);
      setJobs(data.jobs);
    } catch (e) { setError(e.message); }
  }, [jobFilterRange, jobFilterStatus]);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api("/api/settings");
      setSettings(data.settings || {});
      setSettingsForm({
        business_name: data.settings?.business_name || "",
        business_address: data.settings?.business_address || "",
        business_phone: data.settings?.business_phone || "",
        business_website: data.settings?.business_website || "",
        business_logo: data.settings?.business_logo || "",
      });
    } catch (e) { /* settings opsional, abaikan */ }
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
        loadCustomers();
        loadSettings();
      } catch { setView("login"); }
    })();
  }, [loadDashboard, loadCustomers, loadSettings]);

  useEffect(() => { if (tab === "customers") loadCustomers(search); }, [search, tab, loadCustomers]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pencatat-theme");
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
        document.documentElement.classList.toggle("theme-light", saved === "light");
      }
    } catch {}
  }, []);

  useEffect(() => {
    const checkInstalled = () => setIsInstalled(
      (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) ||
      (typeof window !== "undefined" && window.navigator.standalone === true));
    checkInstalled();
    const onBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e); };
    const onInstalled = () => { setIsInstalled(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {}
    setInstallPrompt(null);
  };

  const applyTheme = (next) => {
    setTheme(next);
    try { localStorage.setItem("pencatat-theme", next); } catch {}
    document.documentElement.classList.toggle("theme-light", next === "light");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify(loginForm) });
      const me = await api("/api/me");
      setUsername(me.username);
      setView("app");
      loadDashboard();
      loadCustomers();
      loadSettings();
    } catch (err) { setLoginError(err.message); }
  };

  const handleLogout = async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    location.reload();
  };

  const openJobModal = (job) => {
    if (job) {
      setJobCustomerMode("existing");
      setJobForm({ id: job.id, customer_id: String(job.customer_id), job_date: job.job_date, status: job.status, note: job.note || "" });
      setJobItems(job.items?.length
        ? job.items.map((it) => ({ service_type: it.service_type, qty: it.qty, unit: it.unit, unit_price: String(it.unit_price) }))
        : [{ service_type: job.service_type, qty: 1, unit: "paket", unit_price: String(job.amount) }]);
    } else {
      setJobForm({ ...emptyJob, job_date: todayWib() });
      setJobItems([{ ...emptyJobItem }]);
      setJobCustomerMode("existing");
      setNewCustomer({ name: "", address: "", phone: "" });
    }
    loadCustomers();
    setShowJobModal(true);
  };

  const openCustomerModal = (customer) => {
    if (customer) setCustomerForm({ id: customer.id, name: customer.name, address: customer.address, phone: customer.phone });
    else setCustomerForm(emptyCustomer);
    setShowCustomerModal(true);
  };

  const handleAddNew = () => openJobModal(null);

  const submitCustomer = async (e) => {
    e.preventDefault();
    try {
      const id = customerForm.id;
      await api(id ? `/api/customers/${id}` : "/api/customers", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({ name: customerForm.name, address: customerForm.address, phone: customerForm.phone }),
      });
      setCustomerForm(emptyCustomer);
      setShowCustomerModal(false);
      loadCustomers(search);
    } catch (err) { setError(err.message); }
  };

  const submitJob = async (e) => {
    e.preventDefault();
    try {
      const id = jobForm.id;
      let customerId = Number(jobForm.customer_id);
      // Mode pelanggan baru: simpan dulu ke list pelanggan, lalu pakai id-nya untuk transaksi.
      if (!id && jobCustomerMode === "new") {
        if (!newCustomer.name.trim()) throw new Error("Nama pelanggan baru wajib diisi.");
        const created = await api("/api/customers", {
          method: "POST",
          body: JSON.stringify({ name: newCustomer.name, address: newCustomer.address, phone: newCustomer.phone }),
        });
        customerId = created.customer.id;
      }
      const items = jobItems.map((it) => ({
        service_type: it.service_type.trim(), qty: Number(it.qty), unit: it.unit, unit_price: Number(it.unit_price),
      }));
      if (!items.length || items.some((it) => !it.service_type || !(it.qty > 0) || !(it.unit_price >= 0))) {
        throw new Error("Isi tiap baris layanan: jenis jasa, jumlah > 0, dan harga satuan.");
      }
      await api(id ? `/api/jobs/${id}` : "/api/jobs", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          customer_id: customerId, items, job_date: jobForm.job_date, status: jobForm.status, note: jobForm.note,
        }),
      });
      setJobForm({ ...emptyJob, job_date: todayWib() });
      setJobItems([{ ...emptyJobItem }]);
      setJobCustomerMode("existing");
      setNewCustomer({ name: "", address: "", phone: "" });
      setShowJobModal(false);
      // Transaksi baru langsung terlihat: reset filter ke Semua, lalu muat ulang.
      setJobFilterType("all");
      setJobFilterStatus("");
      loadCustomers();
      loadJobs({ from: "", to: "", status: "" });
      if (tab === "dashboard") loadDashboard();
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

  const toggleSelect = (list, setList, id) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };
  const toggleSelectAll = (list, setList, items) => {
    const ids = items.map((x) => x.id);
    setList(list.length === ids.length && ids.length > 0 ? [] : ids);
  };

  // Tahan lama (touch & hold) untuk memilih item, ala WhatsApp/Galeri.
  // Tahan ~0,5 detik: getar sebentar + item terpilih. Geser jari/mouse
  // (>12px, mis. saat scroll) membatalkan tahan, dan ketukan biasa
  // (<0,5 detik) tidak terganggu. Tombol/input di dalam kartu tidak
  // memicu tahan lama, supaya Detail/Edit/Hapus tetap berfungsi normal.
  const lpTimer = useRef(null);
  const lpStart = useRef(null);
  const lpFired = useRef(false);
  const lpClear = () => { if (lpTimer.current) clearTimeout(lpTimer.current); lpTimer.current = null; lpStart.current = null; };
  const lpProps = (toggle) => ({
    onPointerDown: (e) => {
      if (e.target.closest("button, a, input, select, textarea, label")) return;
      lpFired.current = false;
      lpStart.current = { x: e.clientX, y: e.clientY };
      lpTimer.current = setTimeout(() => {
        lpFired.current = true;
        try { navigator.vibrate?.(15); } catch {}
        toggle();
        lpClear();
      }, 500);
    },
    onPointerMove: (e) => {
      if (!lpStart.current) return;
      if (Math.abs(e.clientX - lpStart.current.x) > 12 || Math.abs(e.clientY - lpStart.current.y) > 12) lpClear();
    },
    onPointerUp: lpClear,
    onPointerCancel: lpClear,
    onContextMenu: (e) => e.preventDefault(),
  });
  // Ketuk kartu saat sudah ada pilihan = tambah/batalkan pilihan itu.
  // Ketuk kartu transaksi di luar mode pilih = buka detailnya.
  // Ketuk tepat setelah tahan lama diabaikan, supaya tahan lama tidak
  // langsung membuka detail (pilihanlah yang terjadi, bukan detail).
  const consumeLongPressClick = () => {
    if (!lpFired.current) return false;
    lpFired.current = false;
    return true;
  };
  const cardClickToggle = (list, setList, id) => (e) => {
    if (consumeLongPressClick()) return;
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    if (list.length) toggleSelect(list, setList, id);
  };
  const cardClickJob = (j) => (e) => {
    if (consumeLongPressClick()) return;
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    if (selectedJobs.length) toggleSelect(selectedJobs, setSelectedJobs, j.id);
    else setDetailJob(j);
  };
  // Grafik dashboard interaktif: ketuk batang tren = transaksi pada
  // tanggal itu; ketuk donat/legenda status = transaksi dengan status
  // itu. Filter diterapkan lewat override loadJobs (bukan lewat state
  // yang belum sempat ter-update), lalu pindah ke tab Transaksi.
  const openJobsForDate = (date) => {
    setJobFilterType("custom"); setJobFilterFrom(date); setJobFilterTo(date); setJobFilterStatus("");
    loadJobs({ from: date, to: date, status: "" }); loadCustomers(); setTab("jobs");
  };
  const openJobsForStatus = (label) => {
    const status = label === "Lunas" ? "lunas" : label === "DP" ? "dp" : "belum";
    setJobFilterType("all"); setJobFilterStatus(status);
    loadJobs({ from: "", to: "", status }); loadCustomers(); setTab("jobs");
  };

  const bulkDeleteCustomers = async () => {
    if (!selectedCustomers.length) return;
    if (!confirm(`Hapus ${selectedCustomers.length} pelanggan beserta semua transaksinya? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api("/api/customers/bulk-delete", { method: "POST", body: JSON.stringify({ ids: selectedCustomers }) });
      setSelectedCustomers([]);
      loadCustomers(search);
      loadJobs();
      if (tab === "dashboard") loadDashboard();
    } catch (err) { setError(err.message); }
  };

  const bulkDeleteJobs = async () => {
    if (!selectedJobs.length) return;
    if (!confirm(`Hapus ${selectedJobs.length} transaksi yang dipilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api("/api/jobs/bulk-delete", { method: "POST", body: JSON.stringify({ ids: selectedJobs }) });
      setSelectedJobs([]);
      loadJobs();
      if (tab === "dashboard") loadDashboard();
    } catch (err) { setError(err.message); }
  };

  const openSettings = () => {
    setSettingsForm({
      business_name: settings.business_name || "",
      business_address: settings.business_address || "",
      business_phone: settings.business_phone || "",
      business_website: settings.business_website || "",
      business_logo: settings.business_logo || "",
      bank_name: settings.bank_name || "",
      bank_account_number: settings.bank_account_number || "",
      bank_account_holder: settings.bank_account_holder || "",
    });
    setSettingsSaved("");
    setShowSettingsModal(true);
  };

  // Logo: diperkecil di perangkat (maks. 512px) sebelum disimpan, supaya
  // tidak membebani database; PNG dipertahankan, JPEG dipakai bila lebih kecil.
  const handleLogoFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("File logo harus berupa gambar."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Ukuran file logo maksimal 5 MB."); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 512;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl = canvas.toDataURL("image/png");
        if (dataUrl.length > 200 * 1024) {
          const c2 = document.createElement("canvas");
          c2.width = w; c2.height = h;
          const ctx2 = c2.getContext("2d");
          ctx2.fillStyle = "#ffffff"; ctx2.fillRect(0, 0, w, h);
          ctx2.drawImage(img, 0, 0, w, h);
          const jpeg = c2.toDataURL("image/jpeg", 0.85);
          if (jpeg.length < dataUrl.length) dataUrl = jpeg;
        }
        setSettingsForm((prev) => ({ ...prev, business_logo: dataUrl }));
        setSettingsSaved("");
      } catch { setError("Logo tidak bisa diproses."); }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setError("Gambar logo tidak bisa dibaca."); URL.revokeObjectURL(url); };
    img.src = url;
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      const data = await api("/api/settings", { method: "PUT", body: JSON.stringify(settingsForm) });
      setSettings(data.settings || {});
      setSettingsSaved("Informasi usaha tersimpan.");
    } catch (err) { setError(err.message); }
  };

  const toWaNumber = (raw) => {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.startsWith("0")) d = "62" + d.slice(1);
    else if (d.startsWith("8")) d = "62" + d;
    return d;
  };

  const sendInvoiceWhatsApp = async (job) => {
    const customer = customers.find((c) => c.id === Number(job.customer_id)) || {};
    const phone = toWaNumber(customer.phone || job.customer_phone);
    const businessName = settings.business_name || "Pencatat Laporan";
    const invNo = `INV-${String(job.job_date).replaceAll("-", "")}-${String(job.id).padStart(4, "0")}`;
    const statusLabel = job.status === "lunas" ? "Lunas" : job.status === "dp" ? "DP" : "Belum bayar";
    const items = job.items?.length
      ? job.items
      : [{ service_type: job.service_type, qty: 1, unit: "paket", unit_price: job.amount, amount: job.amount }];
    const lines = items.map((it) => `- ${it.service_type} (${fmtQty(it.qty)} ${it.unit}) @ ${fmtRp(it.unit_price)} = ${fmtRp(it.amount)}`).join("\n");
    const bankLine = settings.bank_name && settings.bank_account_number
      ? `\nPembayaran: ${settings.bank_name} ${settings.bank_account_number}${settings.bank_account_holder ? ` a.n. ${settings.bank_account_holder}` : ""}`
      : "";
    const msg = `${businessName}\nINVOICE ${invNo}\nTanggal: ${job.job_date}\nPelanggan: ${job.customer_name}\n\n${lines}\n\nTotal: ${fmtRp(job.amount)}\nStatus: ${statusLabel}${bankLine}\n\nTerima kasih.`;
    const filename = `invoice-${job.id}-${job.job_date}.pdf`;
    // 1. Utamakan kirim file PDF langsung lewat lembar berbagi perangkat
    // (Web Share API, didukung Chrome Android). Di lembar berbagi, pilih
    // WhatsApp lalu pilih kontak pelanggan — nomor tidak terisi otomatis
    // di sini, karena berbagi file tidak bisa menarget nomor seperti wa.me.
    try {
      const doc = await buildInvoiceDoc(job);
      const file = new File([doc.output("blob")], filename, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice ${invNo}`, text: `${businessName} — Invoice ${invNo}, total ${fmtRp(job.amount)} (${statusLabel}).` });
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return; // pengguna membatalkan lembar berbagi
      // Gagal lain (mis. PDF gagal dibuat akan dilempar lagi di bawah) —
      // lanjut ke fallback wa.me bila memungkinkan.
    }
    // 2. Fallback: chat wa.me langsung ke nomor pelanggan, pesan teks invoice.
    // wa.me memang tidak bisa melampirkan file, jadi ini hanya teks.
    if (!/^62\d{8,13}$/.test(phone)) {
      setError("Berbagi file PDF tidak didukung browser ini, dan nomor WA pelanggan belum diisi atau tidak valid. Lengkapi dulu di data pelanggan, atau unduh PDF-nya lalu kirim manual dari WhatsApp.");
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  const buildInvoiceDoc = async (job) => {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const businessName = settings.business_name || "Pencatat Laporan";
      const customer = customers.find((c) => c.id === Number(job.customer_id)) || {};
      const statusLabel = job.status === "lunas" ? "Lunas" : job.status === "dp" ? "DP" : "Belum bayar";
      const invNo = `INV-${String(job.job_date).replaceAll("-", "")}-${String(job.id).padStart(4, "0")}`;
      let y = 18;
      let textX = 14;
      let logoBottom = 0;
      if (settings.business_logo) {
        try {
          const props = doc.getImageProperties(settings.business_logo);
          const format = settings.business_logo.includes("image/jpeg") ? "JPEG" : "PNG";
          const aspect = props.width / props.height;
          const logoW = aspect >= 1 ? 28 : Math.min(28, 20 * aspect);
          const logoH = aspect >= 1 ? 28 / aspect : 20;
          doc.addImage(settings.business_logo, format, 14, 12, logoW, logoH);
          textX = 14 + logoW + 4;
          logoBottom = 12 + logoH;
        } catch { /* logo rusak: lanjut tanpa logo, jangan gagalkan invoice */ }
      }
      doc.setFontSize(18); doc.setFont("helvetica", "bold");
      doc.splitTextToSize(businessName, 196 - textX).forEach((l) => { doc.text(l, textX, y); y += 8; });
      doc.setFontSize(11); doc.setFont("helvetica", "normal");
      const businessLines = [settings.business_address, settings.business_phone, settings.business_website].filter(Boolean);
      businessLines.forEach((line) => { doc.splitTextToSize(String(line), 196 - textX).forEach((l) => { doc.text(l, textX, y); y += 6; }); });
      y = Math.max(y, logoBottom) + 4;
      doc.setDrawColor(230, 0, 18); doc.setLineWidth(0.8); doc.line(14, y, 196, y); y += 10;
      doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("INVOICE", 14, y); y += 8;
      doc.setFontSize(11); doc.setFont("helvetica", "normal");
      doc.text(`Nomor: ${invNo}`, 14, y); y += 6;
      doc.text(`Tanggal: ${job.job_date}`, 14, y); y += 6;
      doc.text(`Status: ${statusLabel}`, 14, y); y += 10;
      doc.setFont("helvetica", "bold"); doc.text("Ditagihkan kepada:", 14, y); y += 7;
      doc.setFont("helvetica", "normal");
      const custLines = doc.splitTextToSize(`${job.customer_name || customer.name || ""}${customer.phone ? ` (${customer.phone})` : job.customer_phone ? ` (${job.customer_phone})` : ""}`, 182);
      custLines.forEach((line) => { doc.text(line, 14, y); y += 6; });
      if (customer.address) { doc.splitTextToSize(customer.address, 182).forEach((line) => { doc.text(line, 14, y); y += 6; }); }
      y += 4;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.4); doc.line(14, y, 196, y); y += 8;
      const invItems = job.items?.length
        ? job.items
        : [{ service_type: job.service_type, qty: 1, unit: "paket", unit_price: job.amount, amount: job.amount }];
      doc.setFont("helvetica", "bold");
      doc.text("Layanan", 14, y); doc.text("Jumlah", 108, y); doc.text("Harga satuan", 138, y); doc.text("Subtotal", 196, y, { align: "right" }); y += 7;
      doc.line(14, y, 196, y); y += 8;
      doc.setFont("helvetica", "normal");
      invItems.forEach((it) => {
        const lines = doc.splitTextToSize(it.service_type, 84);
        doc.text(`${fmtQty(it.qty)} ${it.unit || ""}`.trim(), 108, y);
        doc.text(fmtRp(it.unit_price), 138, y);
        doc.text(fmtRp(it.amount), 196, y, { align: "right" });
        lines.forEach((line) => { doc.text(line, 14, y); y += 6; });
        y += 2;
      });
      if (job.note) { y += 2; doc.setFontSize(10); doc.text(`Catatan: ${job.note}`, 14, y); doc.setFontSize(11); y += 6; }
      y += 4; doc.line(14, y, 196, y); y += 9;
      doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text("Total", 14, y); doc.text(fmtRp(job.amount), 196, y, { align: "right" }); y += 12;
      doc.setFont("helvetica", "normal"); doc.setFontSize(11);
      const note = job.status === "lunas"
        ? "Status pembayaran: Lunas. Terima kasih atas pembayaran Anda."
        : job.status === "dp"
          ? "Status pembayaran: DP. Nominal di atas adalah total jasa; sisa pembayaran sesuai kesepakatan."
          : "Status pembayaran: Belum bayar. Mohon selesaikan pembayaran.";
      doc.splitTextToSize(note, 182).forEach((line) => { doc.text(line, 14, y); y += 6; });
      if (settings.bank_name && settings.bank_account_number) {
        y += 2; doc.setFont("helvetica", "bold");
        const bankLine = `Pembayaran via transfer: ${settings.bank_name} ${settings.bank_account_number}${settings.bank_account_holder ? ` a.n. ${settings.bank_account_holder}` : ""}`;
        doc.splitTextToSize(bankLine, 182).forEach((line) => { doc.text(line, 14, y); y += 6; });
        doc.setFont("helvetica", "normal");
      }
      y += 6;
      doc.setFontSize(10); doc.text("Invoice ini dibuat dari aplikasi Pencatat Laporan.", 14, y);
      return doc;
  };

  const downloadInvoice = async (job) => {
    try {
      const doc = await buildInvoiceDoc(job);
      doc.save(`invoice-${job.id}-${job.job_date}.pdf`);
    } catch (err) { setError(`Gagal membuat invoice: ${err.message}`); }
  };

  if (view === "loading") return <main className="max-w-3xl mx-auto p-6 text-zinc-400">Memuat…</main>;

  if (view === "login") {
    const fieldIcon = (d) => (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
    );
    return (
      <main className="min-h-screen flex flex-col px-4 pb-16">
        <div className="flex justify-end pt-4">
          <button type="button" onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Pindah ke mode terang" : "Pindah ke mode gelap"}
            title={theme === "dark" ? "Mode terang" : "Mode gelap"}
            className="bg-panel border border-line rounded-full p-2.5 text-zinc-400 hover:text-persona shadow">
            {theme === "dark"
              ? fieldIcon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>)
              : fieldIcon(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />)}
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="flex flex-col items-center text-center gap-3">
              <AppLogo size={96} theme={theme} />
              <h1 className="font-bold text-3xl tracking-tight">Login</h1>
              <p className="text-zinc-400 -mt-1">Silakan masuk untuk melanjutkan.</p>
            </div>
            <div className="bg-panel border border-line rounded-[28px] p-6 mt-6 shadow-xl">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                    {fieldIcon(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>)}
                  </span>
                  <input className="login-input pl-11" name="username" autoComplete="username" required
                    placeholder="Username" aria-label="Username"
                    value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} />
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                    {fieldIcon(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>)}
                  </span>
                  <input className="login-input pl-11 pr-11" type={showPassword ? "text" : "password"}
                    autoComplete="current-password" required placeholder="Password" aria-label="Password"
                    value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-persona p-1">
                    {showPassword
                      ? fieldIcon(<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 6.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>)
                      : fieldIcon(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>)}
                  </button>
                </div>
                {loginError && <p className="text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">{loginError}</p>}
                <button type="submit" className="w-full bg-persona hover:bg-persona-dark text-white font-bold py-3.5 rounded-full">Masuk</button>
              </form>
              <p className="text-zinc-400 text-xs text-center mt-4">Akun diatur lewat environment variable di Cloudflare, bukan dari database.</p>
            </div>
            <p className="text-zinc-400 text-xs text-center mt-4">Pencatat Laporan — Pencatat Pelanggan Jasa</p>
          </div>
        </div>
      </main>
    );
  }

  const dockBtn = (name, label, icon) => (
    <button key={name} onClick={() => showTab(name)} aria-label={label}
      className={`flex-1 flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-bold transition-colors ${tab === name ? "text-persona" : "text-zinc-400 hover:text-persona"}`}>
      {icon}<span>{label}</span>
    </button>
  );
  const icon = (d) => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  );

  const reportTrend = report ? groupByDate(report.jobs) : { dates: [], values: [] };

  return (
    <main className="max-w-5xl mx-auto px-4 pt-4 pb-32">
      <header className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <AppLogo size={44} theme={theme} />
          <h1 className="font-semibold tracking-tight text-xl sm:text-2xl leading-tight">Pencatat Laporan</h1>
        </div>
        <button onClick={openSettings} aria-label="Profil dan pengaturan"
          className="w-11 h-11 rounded-full overflow-hidden shrink-0 border border-line bg-panel flex items-center justify-center">
          {settings.business_logo ? (
            <img src={settings.business_logo} alt="Logo perusahaan" className="w-full h-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-zinc-400">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </button>
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
            <Card title="Tren pemasukan (10 tanggal terakhir)"><BarChart labels={dash.trendDates} values={dash.trendValues} onSelect={(date) => openJobsForDate(date)} /></Card>
            <Card title="Pemasukan per status (semua transaksi)"><DonutChart parts={dash.status} onSelect={(part) => openJobsForStatus(part.label)} /></Card>
          </div>
          <p className="text-xs text-zinc-400">Ketuk batang grafik atau potongan donat untuk melihat transaksinya, dan ketuk kotak transaksi untuk melihat detailnya.</p>
          {selectedJobs.length > 0 && (
            <div className="bg-panel border border-line rounded-2xl p-3 flex flex-wrap items-center gap-3">
              <span className="text-sm text-zinc-400">{selectedJobs.length} dipilih</span>
              <button onClick={bulkDeleteJobs} className="bg-persona hover:bg-persona-dark px-4 py-2 rounded-xl font-bold text-sm">Hapus yang dipilih</button>
              <button onClick={() => setSelectedJobs([])} className="bg-zinc-800 px-4 py-2 rounded-xl font-bold text-sm">Batalkan pilihan</button>
            </div>
          )}
          <section className="bg-panel border border-line rounded-2xl overflow-hidden">
            <h2 className="font-bold p-4 pb-0">Transaksi terbaru</h2>
            <p className="text-xs text-zinc-400 px-4 pt-1">Tahan lama pada transaksi untuk memilih.</p>
            <div className="sm:hidden p-4 pt-2 space-y-3">
              {dash.recent.map((j) => (
                <div key={j.id} {...lpProps(() => toggleSelect(selectedJobs, setSelectedJobs, j.id))} onClick={cardClickJob(j)}
                  className={`border rounded-xl p-3 select-none ${selectedJobs.includes(j.id) ? "border-persona bg-red-500/10" : "border-line"}`}>
                  <div className="flex justify-between gap-2">
                    <span className="flex items-start gap-2">
                      <input type="checkbox" className="w-4 h-4 accent-[#e60012] mt-1 shrink-0" style={{ width: "auto" }}
                        checked={selectedJobs.includes(j.id)} onChange={() => toggleSelect(selectedJobs, setSelectedJobs, j.id)} aria-label={`Pilih transaksi ${j.service_type}`} />
                      <strong>{j.customer_name}</strong>
                    </span>
                    {statusPill(j.status)}
                  </div>
                  <div className="text-zinc-400 text-sm mt-1">{j.service_type} · {j.job_date}</div>
                  <div className="font-bold mt-1">{fmtRp(j.amount)}</div>
                </div>
              ))}
              {!dash.recent.length && <p className="text-zinc-400 text-sm">Belum ada transaksi.</p>}
            </div>
            <div className="hidden sm:block overflow-x-auto p-4 pt-2">
              <table className="w-full text-sm min-w-[560px]">
                <thead><tr className="text-left text-zinc-400"><th className="py-2 pr-3">Tanggal</th><th className="py-2 pr-3">Pelanggan</th><th className="py-2 pr-3">Jasa</th><th className="py-2 pr-3">Nominal</th><th className="py-2">Status</th></tr></thead>
                <tbody>
                  {dash.recent.map((j) => (
                    <tr key={j.id} {...lpProps(() => toggleSelect(selectedJobs, setSelectedJobs, j.id))} onClick={cardClickJob(j)}
                      className={`border-t border-line select-none ${selectedJobs.includes(j.id) ? "bg-red-500/10" : ""}`}>
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
          <div className="flex justify-between items-center gap-3">
            <h2 className="font-bold text-lg">Pelanggan</h2>
            <button onClick={() => openCustomerModal(null)} className="bg-persona hover:bg-persona-dark px-4 py-2.5 rounded-full font-bold text-sm shrink-0">+ Tambah Pelanggan</button>
          </div>
          <label className="block text-sm font-medium">Cari pelanggan
            <input className="mt-1" placeholder="Nama atau nomor WA…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="bg-panel border border-line rounded-2xl p-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#e60012]" style={{ width: "auto" }}
                checked={customers.length > 0 && selectedCustomers.length === customers.length}
                onChange={() => toggleSelectAll(selectedCustomers, setSelectedCustomers, customers)} />
              Pilih semua ({customers.length})
            </label>
            <span className="text-sm text-zinc-400">{selectedCustomers.length} dipilih</span>
            <button onClick={bulkDeleteCustomers} disabled={!selectedCustomers.length}
              className="bg-persona hover:bg-persona-dark px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-40">Hapus yang dipilih</button>
            {selectedCustomers.length > 0 && (
              <button onClick={() => setSelectedCustomers([])} className="bg-zinc-800 px-4 py-2 rounded-xl font-bold text-sm">Batalkan pilihan</button>
            )}
          </div>
          <p className="text-xs text-zinc-400">Tahan lama pada pelanggan untuk memilih.</p>
          <div className="bg-panel border border-line rounded-2xl overflow-hidden">
            <div className="sm:hidden p-4 space-y-3">
              {customers.map((c) => (
                <div key={c.id} {...lpProps(() => toggleSelect(selectedCustomers, setSelectedCustomers, c.id))} onClick={cardClickToggle(selectedCustomers, setSelectedCustomers, c.id)}
                  className={`border rounded-xl p-3 select-none ${selectedCustomers.includes(c.id) ? "border-persona bg-red-500/10" : "border-line"}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="w-4 h-4 accent-[#e60012] mt-1 shrink-0" style={{ width: "auto" }}
                      checked={selectedCustomers.includes(c.id)} onChange={() => toggleSelect(selectedCustomers, setSelectedCustomers, c.id)} aria-label={`Pilih ${c.name}`} />
                    <strong>{c.name}</strong>
                  </div>
                  <div className="text-zinc-400 text-sm mt-1">{c.address || "—"}</div>
                  <div className="text-sm mt-1">{c.phone || "—"}</div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => openCustomerModal(c)} className="bg-persona px-3 py-1.5 rounded-lg text-sm font-bold">Edit</button>
                    <button onClick={() => deleteCustomer(c.id)} className="bg-zinc-800 px-3 py-1.5 rounded-lg text-sm font-bold">Hapus</button>
                  </div>
                </div>
              ))}
              {!customers.length && <p className="text-zinc-400 text-sm">Belum ada pelanggan.</p>}
            </div>
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]"><thead><tr className="text-left text-zinc-400"><th className="p-3"><input type="checkbox" className="w-4 h-4 accent-[#e60012]" style={{ width: "auto" }} checked={customers.length > 0 && selectedCustomers.length === customers.length} onChange={() => toggleSelectAll(selectedCustomers, setSelectedCustomers, customers)} aria-label="Pilih semua pelanggan" /></th><th className="p-3">Nama</th><th className="p-3">Alamat</th><th className="p-3">Telepon / WA</th><th className="p-3"></th></tr></thead>
              <tbody>{customers.map((c) => (
                <tr key={c.id} {...lpProps(() => toggleSelect(selectedCustomers, setSelectedCustomers, c.id))} onClick={cardClickToggle(selectedCustomers, setSelectedCustomers, c.id)}
                  className={`border-t border-line select-none ${selectedCustomers.includes(c.id) ? "bg-red-500/10" : ""}`}>
                  <td className="p-3"><input type="checkbox" className="w-4 h-4 accent-[#e60012]" style={{ width: "auto" }} checked={selectedCustomers.includes(c.id)} onChange={() => toggleSelect(selectedCustomers, setSelectedCustomers, c.id)} aria-label={`Pilih ${c.name}`} /></td><td className="p-3">{c.name}</td><td className="p-3">{c.address}</td><td className="p-3">{c.phone}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button onClick={() => openCustomerModal(c)} className="bg-persona px-3 py-1.5 rounded-lg text-sm font-bold mr-2">Edit</button>
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
          <div className="flex justify-between items-center gap-3">
            <h2 className="font-bold text-lg">Transaksi</h2>
            <button onClick={() => openJobModal(null)} className="bg-persona hover:bg-persona-dark px-4 py-2.5 rounded-full font-bold text-sm shrink-0">+ Tambah Transaksi</button>
          </div>
          <div className="bg-panel border border-line rounded-2xl p-4 space-y-3">
            <h3 className="font-bold">Filter transaksi</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="block text-sm font-medium flex-1 min-w-[140px]">Periode
                <select className="mt-1" value={jobFilterType} onChange={(e) => setJobFilterType(e.target.value)}>
                  <option value="all">Semua</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option><option value="custom">Custom</option>
                </select>
              </label>
              {jobFilterType === "weekly" && (
                <label className="block text-sm font-medium flex-1 min-w-[140px]">Minggu
                  <input className="mt-1" type="week" value={jobFilterWeek} onChange={(e) => setJobFilterWeek(e.target.value)} />
                </label>
              )}
              {jobFilterType === "monthly" && (
                <label className="block text-sm font-medium flex-1 min-w-[140px]">Bulan
                  <input className="mt-1" type="month" value={jobFilterMonth} onChange={(e) => setJobFilterMonth(e.target.value)} />
                </label>
              )}
              {jobFilterType === "custom" && (
                <>
                  <label className="block text-sm font-medium flex-1 min-w-[140px]">Dari<input className="mt-1" type="date" value={jobFilterFrom} onChange={(e) => setJobFilterFrom(e.target.value)} /></label>
                  <label className="block text-sm font-medium flex-1 min-w-[140px]">Sampai<input className="mt-1" type="date" value={jobFilterTo} onChange={(e) => setJobFilterTo(e.target.value)} /></label>
                </>
              )}
              <label className="block text-sm font-medium flex-1 min-w-[140px]">Status
                <select className="mt-1" value={jobFilterStatus} onChange={(e) => setJobFilterStatus(e.target.value)}>
                  <option value="">Semua status</option><option value="lunas">Lunas</option><option value="dp">DP</option><option value="belum">Belum bayar</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={() => loadJobs()} className="bg-persona hover:bg-persona-dark px-5 py-2.5 rounded-xl font-bold">Terapkan filter</button>
              <button onClick={() => { setJobFilterType("all"); setJobFilterStatus(""); loadJobs({ from: "", to: "", status: "" }); }} className="bg-zinc-800 px-5 py-2.5 rounded-xl font-bold">Reset</button>
              <span className="text-sm text-zinc-400">{jobs.length} transaksi · total {fmtRp(jobs.reduce((sum, j) => sum + Number(j.amount), 0))}</span>
            </div>
            {jobFilterType !== "all" && (() => { const r = jobFilterRange(); return r.from ? <p className="text-sm text-zinc-400">Periode: {r.from} sampai {r.to}</p> : null; })()}
          </div>
          <div className="bg-panel border border-line rounded-2xl p-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#e60012]" style={{ width: "auto" }}
                checked={jobs.length > 0 && selectedJobs.length === jobs.length}
                onChange={() => toggleSelectAll(selectedJobs, setSelectedJobs, jobs)} />
              Pilih semua ({jobs.length})
            </label>
            <span className="text-sm text-zinc-400">{selectedJobs.length} dipilih</span>
            <button onClick={bulkDeleteJobs} disabled={!selectedJobs.length}
              className="bg-persona hover:bg-persona-dark px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-40">Hapus yang dipilih</button>
            {selectedJobs.length > 0 && (
              <button onClick={() => setSelectedJobs([])} className="bg-zinc-800 px-4 py-2 rounded-xl font-bold text-sm">Batalkan pilihan</button>
            )}
          </div>
          <p className="text-xs text-zinc-400">Tahan lama pada transaksi untuk memilih.</p>
          <div className="bg-panel border border-line rounded-2xl overflow-hidden">
            <div className="sm:hidden p-4 space-y-3">
              {jobs.map((j) => (
                <div key={j.id} {...lpProps(() => toggleSelect(selectedJobs, setSelectedJobs, j.id))} onClick={cardClickJob(j)}
                  className={`border rounded-xl p-3 select-none ${selectedJobs.includes(j.id) ? "border-persona bg-red-500/10" : "border-line"}`}>
                  <div className="flex justify-between gap-2"><strong>{j.customer_name}</strong>{statusPill(j.status)}</div>
                  <div className="text-zinc-400 text-sm mt-1">{j.service_type} · {j.job_date}</div>
                  <div className="font-bold mt-1">{fmtRp(j.amount)}</div>
                  {j.note && <div className="text-zinc-400 text-sm mt-1">{j.note}</div>}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button onClick={() => setDetailJob(j)} className="bg-zinc-800 px-3 py-1.5 rounded-lg text-sm font-bold">Detail</button>
                    <button onClick={() => openJobModal(j)} className="bg-persona px-3 py-1.5 rounded-lg text-sm font-bold">Edit</button>
                    <button onClick={() => deleteJob(j.id)} className="bg-zinc-800 px-3 py-1.5 rounded-lg text-sm font-bold">Hapus</button>
                  </div>
                </div>
              ))}
              {!jobs.length && <p className="text-zinc-400 text-sm">Belum ada transaksi.</p>}
            </div>
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]"><thead><tr className="text-left text-zinc-400"><th className="p-3"><input type="checkbox" className="w-4 h-4 accent-[#e60012]" style={{ width: "auto" }} checked={jobs.length > 0 && selectedJobs.length === jobs.length} onChange={() => toggleSelectAll(selectedJobs, setSelectedJobs, jobs)} aria-label="Pilih semua transaksi" /></th><th className="p-3">Tanggal</th><th className="p-3">Pelanggan</th><th className="p-3">Jasa</th><th className="p-3">Nominal</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
              <tbody>{jobs.map((j) => (
                <tr key={j.id} {...lpProps(() => toggleSelect(selectedJobs, setSelectedJobs, j.id))} onClick={cardClickJob(j)}
                  className={`border-t border-line select-none ${selectedJobs.includes(j.id) ? "bg-red-500/10" : ""}`}>
                  <td className="p-3"><input type="checkbox" className="w-4 h-4 accent-[#e60012]" style={{ width: "auto" }} checked={selectedJobs.includes(j.id)} onChange={() => toggleSelect(selectedJobs, setSelectedJobs, j.id)} aria-label={`Pilih transaksi ${j.service_type}`} /></td><td className="p-3">{j.job_date}</td><td className="p-3">{j.customer_name}</td><td className="p-3">{j.service_type}</td>
                  <td className="p-3">{fmtRp(j.amount)}</td><td className="p-3">{statusPill(j.status)}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button onClick={() => setDetailJob(j)} className="bg-zinc-800 px-3 py-1.5 rounded-lg text-sm font-bold mr-2">Detail</button>
                    <button onClick={() => openJobModal(j)} className="bg-persona px-3 py-1.5 rounded-lg text-sm font-bold mr-2">Edit</button>
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
              <div className="bg-panel border border-line rounded-2xl overflow-hidden"><h3 className="font-bold p-4 pb-0">Detail transaksi</h3>
                <div className="sm:hidden p-4 pt-2 space-y-3">
                  {report.jobs.map((j) => (
                    <div key={j.id} className="border border-line rounded-xl p-3">
                      <div className="flex justify-between gap-2"><strong>{j.customer_name}</strong>{statusPill(j.status)}</div>
                      <div className="text-zinc-400 text-sm mt-1">{j.service_type} · {j.job_date}</div>
                      <div className="font-bold mt-1">{fmtRp(j.amount)}</div>
                    </div>
                  ))}
                  {!report.jobs.length && <p className="text-zinc-400 text-sm">Belum ada data.</p>}
                </div>
                <div className="hidden sm:block overflow-x-auto p-4 pt-2">
                <table className="w-full text-sm min-w-[560px]"><thead><tr className="text-left text-zinc-400"><th className="py-2 pr-3">Tanggal</th><th className="py-2 pr-3">Pelanggan</th><th className="py-2 pr-3">Jasa</th><th className="py-2 pr-3">Nominal</th><th className="py-2">Status</th></tr></thead>
                  <tbody>{report.jobs.map((j) => <tr key={j.id} className="border-t border-line"><td className="py-2 pr-3">{j.job_date}</td><td className="py-2 pr-3">{j.customer_name}</td><td className="py-2 pr-3">{j.service_type}</td><td className="py-2 pr-3">{fmtRp(j.amount)}</td><td className="py-2">{statusPill(j.status)}</td></tr>)}
                    {!report.jobs.length && <tr><td colSpan="5" className="py-4 text-zinc-400">Belum ada data.</td></tr>}
                  </tbody></table>
              </div></div>
            </>
          )}
        </div>
      )}

      {showCustomerModal && (
        <Modal title={customerForm.id ? "Edit pelanggan" : "Tambah pelanggan"} onClose={() => { setShowCustomerModal(false); setCustomerForm(emptyCustomer); }}>
          <form onSubmit={submitCustomer} className="space-y-3">
            <label className="block text-sm font-medium">Nama *
              <input className="mt-1" required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">Alamat
              <input className="mt-1" value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">Nomor telepon / WA
              <input className="mt-1" inputMode="tel" value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} />
            </label>
            <div className="flex gap-2 flex-wrap pt-1">
              <button type="submit" className="bg-persona hover:bg-persona-dark px-5 py-2.5 rounded-xl font-bold flex-1">Simpan pelanggan</button>
              <button type="button" onClick={() => { setShowCustomerModal(false); setCustomerForm(emptyCustomer); }} className="bg-zinc-800 px-5 py-2.5 rounded-xl font-bold">Batal</button>
            </div>
          </form>
        </Modal>
      )}

      {showJobModal && (
        <Modal title={jobForm.id ? "Edit transaksi" : "Tambah transaksi"} onClose={() => { setShowJobModal(false); setJobForm({ ...emptyJob, job_date: todayWib() }); setJobItems([{ ...emptyJobItem }]); setJobCustomerMode("existing"); setNewCustomer({ name: "", address: "", phone: "" }); }}>
          <form onSubmit={submitJob} className="space-y-3">
            {!jobForm.id && (
              <div className="flex gap-2" role="group" aria-label="Pilih pelanggan">
                <button type="button" onClick={() => setJobCustomerMode("existing")}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${jobCustomerMode === "existing" ? "bg-persona text-white" : "bg-zinc-800 text-zinc-300"}`}>Pelanggan lama</button>
                <button type="button" onClick={() => setJobCustomerMode("new")}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${jobCustomerMode === "new" ? "bg-persona text-white" : "bg-zinc-800 text-zinc-300"}`}>Pelanggan baru</button>
              </div>
            )}
            {jobCustomerMode === "new" && !jobForm.id ? (
              <>
                <label className="block text-sm font-medium">Nama pelanggan baru *
                  <input className="mt-1" required value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Otomatis tersimpan ke list pelanggan" />
                </label>
                <label className="block text-sm font-medium">Alamat pelanggan baru
                  <input className="mt-1" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
                </label>
                <label className="block text-sm font-medium">Nomor telepon / WA pelanggan baru
                  <input className="mt-1" inputMode="tel" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                </label>
              </>
            ) : (
              <label className="block text-sm font-medium">Pelanggan *
                <select className="mt-1" required value={jobForm.customer_id} onChange={(e) => setJobForm({ ...jobForm, customer_id: e.target.value })}>
                  <option value="">-- pilih pelanggan --</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                </select>
              </label>
            )}
            <div>
              <datalist id="jasa-list">
                <option value="Sedot WC" /><option value="Perbaikan Wastafel" /><option value="Sedot Limbah" /><option value="Pembersihan Saluran" /><option value="Lain-lain" />
              </datalist>
              <p className="text-sm font-medium mb-2">Layanan * <span className="text-zinc-400 font-normal">— satu transaksi bisa berisi beberapa layanan, tiap baris dihitung dari jumlah × harga satuan</span></p>
              <div className="space-y-3">
                {jobItems.map((it, idx) => (
                  <div key={idx} className="border border-line rounded-xl p-3 space-y-2">
                    <label className="block text-sm font-medium">Jenis jasa *
                      <input className="mt-1" required list="jasa-list" placeholder="cth: Sedot WC, Perbaikan Wastafel, Lain-lain" value={it.service_type}
                        onChange={(e) => setJobItems(jobItems.map((x, i) => i === idx ? { ...x, service_type: e.target.value } : x))} />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block text-sm font-medium">Jumlah *
                        <input className="mt-1" type="number" min="0" step="any" required value={it.qty}
                          onChange={(e) => setJobItems(jobItems.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))} />
                      </label>
                      <label className="block text-sm font-medium">Satuan *
                        <select className="mt-1" value={it.unit}
                          onChange={(e) => setJobItems(jobItems.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}>
                          <option value="kubik">kubik</option><option value="strip">strip</option><option value="pcs">pcs</option><option value="paket">paket</option>
                        </select>
                      </label>
                      <label className="block text-sm font-medium">Harga satuan (Rp) *
                        <input className="mt-1" type="number" min="0" step="1" required value={it.unit_price}
                          onChange={(e) => setJobItems(jobItems.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))} />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-zinc-400">Subtotal: <strong className="text-white">{fmtRp(Math.round(Number(it.qty || 0) * Number(it.unit_price || 0)))}</strong></span>
                      {jobItems.length > 1 && (
                        <button type="button" onClick={() => setJobItems(jobItems.filter((_, i) => i !== idx))} className="bg-zinc-800 px-3 py-1.5 rounded-lg text-sm font-bold">Hapus baris</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 mt-3">
                <button type="button" onClick={() => setJobItems([...jobItems, { ...emptyJobItem }])} className="bg-zinc-800 px-4 py-2 rounded-xl font-bold text-sm">+ Tambah layanan</button>
                <span className="font-bold">Total: {fmtRp(jobItemsTotal)}</span>
              </div>
            </div>
            <label className="block text-sm font-medium">Tanggal *
              <input className="mt-1" type="date" required value={jobForm.job_date} onChange={(e) => setJobForm({ ...jobForm, job_date: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">Status
              <select className="mt-1" value={jobForm.status} onChange={(e) => setJobForm({ ...jobForm, status: e.target.value })}>
                <option value="lunas">Lunas</option><option value="dp">DP</option><option value="belum">Belum bayar</option>
              </select>
            </label>
            <label className="block text-sm font-medium">Catatan
              <input className="mt-1" value={jobForm.note} onChange={(e) => setJobForm({ ...jobForm, note: e.target.value })} />
            </label>
            <div className="flex gap-2 flex-wrap pt-1">
              <button type="submit" className="bg-persona hover:bg-persona-dark px-5 py-2.5 rounded-xl font-bold flex-1">Simpan transaksi</button>
              <button type="button" onClick={() => { setShowJobModal(false); setJobForm({ ...emptyJob, job_date: todayWib() }); setJobItems([{ ...emptyJobItem }]); setJobCustomerMode("existing"); setNewCustomer({ name: "", address: "", phone: "" }); }} className="bg-zinc-800 px-5 py-2.5 rounded-xl font-bold">Batal</button>
            </div>
          </form>
        </Modal>
      )}

      {showSettingsModal && (
        <Modal title="Profil & Pengaturan" onClose={() => setShowSettingsModal(false)}>
          <div className="space-y-5">
            <div>
              <h3 className="font-bold mb-2">Tampilan</h3>
              <p className="text-sm text-zinc-400 mb-3">Pilih tema yang nyaman dipakai. Pilihanmu tersimpan di perangkat ini.</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => applyTheme("dark")}
                  className={`rounded-2xl border p-4 text-left ${theme === "dark" ? "border-persona bg-red-500/10" : "border-line"}`}>
                  <span className="block w-full h-10 rounded-lg bg-black border border-line mb-2" aria-hidden="true" />
                  <strong className="text-sm">Gelap {theme === "dark" ? "✓" : ""}</strong>
                  <span className="block text-xs text-zinc-400 mt-0.5">Hitam – merah</span>
                </button>
                <button type="button" onClick={() => applyTheme("light")}
                  className={`rounded-2xl border p-4 text-left ${theme === "light" ? "border-persona bg-red-500/10" : "border-line"}`}>
                  <span className="block w-full h-10 rounded-lg bg-white border border-line mb-2" aria-hidden="true" />
                  <strong className="text-sm">Terang {theme === "light" ? "✓" : ""}</strong>
                  <span className="block text-xs text-zinc-400 mt-0.5">Putih – merah</span>
                </button>
              </div>
            </div>
            <form onSubmit={saveSettings} className="border-t border-line pt-4 space-y-3">
              <h3 className="font-bold">Informasi Usaha</h3>
              <p className="text-sm text-zinc-400">Ditampilkan di invoice PDF. Kosongkan bila belum ada.</p>
              <label className="block text-sm font-medium">Nama usaha / jasa
                <input className="mt-1" value={settingsForm.business_name} onChange={(e) => setSettingsForm({ ...settingsForm, business_name: e.target.value })} placeholder="cth: Jasa Sedot WC Andro" />
              </label>
              <label className="block text-sm font-medium">Alamat usaha
                <input className="mt-1" value={settingsForm.business_address} onChange={(e) => setSettingsForm({ ...settingsForm, business_address: e.target.value })} />
              </label>
              <label className="block text-sm font-medium">Nomor telepon
                <input className="mt-1" inputMode="tel" value={settingsForm.business_phone} onChange={(e) => setSettingsForm({ ...settingsForm, business_phone: e.target.value })} />
              </label>
              <label className="block text-sm font-medium">Website
                <input className="mt-1" inputMode="url" value={settingsForm.business_website} onChange={(e) => setSettingsForm({ ...settingsForm, business_website: e.target.value })} placeholder="https://…" />
              </label>
              <div className="space-y-3 pt-2">
                <h4 className="font-bold">Rekening Bank</h4>
                <p className="text-sm text-zinc-400 -mt-1">Ditampilkan di invoice agar pelanggan bisa transfer langsung tanpa kamu kirim nomor rekening manual lagi. Kosongkan bila belum ada.</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">Bank
                    <input className="mt-1" value={settingsForm.bank_name} onChange={(e) => setSettingsForm({ ...settingsForm, bank_name: e.target.value })} placeholder="cth: BCA" />
                  </label>
                  <label className="block text-sm font-medium">Nomor rekening
                    <input className="mt-1" inputMode="numeric" value={settingsForm.bank_account_number} onChange={(e) => setSettingsForm({ ...settingsForm, bank_account_number: e.target.value })} placeholder="cth: 1234567890" />
                  </label>
                </div>
                <label className="block text-sm font-medium">Atas nama
                  <input className="mt-1" value={settingsForm.bank_account_holder} onChange={(e) => setSettingsForm({ ...settingsForm, bank_account_holder: e.target.value })} placeholder="cth: Andri Susilo" />
                </label>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Logo perusahaan <span className="text-zinc-400 font-normal">— tampil di kop invoice</span></p>
                {settingsForm.business_logo && (
                  <img src={settingsForm.business_logo} alt="Pratinjau logo perusahaan" className="max-h-20 max-w-full object-contain bg-white rounded-lg p-2 mb-2 border border-line" />
                )}
                <div className="flex gap-2 flex-wrap items-center">
                  <label className="bg-zinc-800 px-4 py-2.5 rounded-xl font-bold text-sm cursor-pointer">
                    {settingsForm.business_logo ? "Ganti logo" : "Pilih logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleLogoFile(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {settingsForm.business_logo && (
                    <button type="button" onClick={() => setSettingsForm({ ...settingsForm, business_logo: "" })} className="bg-zinc-800 px-4 py-2.5 rounded-xl font-bold text-sm">Hapus logo</button>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1">Gambar otomatis diperkecil (maks. 512px). Setelah pilih/ganti logo, ketuk "Simpan informasi usaha" di bawah.</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" className="bg-persona hover:bg-persona-dark px-5 py-2.5 rounded-xl font-bold">Simpan informasi usaha</button>
                {settingsSaved && <span className="text-sm text-emerald-400">{settingsSaved}</span>}
              </div>
            </form>
            <div className="border-t border-line pt-4">
              <h3 className="font-bold mb-1">Aplikasi</h3>
              {isInstalled ? (
                <p className="text-sm text-zinc-400">Aplikasi sudah terinstall di perangkat ini, bisa dibuka dari layar utama tanpa browser.</p>
              ) : installPrompt ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={installApp} className="bg-persona hover:bg-persona-dark px-5 py-2.5 rounded-xl font-bold text-sm">Install aplikasi</button>
                  <span className="text-sm text-zinc-400">Pasang sebagai aplikasi di layar utama.</span>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">Bila tombol install belum muncul: di Chrome Android ketuk ⋮ lalu "Tambahkan ke Layar Utama" atau "Install aplikasi". Di iPhone: ketuk Bagikan lalu "Tambah ke Layar Utama".</p>
              )}
            </div>
            <div className="border-t border-line pt-4">
              <h3 className="font-bold mb-1">Akun</h3>
              <p className="text-sm text-zinc-400 mb-3">Login sebagai {username}</p>
              <button onClick={handleLogout} className="w-full bg-persona hover:bg-persona-dark px-5 py-3 rounded-xl font-bold">Keluar</button>
            </div>
          </div>
        </Modal>
      )}

      {detailJob && (
        <Modal title="Detail transaksi" onClose={() => setDetailJob(null)}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><span className="text-zinc-400">Tanggal</span><strong>{detailJob.job_date}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-zinc-400">Pelanggan</span><strong className="text-right">{detailJob.customer_name}</strong></div>
            {(customers.find((c) => c.id === Number(detailJob.customer_id))?.phone || detailJob.customer_phone) && (
              <div className="flex justify-between gap-3"><span className="text-zinc-400">Telepon / WA</span><strong>{customers.find((c) => c.id === Number(detailJob.customer_id))?.phone || detailJob.customer_phone}</strong></div>
            )}
            {customers.find((c) => c.id === Number(detailJob.customer_id))?.address && (
              <div className="flex justify-between gap-3"><span className="text-zinc-400">Alamat</span><strong className="text-right">{customers.find((c) => c.id === Number(detailJob.customer_id)).address}</strong></div>
            )}
            <div>
              <p className="text-zinc-400 mb-1">Layanan</p>
              <div className="border border-line rounded-xl overflow-hidden">
                {(detailJob.items || [{ service_type: detailJob.service_type, qty: 1, unit: "paket", unit_price: detailJob.amount, amount: detailJob.amount }]).map((it, i) => (
                  <div key={i} className="flex justify-between gap-3 px-3 py-2 border-t border-line first:border-t-0">
                    <span><strong>{it.service_type}</strong><span className="text-zinc-400"> · {fmtQty(it.qty)} {it.unit}</span></span>
                    <span className="text-right"><span className="text-zinc-400 block text-xs">{fmtRp(it.unit_price)} / {it.unit || "paket"}</span><strong>{fmtRp(it.amount)}</strong></span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 px-3 py-2 border-t border-line bg-zinc-800/50"><strong>Total</strong><strong>{fmtRp(detailJob.amount)}</strong></div>
              </div>
            </div>
            <div className="flex justify-between gap-3"><span className="text-zinc-400">Status</span>{statusPill(detailJob.status)}</div>
            {detailJob.note && <div className="flex justify-between gap-3"><span className="text-zinc-400">Catatan</span><strong className="text-right">{detailJob.note}</strong></div>}
          </div>
          <div className="mt-5 space-y-2">
            <button onClick={() => sendInvoiceWhatsApp(detailJob)} className="w-full bg-[#25d366] hover:opacity-90 px-5 py-3.5 rounded-xl font-bold text-white text-base flex items-center justify-center gap-2 shadow">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                <g transform="translate(6.6,6.6) scale(0.45)" strokeWidth="4">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </g>
              </svg>
              Kirim via WhatsApp
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => downloadInvoice(detailJob)} aria-label="Unduh Invoice (PDF)" title="Unduh Invoice (PDF)" className="bg-zinc-800 h-12 rounded-xl flex items-center justify-center">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
              </button>
              <button onClick={() => { const j = detailJob; setDetailJob(null); openJobModal(j); }} aria-label="Edit transaksi" title="Edit transaksi" className="bg-zinc-800 h-12 rounded-xl flex items-center justify-center">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
              </button>
              <button onClick={() => setDetailJob(null)} aria-label="Tutup" title="Tutup" className="bg-zinc-800 h-12 rounded-xl flex items-center justify-center">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-3">Kirim via WhatsApp membagikan file PDF invoice langsung (di HP Android, pilih WhatsApp di lembar berbagi lalu pilih kontak pelanggan). Bila browser tidak mendukung berbagi file, tombol ini membuka chat wa.me ke nomor WA pelanggan dengan pesan teks invoice — wa.me tidak bisa melampirkan file, jadi dalam kasus itu unduh dulu PDF-nya lalu lampirkan manual.</p>
          <p className="text-xs text-zinc-400 mt-3">Header invoice memakai informasi usaha dari Pengaturan (tombol profil di atas). Isi dulu di sana bila nama/alamat/telepon/website usaha belum tampil di invoice.</p>
        </Modal>
      )}

      <nav className="fixed left-1/2 -translate-x-1/2 bottom-4 z-50 flex items-end gap-1 bg-panel border border-line rounded-full px-1.5 py-1.5 shadow-2xl shadow-black/60 w-[calc(100vw-24px)] max-w-md" aria-label="Navigasi utama">
        {dockBtn("dashboard", "Dashboard", icon(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>))}
        {dockBtn("customers", "Pelanggan", icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3 3.2-4.5 6.5-4.5S15 17 15.8 20" /></>))}
        <button onClick={handleAddNew} aria-label="Tambah catatan baru"
          className="mx-1 -mt-8 w-14 h-14 rounded-full bg-persona hover:bg-persona-dark text-white flex items-center justify-center shadow-lg shadow-red-900/50 shrink-0">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        {dockBtn("jobs", "Transaksi", icon(<><path d="M5 3h14v18H5z" /><path d="M8 7h8M8 11h8M8 15h5" /></>))}
        {dockBtn("reports", "Laporan", icon(<><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>))}
      </nav>
    </main>
  );
}
