import { useState, useRef, useCallback } from "react";

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const notify = useCallback((kind, text) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, kind, text }]);

    const duration = kind === "err" ? 9000 : 5200;
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, duration);
  }, []);

  const closeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return {
    toasts,
    notify,
    closeToast,
  };
}
