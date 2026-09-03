import { IconClose } from "../../icons.jsx";

export default function ToastContainer({ toasts, onClose }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          <button onClick={() => onClose(t.id)} aria-label="Tutup">
            <IconClose width={14} height={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
