import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Layout from "./Layout.jsx";
import LoginPage from "./LoginPage.jsx";
import DashboardPage from "./DashboardPage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import JournalPanel from "./JournalPanel.jsx";
import ReportPage from "./ReportPage.jsx";
import { createConnGuard } from "./conn.js";
import { IconClose, IconRefresh, IconWifiOff } from "./icons.jsx";

const VIEWS = ["dashboard", "journal", "report", "settings"];

function Toasts({ toasts, close }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          <button onClick={() => close(t.id)} aria-label="Tutup">
            <IconClose width={14} height={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Splash() {
  return (
    <div className="splash">
      <span className="spinner neutral" />
      <span className="muted small">Menghubungi server…</span>
    </div>
  );
}

function ServerDownScreen({ onRetry }) {
  return (
    <div className="login-page">
      <div className="login-card card offscreen-card">
        <span className="offscreen-ico">
          <IconWifiOff width={26} height={26} />
        </span>
        <h1 style={{ fontSize: 20 }}>Tidak bisa menghubungi server</h1>
        <p className="login-desc">
          Aplikasi ini berjalan bersama server RecapApp di komputer/LAN kamu. Sepertinya servernya sedang
          mati atau terputus. Nyalakan dulu, lalu coba lagi — akun CMS kamu aman.
        </p>
        <button className="primary full" onClick={onRetry}>
          <IconRefresh width={16} height={16} />
          Coba lagi
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [serverDown, setServerDown] = useState(false);
  const [booted, setBooted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  const [view, setView] = useState(() => {
    try {
      const v = window.localStorage.getItem("recapapp.view");
      return VIEWS.includes(v) ? v : "dashboard";
    } catch {
      return "dashboard";
    }
  });
  const [toasts, setToasts] = useState([]);
  const [recapRows, setRecapRows] = useState([]);
  const [recapLoading, setRecapLoading] = useState(true);
  const [recapRunning, setRecapRunning] = useState(false);
  const [recapState, setRecapState] = useState(null);
  const toastId = useRef(0);
  const wasValid = useRef(false);
  const statusFails = useRef(0);
  const statusRef = useRef(null);
  const connGuard = useRef(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  if (!connGuard.current) connGuard.current = createConnGuard((k, t) => notify(k, t));
  const guard = connGuard.current;

  const notify = (kind, text) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 9000 : 5200);
  };

  const closeToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  const loadStatus = useCallback(
    async () => {
      try {
        setStatus(await api.status());
        statusFails.current = 0;
        guard.ok();
        setServerDown(false);
      } catch {
        statusFails.current += 1;
        guard.fail();
        // layar "server mati" hanya bila gagal beruntun (≥2) atau belum pernah sukses
        if (statusFails.current >= 2 || !statusRef.current) setServerDown(true);
      } finally {
        setBooted(true);
      }
    },
    [guard]
  );

  const loadRecaps = useCallback(async () => {
    setRecapLoading(true);
    try {
      const r = await api.recaps();
      setRecapRows(r.recaps || []);
    } catch (e) {
      notify("err", `Recap gagal dimuat: ${e.message}`);
    } finally {
      setRecapLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 5000);
    return () => clearInterval(t);
  }, [loadStatus]);

  useEffect(() => {
    if (booted && sessionValid) wasValid.current = true;
    else if (booted && sessionValid === false && wasValid.current && !serverDown) {
      wasValid.current = false;
      setLoginNotice("Sesi berakhir atau token tidak valid — silakan masuk kembali.");
    }
    if (booted && sessionValid) setLoginNotice("");
  }, [booted, status, serverDown]);

  useEffect(() => {
    (async () => {
      loadRecaps();
      try {
        const s = await api.recapStatus();
        if (s.running) {
          setRecapRunning(true);
          setRecapState(s);
        }
      } catch {}
    })();
  }, [loadRecaps]);

  useEffect(() => {
    if (!recapRunning) return undefined;
    const t = setInterval(async () => {
      try {
        const s = await api.recapStatus();
        setRecapState(s);
        if (!s.running) {
          setRecapRunning(false);
          loadRecaps();
          notify(
            s.failed && s.failed.length ? "err" : "ok",
            s.failed && s.failed.length
              ? `Recap selesai, ${s.failed.length} siswa gagal: ${s.failed.map((f) => f.name || "siswa").join(", ")}`
              : `Recap selesai — ${s.total} siswa diproses.`
          );
        }
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [recapRunning]);

  const handleViewChange = (v) => {
    setView(v);
    try {
      window.localStorage.setItem("recapapp.view", v);
    } catch {}
  };

  const act = async (label, fn) => {
    setBusy(true);
    try {
      const r = await fn();
      notify("ok", `${label} selesai.`);
      return r;
    } catch (e) {
      notify("err", `${label} gagal: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
      loadStatus();
    }
  };

  const handleApiLogin = async (username, password) => {
    setBusy(true);
    try {
      await api.loginApi(username, password);
      setLoginNotice("");
      notify("ok", "Login berhasil.");
      loadStatus();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message || "Login gagal" };
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => act("Keluar dari CMS", () => api.logout());

  const handleSync = async () => {
    const r = await act("Muat data siswa", () => api.sync());
    if (r && r.loggedIn) notify("ok", `${r.inserted} siswa baru · total ${r.students}`);
    if (r && !r.loggedIn) notify("err", "Belum terdeteksi login. Masuk kembali terlebih dahulu.");
  };

  const handleRecap = async () => {
    setBusy(true);
    try {
      const r = await api.recap();
      if (!r) return;
      setRecapRunning(true);
      setRecapState({ running: true, current: 0, total: 0 });
    } catch (e) {
      notify("err", `Buat recap gagal: ${e.message}`);
    } finally {
      setBusy(false);
      loadStatus();
    }
  };

  const sessionValid = Boolean(status?.sessionValid);
  const studentCount = status?.studentCount ?? 0;
  const loginEmail = status?.loginEmail ?? null;

  if (!booted) return <Splash />;

  if (serverDown && !status) {
    return (
      <div className="app">
        <Toasts toasts={toasts} close={closeToast} />
        <ServerDownScreen onRetry={loadStatus} />
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="app">
        <Toasts toasts={toasts} close={closeToast} />
        <LoginPage busy={busy} notice={loginNotice} onApiLogin={handleApiLogin} />
      </div>
    );
  }

  return (
    <div className="app">
      <Toasts toasts={toasts} close={closeToast} />
      <Layout view={view} onViewChange={handleViewChange} sessionValid={sessionValid} loginEmail={loginEmail} onLogout={handleLogout}>
        {view === "dashboard" && (
          <DashboardPage
            sessionValid={sessionValid}
            studentCount={studentCount}
            busy={busy}
            recapRunning={recapRunning}
            recapRows={recapRows}
            recapLoading={recapLoading}
            recapState={recapState}
            startedAt={recapRows.length ? recapRows[0].synced_at : null}
            onSync={handleSync}
            onRecap={handleRecap}
          />
        )}
        {view === "journal" && <JournalPanel sessionValid={sessionValid} notify={notify} />}
        {view === "report" && <ReportPage notify={notify} />}
        {view === "settings" && (
          <SettingsPage status={status} sessionValid={sessionValid} busy={busy} act={act} onLogout={handleLogout} />
        )}
      </Layout>
    </div>
  );
}
