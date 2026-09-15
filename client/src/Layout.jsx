import { IconDashboard, IconJournal, IconReport, IconSettings, IconLogout } from "./icons.jsx";
import ThemeToggle from "./ThemeToggle.jsx";

const NAV = [
  {
    key: "dashboard",
    label: "Ringkasan",
    short: "Ringkasan",
    icon: IconDashboard,
    subtitle: "Progress, mastery, dan coin semua siswa",
  },
  {
    key: "journal",
    label: "Jurnal Meeting",
    short: "Jurnal",
    icon: IconJournal,
    subtitle: "Otomatisasi catatan meeting di CMS",
  },
  {
    key: "report",
    label: "Report Siswa",
    short: "Report",
    icon: IconReport,
    subtitle: "Lengkapi report per 8 pertemuan di CMS",
  },
  {
    key: "settings",
    label: "Pengaturan",
    short: "Atur",
    icon: IconSettings,
    subtitle: "Sesi, sinkronisasi, dan opsi lanjutan",
  },
];

function emailInitials(email) {
  const name = String(email || "").split("@")[0] || "?";
  return name
    .split(/[.\-_\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

export default function Layout({ view, onViewChange, sessionValid, loginEmail, onLogout, children }) {
  const current = NAV.find((n) => n.key === view);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">R</span>
          <div className="brand-text">
            <h1>RecapApp</h1>
            <span className="muted">Timedoor Academy</span>
          </div>
        </div>

        <nav className="nav" aria-label="Navigasi utama">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${view === key ? "active" : ""}`}
              onClick={() => onViewChange(key)}
              aria-current={view === key ? "page" : undefined}
            >
              <Icon width={18} height={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="side-foot">
          {loginEmail && (
            <div className="side-id" title={loginEmail}>
              <span className="avatar side-avatar">{emailInitials(loginEmail)}</span>
              <span className="side-id-mail ellip">{loginEmail}</span>
              <span className={`chip ${sessionValid ? "ok" : "neutral"} side-id-chip`}>
                <span className="dot" />
                {sessionValid ? "Sesi aktif" : "Sesi berakhir"}
              </span>
            </div>
          )}
          <div className="side-foot-row">
            <ThemeToggle />
            <button className="ghost small-btn side-logout" onClick={onLogout}>
              <IconLogout width={15} height={15} />
              Keluar
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="main-top">
          <div className="page-title">
            <h2>{current?.label}</h2>
            <span className="muted small">{current?.subtitle}</span>
          </div>
          <span className={`chip ${sessionValid ? "ok" : "neutral"}`}>
            <span className="dot" />
            {sessionValid ? "Sesi aktif" : "Sesi berakhir"}
          </span>
        </div>
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Navigasi bawah">
        {NAV.map(({ key, short, label, icon: Icon }) => (
          <button
            key={key}
            className={`bottom-nav-item ${view === key ? "active" : ""}`}
            onClick={() => onViewChange(key)}
            title={label}
            aria-current={view === key ? "page" : undefined}
          >
            <Icon width={20} height={20} />
            <span>{short}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
