import { IconRefresh, IconWifiOff } from "../../icons.jsx";

export default function ServerDownScreen({ onRetry }) {
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
