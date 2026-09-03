import { useEffect } from "react";
import useFocusTrap from "../../useFocusTrap";
import { IconClose } from "../../icons.jsx";

export default function Modal({ isOpen, onClose, title, children, maxWidth = 560, className = "" }) {
  const trapRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={trapRef}
        className={`modal-card card ${className}`}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title" style={{ margin: 0, fontSize: "1.15rem" }}>
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup dialog">
            <IconClose width={18} height={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
