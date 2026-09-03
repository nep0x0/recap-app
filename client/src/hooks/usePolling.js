import { useEffect, useRef } from "react";

/**
 * Executes a callback at a fixed interval when enabled.
 *
 * @param {() => Promise<any> | any} callback
 * @param {number} intervalMs - interval in milliseconds
 * @param {boolean} [isEnabled=true]
 */
export function usePolling(callback, intervalMs = 3000, isEnabled = true) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isEnabled || intervalMs <= 0) return;

    // Run once immediately
    savedCallback.current?.();

    const id = setInterval(() => {
      savedCallback.current?.();
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs, isEnabled]);
}
