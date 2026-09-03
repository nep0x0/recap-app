import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Layout from "./Layout.jsx";
import LoginPage from "./LoginPage.jsx";
import DashboardPage from "./DashboardPage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import JournalPanel from "./JournalPanel.jsx";
import ReportPage from "./ReportPage.jsx";
import { createConnGuard } from "./conn.js";
import ToastContainer from "./components/common/ToastContainer.jsx";
import Splash from "./components/layout/Splash.jsx";
import ServerDownScreen from "./components/layout/ServerDownScreen.jsx";
import { useToast } from "./hooks/useToast.js";

const VIEWS = ["dashboard", "journal", "report", "settings"];

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

  const { toasts, notify, closeToast } = useToast();
  const [recapRows, setRecapRows] = useState([]);
  const [recapLoading, setRecapLoading] = useState(true);
  const [recapRunning, setRecapRunning] = useState(false);
  const [recapState, setRecapState] = useState(null);

  const wasValid = useRef(false);
  const statusFails = useRef(0);
  const statusRef = useRef(null);
  const connGuard = useRef(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  if (!connGuard.current) {
    connGuard.current = createConnGuard((k, t) => notify(k, t));
  }
  const guard = connGuard.current;

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
      statusFails.current = 0;
      guard.ok();
      setServerDown(false);
    } catch {
      statusFails.current += 1;
      guard.fail();
      if (statusFails.current >= 2 || !statusRef.current) {
        setServerDown(true);
      }
    } finally {
      setBooted(true);
    }
  }, [guard]);

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
  }, [notify]);

  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 5000);
    return () => clearInterval(t);
  }, [loadStatus]);

  const sessionValid = Boolean(status?.sessionValid);
  const studentCount = status?.studentCount ?? 0;
  const loginEmail = status?.loginEmail ?? null;

  useEffect(() => {
    if (booted && sessionValid) {
      wasValid.current = true;
    } else if (booted && sessionValid === false && wasValid.current && !serverDown) {
      wasValid.current = false;
      setLoginNotice("Sesi berakhir atau token tidak valid — silakan masuk kembali.");
    }
    if (booted && sessionValid) setLoginNotice("");
  }, [booted, sessionValid, serverDown]);

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
  }, [recapRunning, loadRecaps, notify]);

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

  if (!booted) return <Splash />;

  if (serverDown && !status) {
    return (
      <div className="app">
        <ToastContainer toasts={toasts} onClose={closeToast} />
        <ServerDownScreen onRetry={loadStatus} />
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="app">
        <ToastContainer toasts={toasts} onClose={closeToast} />
        <LoginPage busy={busy} notice={loginNotice} onApiLogin={handleApiLogin} />
      </div>
    );
  }

  return (
    <div className="app">
      <ToastContainer toasts={toasts} onClose={closeToast} />
      <Layout
        view={view}
        onViewChange={handleViewChange}
        sessionValid={sessionValid}
        loginEmail={loginEmail}
        onLogout={handleLogout}
      >
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
          <SettingsPage
            status={status}
            sessionValid={sessionValid}
            busy={busy}
            act={act}
            onLogout={handleLogout}
          />
        )}
      </Layout>
    </div>
  );
}
