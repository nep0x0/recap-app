import { useEffect, useRef } from "react";

/**
 * Focus trap sederhana untuk modal: fokus masuk ke elemen pertama,
 * Tab berputar di dalam modal, fokus dikembalikan saat modal tutup.
 * Escape ditangani pemilik modal (tidak diurus hook ini).
 */
export default function useFocusTrap(active) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const el = ref.current;
    const prev = document.activeElement;
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(el.querySelectorAll(sel)).filter((n) => !n.disabled);

    const first = focusables()[0];
    if (first) first.focus();
    else el.focus();

    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const firstEl = f[0];
      const lastEl = f[f.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === firstEl || !el.contains(cur))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && cur === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [active]);

  return ref;
}
