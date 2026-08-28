import { useState } from "react";
import { IconKey, IconEye, IconEyeOff } from "./icons.jsx";

export default function LoginPage({ busy, notice, onApiLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [showP, setShowP] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!u || !p || busy) return;
    setErr("");
    const r = await onApiLogin(u, p);
    if (!r?.ok) setErr(r?.message || "Login gagal.");
  };

  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="login-brand">
          <span className="logo">R</span>
          <div>
            <h1>RecapApp</h1>
            <span className="muted">Otomasi laporan siswa · Timedoor Academy</span>
          </div>
        </div>

        <p className="login-desc">
          Masuk untuk mengakses data siswa, recap pelajaran, dan jurnal meeting dari CMS.
        </p>

        {notice && <div className="banner banner-warn">{notice}</div>}
        {err && (
          <div className="banner banner-err">
            {err}
            {!busy && <span className="small"> — periksa email/password lalu coba lagi.</span>}
          </div>
        )}

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label>
            <span>Email guru</span>
            <input
              type="text"
              placeholder="nama@timedooracademy.com"
              value={u}
              autoFocus
              autoComplete="username"
              disabled={busy}
              onChange={(e) => setU(e.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <span className="pw-field">
              <input
                type={showP ? "text" : "password"}
                placeholder="••••••••"
                value={p}
                autoComplete="current-password"
                disabled={busy}
                onChange={(e) => setP(e.target.value)}
              />
              <button
                type="button"
                className="pw-toggle quiet"
                onClick={() => setShowP((s) => !s)}
                aria-label={showP ? "Sembunyikan password" : "Tampilkan password"}
                title={showP ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showP ? <IconEyeOff width={16} height={16} /> : <IconEye width={16} height={16} />}
              </button>
            </span>
          </label>
          <button className="primary full" type="submit" disabled={busy || !u || !p}>
            {busy ? <span className="spinner sm" /> : <IconKey width={16} height={16} />}
            {busy ? "Memvalidasi…" : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
