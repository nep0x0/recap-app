/**
 * Penghitung kegagalan polling agar putusnya koneksi tidak sunyi (R17).
 * Setelah >= 3 gagal beruntun -> toast err sekali;
 * saat pulih -> toast ok sekali dan counter di-reset.
 */
export function createConnGuard(notify) {
  let fails = 0;
  let warned = false;
  return {
    fail() {
      fails += 1;
      if (fails >= 3 && !warned) {
        warned = true;
        notify("err", "Koneksi ke server terputus — mencoba lagi…");
      }
    },
    ok() {
      if (warned) notify("ok", "Koneksi kembali normal.");
      fails = 0;
      warned = false;
    },
  };
}
