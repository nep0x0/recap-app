import { useState } from "react";
import { api } from "./api.js";
import StudentsRaw from "./StudentsRaw.jsx";
import { fmtTs } from "./fmt.js";
import { IconRefresh, IconLogout, IconUser, IconClock, IconChevronDown } from "./icons.jsx";

export default function SettingsPage({ status, sessionValid, busy, act, onLogout }) {
  const [showDebug, setShowDebug] = useState(false);

  const rows = [
    { icon: IconUser, label: "Masuk sebagai", value: status?.loginEmail || "—" },
    { icon: IconUser, label: "Status sesi", value: sessionValid ? "Aktif" : "Belum masuk" },
    { icon: IconClock, label: "Dicek terakhir", value: status?.lastCheckAt ? fmtTs(status.lastCheckAt) : "—" },
    { icon: IconUser, label: "Siswa tersimpan", value: `${status?.studentCount ?? 0} siswa` },
    { icon: IconClock, label: "Sync terakhir", value: status?.lastSyncAt ? fmtTs(status.lastSyncAt) : "—" },
  ];

  return (
    <div className="settings">
      <section className="card">
        <div className="sect-head">
          <h3>Info Sesi</h3>
          <span className="muted small">Status koneksi ke CMS guru</span>
        </div>
        <div className="infolist">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="inforow">
              <Icon width={16} height={16} />
              <span className="muted small">{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="sect-head">
          <h3>Data &amp; Sinkronisasi</h3>
          <span className="muted small">Muat ulang daftar siswa dari CMS</span>
        </div>
        <div className="row">
          <button className="primary" disabled={!sessionValid || busy} onClick={() => act("Muat data siswa", () => api.sync())}>
            {busy ? <span className="spinner sm" /> : <IconRefresh width={16} height={16} />}
            Muat data siswa
          </button>
          <span className="muted small">Menarik daftar siswa terbaru — hasilnya disimpan lokal.</span>
        </div>
      </section>

      <section className="card">
        <div className="sect-head">
          <h3>Sesi</h3>
          <span className="muted small">Keluar dari akun guru</span>
        </div>
        <button className="danger" onClick={onLogout}>
          <IconLogout width={16} height={16} />
          Keluar dari CMS
        </button>
      </section>

      <details className="card debug" open={showDebug} onToggle={(e) => setShowDebug(e.currentTarget.open)}>
        <summary>
          Data mentah siswa
          <span className="muted small">(debug — tabel lengkap dari CMS)</span>
          <IconChevronDown width={15} height={15} className={showDebug ? "rot" : ""} />
        </summary>
        <div className="rawbody">
          <StudentsRaw busy={busy} act={act} />
        </div>
      </details>
    </div>
  );
}