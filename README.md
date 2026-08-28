# RecapApp

Aplikasi web lokal untuk mengotomasi tugas-tugas rutin guru di CMS :

- 🔄 **Sync siswa** — tarik daftar siswa dari CMS ke database lokal.
- 📊 **Rekap progres** — kumpulkan progres semua siswa (mastery, coin, lesson) menjadi satu tabel.
- 📝 **Jurnal meeting** — buat draf catatan meeting dari CMS, lalu kirim otomatis ke jurnal siswa.
- 📚 **Report blok 8 pertemuan** — pindai blok report yang belum lengkap, tandai selesai, dan buat report baru ke CMS.

Server adalah **Express (Node.js)** yang menyajikan API JSON + SPA Vite/React di port yang sama. Tidak butuh layanan eksternal selain akses ke CMS Timedoor.

---

## Untuk pengguna (guru / admin)

> Kalau kamu ingin langsung memakai aplikasinya, buka **[`USER_GUIDE.md`](./USER_GUIDE.md)** — panduan langkah demi langkah per fitur.

Dokumen ini khusus untuk **developer / teknisi** yang memasang dan menjalankan RecapApp.

---

## Untuk developer

### Kebutuhan sistem

- **Node.js ≥ 18** (disarankan 20 LTS)
- **npm ≥ 9** (sudah termasuk saat install Node)
- Koneksi internet ke CMS Timedoor Academy (untuk login & sinkronisasi)
- OS: Windows / macOS / Linux

### Cara install

```bash
# 1. Clone / salin folder proyek
cd recap-app

# 2. Install dependensi (root + client + server via npm workspaces)
npm install

# 3. Build client (hasil ada di client/dist)
npm run build
```

### Cara menjalankan

```bash
# Mode produksi: build client lalu jalankan server
npm start

# atau pisah (untuk development):
# terminal 1
npm run dev:server
# terminal 2
npm run dev:client
```

Buka **http://localhost:3000** di browser. Alamat LAN juga akan ditampilkan di konsol server (berguna saat diakses dari gadget lain di jaringan yang sama).

### Konfigurasi (opsional)

| Env     | Default     | Keterangan                                    |
|---------|-------------|-----------------------------------------------|
| `PORT`  | `3000`      | Port HTTP server                              |
| `HOST`  | `0.0.0.0`   | Bind address (`127.0.0.1` untuk lokal saja)   |

Contoh:

```bash
PORT=8080 npm start
```

### Struktur folder

```
recap-app/
├── server/              # Express + layanan CMS
│   ├── index.js         # Entry point, routing
│   ├── services/        # session, sync, recap, journal, report
│   └── data/            # (tidak di-commit) DB siswa, sesi login
├── client/              # Vite + React SPA
│   ├── src/             # Komponen, halaman, ikon
│   └── dist/            # (tidak di-commit) Build output
├── docs/
│   └── API.md           # Referensi lengkap endpoint API
├── USER_GUIDE.md        # Panduan pengguna
└── package.json         # npm workspaces
```

### Skrip npm

| Perintah              | Fungsi                                              |
|-----------------------|-----------------------------------------------------|
| `npm install`         | Install semua workspace                             |
| `npm run build`       | Build client (vite build)                           |
| `npm run serve`       | Jalankan server saja (butuh `client/dist`)          |
| `npm start`           | `build` + `serve`                                   |
| `npm run dev:server`  | Jalankan server dengan auto-reload file watch       |
| `npm run dev:client`  | Jalankan Vite dev server (HMR)                      |

### Data lokal yang disimpan

Disimpan di `server/data/` (tidak masuk git):

- `students.json` — cache daftar siswa hasil sinkronisasi
- `profile/storage.json` — sesi login CMS guru (`access_token`, `refresh_token`)
- `profile/done.json` — daftar book yang ditandai selesai manual
- `profile/recap-logs.json`, `journal-logs.json`, `report-logs.json` — histori job

> ⚠️ Folder ini berisi token CMS. **Jangan commit**, jangan disalin ke mesin lain tanpa memastikan `.gitignore` aktif.

### Referensi

- 📘 **[`USER_GUIDE.md`](./USER_GUIDE.md)** — panduan langkah demi langkah untuk pengguna
- 🔌 **[`docs/API.md`](./docs/API.md)** — referensi lengkap endpoint API
