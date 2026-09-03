# RecapApp

Aplikasi web lokal untuk mengotomasi tugas-tugas administratif rutin guru di **CMS Timedoor Academy**:

- 🔄 **Sinkronisasi Siswa** — Mengambil dan memperbarui daftar siswa dari CMS ke basis data lokal secara otomatis.
- 📊 **Rekapitulasi Progres Belajar** — Mengumpulkan statistik progres belajar semua siswa (*mastery*, koin, riwayat kuis, dan penyelesaian *lesson*) ke dalam satu tabel ringkasan interaktif.
- 📝 **Jurnal Pertemuan Otomatis** — Menganalisis aktivitas *meeting* dari CMS, menyusun draf catatan dan penilaian adaptif (skor 70–100), lalu mengirimkannya ke jurnal siswa secara massal.
- 📚 **Sistem Report Siswa (Blok 8 Pertemuan)** — Memindai seluruh *course*, mendeteksi blok yang belum memiliki laporan (*due*), memuat kriteria dan narasi *template* langsung dari CMS, melengkapi jurnal yang kurang secara otomatis, hingga mengirim laporan blok baru.
- 📱 **Akses Multi-Device / LAN** — Dapat diakses dari browser komputer lokal maupun *smartphone* / *tablet* yang terhubung ke jaringan Wi-Fi lokal yang sama tanpa instalasi tambahan.

Arsitektur aplikasi terdiri dari server **Express (Node.js)** yang mengelola API REST, *background jobs*, dan basis data lokal **SQLite** (`node:sqlite`), sekaligus menyajikan *Single Page Application* (SPA) modern berbasis **React 19** dan **Vite** pada port yang sama.

---

## 📖 Navigasi Dokumentasi

| Dokumen | Target Pembaca | Keterangan |
|---|---|---|
| 📘 **[`USER_GUIDE.md`](./USER_GUIDE.md)** | **Guru / Admin** | Panduan pemakaian aplikasi langkah demi langkah untuk setiap fitur. |
| 🔌 **[`docs/API.md`](./docs/API.md)** | **Developer / Teknisi** | Dokumentasi teknis lengkap seluruh endpoint REST API, skema basis data, dan referensi endpoint CMS. |
| 📱 **[`docs/PRD_ANDROID_FLUTTER.md`](./docs/PRD_ANDROID_FLUTTER.md)** | **Product / Mobile Dev** | Product Requirement Document (PRD) untuk pengembangan RecapApp versi Android menggunakan Flutter. |

Dokumen `README.md` ini ditujukan bagi **developer / teknisi** untuk panduan instalasi, arsitektur, dan pemeliharaan aplikasi.

---

## 💻 Kebutuhan Sistem

- **Node.js ≥ 22.5.0** (Disarankan versi **Node.js 22 LTS** atau **Node.js 24**)
  > ⚠️ **Penting**: Aplikasi menggunakan modul bawaan `node:sqlite` (`DatabaseSync`), sehingga tidak memerlukan kompilasi *native* (*zero node-gyp*), namun membutuhkan Node.js versi 22.5.0 ke atas.
- **npm ≥ 9** (sudah terpasang bersama Node.js)
- Koneksi internet aktif ke server CMS Timedoor Academy (`https://cms.timedooracademy.com`)
- Sistem Operasi: Windows, macOS, atau Linux

---

## 🚀 Panduan Instalasi & Menjalankan

### 1. Salin / Clone Repositori

```bash
cd recap-app
```

### 2. Pasang Dependensi

Proyek menggunakan fitur *npm workspaces* untuk mengelola paket server dan client dalam satu langkah:

```bash
npm install
```

### 3. Menjalankan Aplikasi

#### Pilihan A: Mode Produksi (Direkomendasikan)
Cocok untuk penggunaan sehari-hari oleh guru. Perintah ini mengompilasi client (*Vite build*), lalu menjalankan server Express yang menyajikan API sekaligus antarmuka web:

```bash
# Kompilasi client lalu jalankan server:
npm start

# Atau jika client sudah pernah di-build sebelumnya:
npm run serve
```

#### Pilihan B: Mode Pengembangan (Development)
Gunakan dua terminal terpisah untuk mendapatkan fitur *auto-reload* pada server dan *Hot Module Replacement (HMR)* pada client:

```bash
# Terminal 1 — Server (node --watch mode):
npm run dev:server

# Terminal 2 — Client Vite dev server:
npm run dev:client
```

### 4. Mengakses Aplikasi

Setelah server berjalan, buka peramban web:
- Dari komputer lokal: **`http://localhost:3000`**
- Dari *smartphone* / *tablet* di Wi-Fi yang sama: **`http://<IP-LAN>:3000`** *(Alamat IP LAN lokal akan otomatis dicetak pada terminal saat server dijalankan).*

---

## ⚙️ Konfigurasi Environment

Aplikasi dapat dikonfigurasi melalui *environment variables* (opsional):

| Variabel | Nilai Bawaan | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port HTTP yang digunakan oleh server Express |
| `HOST` | `0.0.0.0` | Bind address jaringan (`0.0.0.0` untuk akses LAN, `127.0.0.1` untuk akses lokal saja) |

Contoh menjalankan di port custom:
```bash
PORT=8080 npm run serve
```

---

## 📂 Struktur Proyek

RecapApp dibangun dengan arsitektur modular berlapis (*layered modular architecture*):

```
recap-app/
├── client/                      # Frontend SPA (React 19 + Vite)
│   ├── src/
│   │   ├── components/          # Komponen UI modular
│   │   │   ├── common/          # Modal, Skeleton, StatusChip, ToastContainer
│   │   │   ├── layout/          # Splash screen, ServerDownScreen
│   │   │   └── report/          # ReportDueTable, ReportDoneTable, ReportLogsTable, ReportModal
│   │   ├── hooks/               # Custom hooks (usePolling, useToast, useFocusTrap)
│   │   ├── App.jsx              # Root component, navigasi tab & status monitor
│   │   ├── DashboardPage.jsx    # Halaman ringkasan rekapitulasi progres
│   │   ├── JournalPanel.jsx     # Panel pembuatan & pengiriman jurnal meeting
│   │   ├── ReportPage.jsx       # Halaman sistem pelaporan blok 8
│   │   ├── SettingsPage.jsx     # Pengaturan sesi CMS, sinkronisasi siswa & logs
│   │   ├── LoginPage.jsx        # Formulir autentikasi ke CMS Timedoor
│   │   ├── api.js               # Klien HTTP frontend untuk API lokal
│   │   └── styles.css           # Styling terpusat (Vanilla CSS modern)
│   ├── dist/                    # Hasil kompilasi Vite (diabaikan oleh git)
│   └── package.json
├── server/                      # Backend REST API & Services (Express)
│   ├── config.js                # Konfigurasi konstanta, path berkas, dan header CMS
│   ├── controllers/             # HTTP controller per domain fitur
│   │   ├── auth.controller.js
│   │   ├── journal.controller.js
│   │   ├── recap.controller.js
│   │   ├── report.controller.js
│   │   ├── report-done.controller.js
│   │   └── students.controller.js
│   ├── routes/                  # Modular routing Express
│   │   ├── index.js             # Hub rute API (/api)
│   │   ├── auth.routes.js
│   │   ├── journal.routes.js
│   │   ├── recap.routes.js
│   │   ├── report.routes.js
│   │   └── students.routes.js
│   ├── services/                # Business logic & integrasi API CMS
│   │   ├── journal/             # Perhitungan batas blok, skor, draf plan & fill
│   │   ├── recap/               # Pengumpulan progress detail, kuis & statistik
│   │   ├── report/              # Scanner blok, generator narasi, resolver jurnal, submit
│   │   ├── session/             # Manajemen sesi token, validasi & auto-refresh
│   │   └── sync.js              # Sinkronisasi paginasi data siswa CMS
│   ├── db/                      # Skema & inisialisasi basis data (node:sqlite)
│   │   └── index.js             # Singleton DatabaseSync & auto-migration skema
│   ├── lib/                     # Helper utilitas & klien CMS
│   │   ├── cms-client.js        # Wrapper HTTP client ke CMS dengan polite rate limiting
│   │   └── utils.js             # Deteksi IP LAN & helper formatting
│   ├── data/                    # Berkas database & profil lokal (diabaikan oleh git)
│   │   ├── recap.db             # Basis data SQLite lokal
│   │   ├── state.json           # Metadata sinkronisasi & status app
│   │   └── profile/
│   │       └── storage.json     # Token autentikasi CMS aktif
│   ├── index.js                 # Entry point server Express
│   └── package.json
├── docs/
│   └── API.md                   # Spesifikasi lengkap REST API lokal & CMS
├── USER_GUIDE.md                # Panduan panduan operasional guru & admin
├── README.md                    # Dokumentasi teknis developer (dokumen ini)
└── package.json                 # npm workspaces root
```

---

## 🛠️ Daftar Skrip NPM

Perintah yang dapat dijalankan dari direktori *root*:

| Perintah | Deskripsi |
|---|---|
| `npm install` | Memasang seluruh dependensi root, client, dan server sekaligus |
| `npm run build` | Mengompilasi aplikasi frontend ke folder `client/dist` via Vite |
| `npm run serve` | Menjalankan server Express (memerlukan `client/dist` yang sudah di-build) |
| `npm start` | Menjalankan `npm run build` diikuti oleh `npm run serve` |
| `npm run dev:server` | Menjalankan server Express dengan pengawasan perubahan berkas (`node --watch`) |
| `npm run dev:client` | Menjalankan dev server Vite untuk client dengan fitur HMR |

---

## 🗄️ Basis Data & Penyimpanan Lokal

Semua data lokal disimpan di dalam direktori `server/data/`:

### 1. Basis Data SQLite (`server/data/recap.db`)
Menggunakan mesin *embedded* bawaan Node.js (`node:sqlite`). Tabel-tabel yang dibuat secara otomatis meliputi:
- **`students`** — Menyimpan cache data profil siswa hasil sinkronisasi dari CMS.
- **`recaps`** — Menyimpan ringkasan progres belajar, statistik *mastery*, koin, dan kuis per siswa.
- **`report_scan`** — Hasil pemindaian blok laporan siswa, level *lesson* tertinggi, dan status per blok (*due*, *waiting_approval*, *approved*).
- **`report_done`** — Catatan *course* / *book* yang secara manual ditandai selesai oleh guru.
- **`report_log`** — Riwayat pengiriman laporan ke CMS (status sukses, pesan balasan, atau error).
- **`journal_log`** — Riwayat pengiriman jurnal pertemuan ke CMS.

### 2. Berkas Konfigurasi & Kredensial
- **`state.json`** — Menyimpan metadata status aplikasi seperti tanggal sinkronisasi terakhir dan jumlah siswa.
- **`profile/storage.json`** — Menyimpan token sesi aktif CMS (`access_token` dan `refresh_token`).

> 🔒 **Keamanan Kredensial**: Seluruh isi folder `server/data/` dikecualikan oleh `.gitignore`. Jangan pernah memasukkan (*commit*) berkas dalam folder ini ke repositori publik untuk mencegah kebocoran token login CMS.

---

## 💡 Konsep Arsitektur Teknis

1. **Polite Request Throttling (Rate Limiting CMS)**:
   - Setiap pemanggilan ke endpoint CMS Timedoor Academy diberi jeda waktu aman (**400 ms**) melalui `cms-client.js`. Hal ini menjaga kestabilan dan mencegah akun terblokir karena *rate limit* atau beban berlebih ke server CMS.
2. **Background Jobs & Status Polling**:
   - Operasi berat yang memerlukan banyak request ke CMS (seperti rekapitulasi progres semua siswa, pemindaian blok report, dan pengiriman jurnal massal) dieksekusi sebagai *background job* di server.
   - Frontend memantau kemajuan proses secara non-blocking melalui mekanisme *polling* status dengan indikator visual *progress bar*.
3. **Siklus Sesi Otomatis (Session Refresh)**:
   - Server memvalidasi token sesi CMS saat aplikasi digunakan. Jika *access token* kedaluwarsa, server otomatis melakukan pembaruan menggunakan *refresh token* tanpa memutus alur kerja guru.
4. **Auto-Fill Jurnal pada Pembuatan Report**:
   - Jika saat membuat laporan blok 8 pertemuan ditemukan pertemuan yang belum memiliki jurnal di CMS, server akan otomatis menyusun dan mengunggah jurnal pertemuan tersebut sebelum laporan resmi dikirimkan.

---

## 🤝 Kontribusi & Bantuan

Bila menemukan kendala atau ingin berkontribusi:
1. Pastikan memeriksa panduan **[`USER_GUIDE.md`](./USER_GUIDE.md)** untuk alur kerja fungsional.
2. Periksa rincian struktur request dan response di **[`docs/API.md`](./docs/API.md)**.
3. Pastikan versi Node.js yang Anda gunakan memenuhi syarat minimal (≥ 22.5.0).
