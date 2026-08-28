import { useEffect } from "react";
import useFocusTrap from "./useFocusTrap.js";
import { IconAlert } from "./icons.jsx";

/**
 * Dialog konfirmasi kecil reusable (R15) — menggantikan window.confirm.
 * danger=true memakai tombol merah untuk aksi destruktif.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Lanjutkan",
  cancelLabel = "Batal",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal modal-confirm" ref={trapRef} role="alertdialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="confirm-head">
          <span className={`confirm-ico ${danger ? "bad" : "warn"}`}>
            <IconAlert width={18} height={18} />
          </span>
          <h3>{title}</h3>
        </div>
        {description && <p className="confirm-desc">{description}</p>}
        <div className="modal-foot">
          <button className="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
