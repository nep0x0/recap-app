# PRD — Perbaikan UI/UX RecapApp ("Proyek Rapi")

| Field | Nilai |
|---|---|
| Dokumen | `prd-perbaikan-ui-ux.md` |
| Tanggal | 18 Agustus 2026 |
| Status | Draft — siap direview |
| Produk | RecapApp (client React + server Express, `localhost:3000`) |
| Scope | UI/UX sisi client (`client/src/*`); 1 perubahan kecil server (simpan email login) |
| Prinsip | Perbaikan inkremental — tanpa library baru, tanpa redesign total, tanpa mengubah API yang sudah ada |

---

## 1. Ringkasan Eksekutif

RecapApp sudah punya fondasi visual yang bersih (kartu, chip, toast, skeleton, responsive mobile di halaman Report). Masalah utamanya bukan "jelek", tapi **kurang rapi dan kurang konsisten**: ada bug tampilan yang membuat fitur tampak rusak, dua sistem tombol/badge yang tumpang tindih, feedback proses panjang yang minim, hilangnya state saat refresh, dan ketimpangan kualitas antar halaman (Report sangat tergarap, Dashboard/Recap lemah di mobile).

PRD ini berisi **26 temuan audit** (dengan referensi file) dan **8 workstream perbaikan** berprioritas P0–P2, lengkap dengan kriteria terima, estimasi effort, dan rencana rilis 3 fase. Target: aplikasi terasa konsisten, jujur (status selalu jelas), dan aman (tidak ada kehilangan kerja pengguna) — dengan usaha total ±4–6 hari kerja.

---

## 2. Latar Belakang & Konteks Produk

RecapApp adalah tool internal guru **Timedoor Academy** untuk otomasi laporan siswa dari CMS (`cms.timedooracademy.com`):

1. **Ringkasan (Dashboard)** — sync daftar siswa + buat recap progres/mastery/coin semua siswa (job ±1 menit).
2. **Jurnal Meeting** — susun draf catatan meeting, edit, lalu isi massal ke CMS.
3. **Report Siswa** — pindai blok 8/16/24/32 yang belum berreport, buat report per blok lewat modal kriteria.
4. **Pengaturan** — info sesi, sync ulang, logout, data mentah (debug).

Konteks pemakaian yang memengaruhi keputusan desain:

- Dipakai **desktop dan HP** lewat LAN (`server.log` menampilkan URL Wi-Fi), jadi parity mobile wajib.
- Pengguna adalah **guru, bukan engineer** — data mentah/JSON harus disembunyikan atau dirapikan.
- Proses backend **lambat** (rate limit CMS 400 ms/request; recap ±1 menit untuk 32 siswa) — feedback progres adalah kebutuhan inti.
- Aksi menulis ke CMS bersifat **sulit dibatalkan** (jurnal/report terkirim ke sistem nyata) — konfirmasi & proteksi kehilangan data penting.

**Yang sudah baik (jangan diubah sembarangan):** palet warna & kartu, toast dengan auto-dismiss, skeleton loading, modal bottom-sheet di mobile, tab + filter chip di halaman Report, mikrocopy berbahasa Indonesia yang ramah.

---

## 3. Tujuan & Non-Tujuan

### Tujuan
1. **G1 — Tidak ada state "rusak/menipu":** setiap kondisi (server mati, panel debug, validasi gagal) terlihat dan terjelaskan.
2. **G2 — Satu bahasa visual:** satu sistem tombol, satu sistem badge/chip status, satu warna per makna semantik.
3. **G3 — Proses panjang selalu terlihat:** recap/scan/fill punya progress bar + estimasi, bukan cuma teks "x/y".
4. **G4 — Parity mobile di semua halaman utama.**
5. **G5 — Tidak ada kehilangan kerja pengguna** (edit jurnal, pilihan tab, view aktif).

### Non-Tujuan
- Menambah dependency UI library (tetap React polos + CSS murni).
- Mengubah arsitektur server/endpoint API (kecuali 1 tambahan field kecil, §WS3).
- Dark mode, i18n multi-bahasa, multi-user/role (dicatat sebagai ide masa depan, §10).
- Mengubah alur bisnis (urutan sync → recap → jurnal → report tetap).

---

## 4. Persona & Skenario Utama

**Persona:** Guru Timedoor (1 akun CMS per guru, 30-an siswa). Meja kerja: laptop saat mengajar; HP untuk cek cepat & bikin jurnal di sela waktu.

| # | Skenario | Halaman |
|---|---|---|
| S1 | Awal minggu: sync siswa → buat recap → cek siswa "perlu perhatian" | Ringkasan |
| S2 | Setelah kelas: pilih beberapa meeting → edit draf jurnal → isi ke CMS | Jurnal Meeting |
| S3 | Akhir blok: pindai → klik blok → isi nilai kriteria → kirim report | Report Siswa |
| S4 | Sesi habis di tengah kerja: sadar dari banner/chip, login lagi, lanjut | Login / semua |

---

## 5. Audit Kondisi Saat Ini

Format: `ID — lokasi — masalah — dampak`. Severity: 🔴 tinggi, 🟠 sedang, 🟡 rendah.

### A. Bug & state menyesatkan

| ID | Lokasi | Temuan | Sev |
|---|---|---|---|
| A1 | `SettingsPage.jsx:60` | `<details open={false}>` di-hardcode; state `showDebug` diisi lewat `onToggle` tapi **tidak pernah di-bind balik** ke `open`. Panel "Data mentah siswa" hampir pasti tidak pernah bisa dibuka (React me-reset `open=false` tiap re-render). | 🔴 |
| A2 | `App.jsx:57-65, 188` | Saat server tidak terjangkau, `status=null` → `sessionValid=false` → **halaman login muncul**. "Server mati" tampil seolah "belum login"; guru bisa mengira akunnya bermasalah. | 🔴 |
| A3 | `JournalPanel.jsx:173, 76` | Tombol **Buat Ulang** membuang plan lama dan menimpa `notes` dengan draf server — **edit manual pengguna hilang tanpa peringatan**. | 🔴 |
| A4 | `StudentsRaw.jsx:59` | Copy error menyebut *"Ulangi langkah 1 di atas"* — merujuk wizard lama yang sudah tidak ada. | 🟡 |
| A5 | `ReportPage.jsx:9` + `styles.css:1096-1113` | Status "gagal" memakai `<span class="badge badu">` — kelas terpisah dari sistem `.chip`, penamaan membingungkan, style duplikat. | 🟠 |

### B. Konsistensi visual & komponen

| ID | Lokasi | Temuan | Sev |
|---|---|---|---|
| B1 | `styles.css:659-674`, `StudentsRaw.jsx:82` | Elemen `button` polos **default-nya = gaya primary** (ungu solid). Akibatnya tombol sekunder (mis. "Muat data dari CMS" di debug) tampil selevel CTA utama. Hierarki tombol terbalik. | 🟠 |
| B2 | `styles.css:1471-1473` | `.toast.info` diberi garis warna **warn** (oranye); tidak ada token `--info`. Warna tidak lagi mewakili makna. | 🟠 |
| B3 | `styles.css:222-396, 1096-1113` | Dua sistem status tumpang tindih: `.chip.*` (ok/no/fail/wait) dan `.badge.*` (warn, badu). Komponen berbeda memilih sistem berbeda. | 🟠 |
| B4 | `DashboardPage.jsx:78`, `SettingsPage.jsx:43`, `StudentsRaw.jsx:83` | Operasi yang sama dipanggil tiga nama: "Muat Data Siswa", "Muat Data Siswa", "Muat data dari CMS". Kapitalisasi tombol pun campur (Title Case vs sentence case). | 🟡 |
| B5 | `Layout.jsx:44-48` + `ReportPage.jsx:280,431,534` | Judul halaman muncul dua kali: header utama ("Report Siswa") lalu `<h2>` lagi di dalam kartu ("Perlu Report", "Riwayat", …). Berisik dan membingungkan hierarki. | 🟡 |
| B6 | `styles.css:36-71` | Skala tipografi rapat: base 14.5px, h1 16px, h2 22px, h3 15px — h1 dan h3 nyaris sama; hierarki judul lemah. | 🟡 |

### C. Navigasi & arsitektur informasi

| ID | Lokasi | Temuan | Sev |
|---|---|---|---|
| C1 | `App.jsx:40` | View aktif (`dashboard/journal/report/settings`) **reset ke dashboard setiap refresh** — guru yang selalu bekerja di Jurnal harus klik ulang tiap buka. | 🟠 |
| C2 | `Layout.jsx:36-41`, `server/services/session.js` | **Identitas guru tidak ditampilkan di mana pun** (sidebar hanya tombol Keluar; state server hanya menyimpan token, bukan email). Pengguna tidak bisa memastikan akun mana yang aktif — penting karena tool menulis ke CMS atas nama akun itu. | 🟠 |
| C3 | `Layout.jsx:48` | Subjudul halaman berupa ternary berantai di JSX — rapuh, akan makin panjang tiap halaman baru. | 🟡 |

### D. Feedback & status proses

| ID | Lokasi | Temuan | Sev |
|---|---|---|---|
| D1 | `DashboardPage.jsx:66, 90-91`, `RecapTable.jsx:177-179` | Proses ±1 menit hanya diberi teks "Siswa ke-x dari y" / pulsetext kecil. **Tidak ada progress bar** — guru tidak tahu berapa lama lagi, dan tombol CTA berubah label tanpa konteks progres. | 🟠 |
| D2 | `ReportPage.jsx:194-204, 701` | Tombol "Buat Report Blok N" disabled **tanpa penjelasan** (skor kosong/bukan bilangan bulat/0–100, jurnal belum ada, dsb.). Pengguna bingung mengapa tidak bisa klik. | 🔴 |
| D3 | banyak (`App.jsx:103,123`, `ReportPage.jsx:58,65,73`, `JournalPanel.jsx:25,130`) | `catch {}` kosong pada polling — kegagalan jaringan sunyi total. | 🟡 |
| D4 | `RecapTable.jsx:128, 246` | Semua grup siswa **kolaps default**; tabel utama dashboard hanya menampilkan daftar nama sampai tiap baris diklik satu-satu. | 🟠 |
| D5 | `RecapTable.jsx:61` | Riwayat quiz ditampilkan sebagai **JSON mentah** di `<pre>` — tidak bisa dibaca guru. | 🟡 |
| D6 | `JournalPanel.jsx:292-295` | Ada mikrocopy "tersimpan otomatis · belum dikirim" (bagus), tapi **tidak ada penanda visual notes mana yang sudah diedit** dari draf — saat review puluhan baris, guru tidak tahu mana yang perlu dicek ulang. | 🟠 |

### E. Mobile

| ID | Lokasi | Temuan | Sev |
|---|---|---|---|
| E1 | `RecapTable.jsx` (bandingkan `ReportPage.jsx:381-423`) | Halaman Report punya `tbl-mobile` (kartu) + `tbl-desktop`; **tabel Recap tidak** — di HP hanya scroll horizontal dengan kolom terpotong `hide-sm`. Halaman paling penting justru paling lemah di mobile. | 🟠 |
| E2 | `Layout.jsx:58-70` | Label bottom-nav panjang ("Jurnal Meeting", "Report Siswa") pada font 11.5px di layar ≤375px — risiko terpotong/terasa sesak. | 🟡 |

### F. Aksesibilitas & polish

| ID | Lokasi | Temuan | Sev |
|---|---|---|---|
| F1 | `RecapTable.jsx:23,237`, `JournalPanel.jsx:212-215` | Baris klikabel (`tr.grp`, `tr.course.click`, `.jitem`) hanya `onClick` — **tidak bisa diakses keyboard** (tanpa `tabIndex`/`role`/`onKeyDown`). | 🟠 |
| F2 | `styles.css:9` | `--muted: #8a94a6` di atas putih ≈ **3.4:1** — di bawah WCAG AA (4.5:1) untuk teks kecil yang banyak dipakai (`.muted.small`). | 🟡 |
| F3 | `index.html` | Tanpa favicon, `theme-color`, meta description — tab browser polos, install-as-app di HP tanpa ikon. | 🟡 |
| F4 | `ReportPage.jsx:613-614` | Modal mendukung Esc + klik backdrop (bagus), tapi **tanpa focus trap** — Tab bisa keluar dari dialog. | 🟡 |
| F5 | `LoginPage.jsx` | Tidak ada toggle tampil/sembunyikan password; error salah kredensial hanya banner (sudah cukup, tapi tanpa saran tindakan). | 🟡 |
| F6 | `icons.jsx:119` | `IconBook` diekspor tapi tidak pernah dipakai (dead code). | 🟡 |

---

## 6. Usulan Perbaikan (Workstream)

Estimasi effort: **S** ≤ 2 jam · **M** ≈ ½ hari · **L** ≈ 1 hari+.

### WS1 — Perbaiki bug & state menyesatkan 🔴 P0

| ID | Perbaikan | Spesifikasi | File | Effort |
|---|---|---|---|---|
| R1 (A1) | Panel debug berfungsi | Ikat `open` ke state: `<details open={showDebug} onToggle={e => setShowDebug(e.currentTarget.open)}>`. Pastikan ikon chevron berputar mengikuti state. | `SettingsPage.jsx` | S |
| R2 (A2) | Bedakan "server mati" vs "belum login" | Di `loadStatus`, tangkap kegagalan fetch sebagai state terpisah (`serverReachable=false`). Tampilkan layar khusus (bukan form login): ikon alert, teks "Tidak bisa menghubungi server RecapApp", tombol "Coba lagi" (panggil ulang `loadStatus`). Jika sebelumnya login valid lalu server mati, jangan tampilkan notice "sesi berakhir". | `App.jsx`, `styles.css` | M |
| R3 (A3) | Proteksi edit jurnal saat Buat Ulang | Jika ada ≥1 notes yang diedit (bandingkan `notes[key] !== entry.note` asal), "Buat Ulang" membuka **ConfirmDialog** (§WS4): *"N catatan editanmu akan diganti draf baru dari CMS. Lanjut?"* — opsi `Batal` / `Buat Ulang`. Simpan daftar key teredit sebelum menimpa agar bisa ditandai ulang. | `JournalPanel.jsx` | M |
| R4 (D2) | Validasi modal report terlihat | Di bawah tombol submit, tampilkan alasan disabled secara dinamis (hanya saat relevan): "Isi skor 0–100 untuk kriteria X", "Skor harus bilangan bulat", "Jurnal belum tersedia — buat lewat Jurnal Meeting". Teks kecil warna `--bad`, ikon alert. Kirim tetap dilarang. | `ReportPage.jsx`, `styles.css` | S |

**Kriteria terima WS1:** panel debug bisa dibuka-tutup; cabut/matikan server → layar "server tidak terjangkau" muncul (bukan login); edit jurnal tidak bisa hilang tanpa konfirmasi eksplisit; setiap kondisi disabled tombol report selalu punya teks alasan.

### WS2 — Design system mini (tombol, chip, warna semantik) 🟠 P1

| ID | Perbaikan | Spesifikasi | File | Effort |
|---|---|---|---|---|
| R5 (B1) | Hierarki tombol benar | Balik default: `button` polos = gaya **secondary** (permukaan putih + border, gaya `.ghost` sekarang). Kelas `.primary` dipakai eksplisit untuk CTA (tetap ungu). Audit semua tombol polos yang ada (mis. `StudentsRaw`). Tambah varian `.quiet` (tanpa border, untuk aksi kecil di baris) bila perlu. | `styles.css`, semua JSX dengan `<button>` | M |
| R6 (B3, A5) | Satu sistem status | Hapus `.badu`; semua status memakai `.chip` dengan varian: `.ok`, `.warn`, `.fail`, `.info`, `.neutral` (ganti `.no`), `.wait`. `StatusChip` di ReportPage memakai chip `fail` untuk "gagal". | `styles.css`, `ReportPage.jsx` | S |
| R7 (B2) | Token warna semantik lengkap | Tambah `--info: #0284c7; --info-soft: #eff6ff;` (biru, jelas beda dari warn-oranye dan accent-ungu). `.toast.info`, `.banner-info` memakai `--info`. Accent tetap ungu untuk brand/aksi, bukan untuk "informasi". | `styles.css` | S |
| R8 (B4) | Satu nama per aksi | Operasi sync siswa disebut **"Muat data siswa"** di semua tempat (sentence case). Tetapkan aturan copy: tombol = sentence case, kalimat kerja ("Buat rencana", "Perbarui recap", "Isi ke CMS"). Terapkan ke seluruh label tombol/judul. | semua JSX | S |
| R9 (B5, C3) | Satu judul per halaman | Pindahkan subjudul ke map `NAV` di `Layout.jsx` (`subtitle` per key). Di halaman Report, hapus `<h2>` duplikat dalam tab — cukup heading tab + deskripsi kecil. Judul kartu section memakai `h3.sect-title` saja. | `Layout.jsx`, `ReportPage.jsx` | S |
| R10 (B6) | Skala heading rapi | Sesuaikan: h1 17px/650 (brand), h2 20px/650 (judul halaman), h3 15px/600 (section). Base body tetap 14.5px. | `styles.css` | S |

**Kriteria terima WS2:** tidak ada tombol sekunder yang tampil ungu solid; hanya ada satu kelas sistem status; setiap warna punya tepat satu makna; satu operasi = satu nama di seluruh UI.

### WS3 — Navigasi, identitas sesi, persistensi 🟠 P1

| ID | Perbaikan | Spesifikasi | File | Effort |
|---|---|---|---|---|
| R11 (C1) | View aktif bertahan | Simpan view ke `localStorage("recapapp.view")`; inisialisasi `useState` dari sana. (Tanpa router — cukup persistensi.) | `App.jsx` | S |
| R12 (C2) | Kartu identitas guru | Server: simpan `loginEmail` (dari input login) ke `state.json` saat `loginViaApi` sukses; bersihkan saat logout; ikut di respons `/api/status`. Client: di sidebar bawah (di atas tombol Keluar) tampilkan avatar inisial + email (terpotong ellipsis) + chip "Sesi aktif". Versi mobile: tampilkan di header ringkas di atas konten bila murah; jika tidak, cukup di Settings. Di `SettingsPage` baris "Masuk sebagai {email}". | `server/services/session.js`, `server/index.js`, `Layout.jsx`, `SettingsPage.jsx` | M |
| R13 (C3) | Data-driven page header | Subjudul berasal dari array NAV (lihat R9); chip status sesi dipindah ke samping identitas (bukan pojok bebas) agar area atas konsisten. | `Layout.jsx` | S |

**Kriteria terima WS3:** refresh di halaman Jurnal tetap membuka Jurnal; email akun terlihat di sidebar & Settings; logout membersihkan email tersimpan.

### WS4 — Feedback proses & dialog 🟠 P1

| ID | Perbaikan | Spesifikasi | File | Effort |
|---|---|---|---|---|
| R14 (D1) | Progress bar proses panjang | Komponen `<Progress current total label>` (track + fill accent + persen + teks "Siswa 12/32 — Nama"). Dipakai di actionbar Dashboard saat recap berjalan (mengganti perubahan label tombol yang membingungkan; tombol tetap disabled dengan spinner). Nilai dari `recapState` yang sudah ada — tanpa endpoint baru. | `DashboardPage.jsx`, `styles.css` | M |
| R15 | ConfirmDialog menggantikan `window.confirm` | Komponen modal kecil reusable (backdrop, judul, deskripsi, tombol Batal + Primary/Danger). Dipakai untuk: konfirmasi isi jurnal (`JournalPanel.jsx:99`) dan Buat Ulang (R3). Konsisten dengan gaya modal ReportPage. | baru `ConfirmDialog.jsx`, `JournalPanel.jsx` | M |
| R16 (D6) | Penanda "notes diedit" | Bandingkan `notes[key]` dengan draf asli (simpan `drafts` saat plan dibuat). Baris jurnal teredit menampilkan dot/titik accent + label kecil "diedit" di `jitem-right`; textarea editor menampilkan hitungan karakter + tombol "Kembalikan ke draf". | `JournalPanel.jsx`, `styles.css` | M |
| R17 (D3) | Error polling tidak sunyi | Bungkus polling dengan helper yang menghitung kegagalan beruntun; setelah ≥3 kali gagal tampilkan toast err sekali ("Koneksi ke server terputus — mencoba lagi…") dan pulihkan dengan toast ok saat berhasil. | `App.jsx`, `JournalPanel.jsx`, `ReportPage.jsx` | M |

**Kriteria terima WS4:** setiap job ≥10 detik menampilkan progress bar bergerak; tidak ada `window.confirm` native; baris jurnal teredit selalu bisa dibedakan sekilas; putusnya koneksi sementara terlihat oleh pengguna.

### WS5 — Dashboard lebih informatif 🟠 P1

| ID | Perbaikan | Spesifikasi | File | Effort |
|---|---|---|---|---|
| R18 (D4) | Ekspansi grup masuk akal | Default: grup dengan "perlu perhatian" terbuka, sisanya kolaps (maks 5 grup terbuka pertama). Tambah tombol kecil "Buka semua / Tutup semua" di toolbar. | `RecapTable.jsx` | M |
| R19 | Label stat jelas | Ganti hint membingungkan: "Course diikuti — baris progress" → "Total course aktif"; "Rata-rata progress — dari course berisi" → "Rata-rata progress course yang sudah berjalan". Stat "Perlu perhatian" dibuat **klikabel** → mengaktifkan filter `onlyAtt` di tabel bawah. | `DashboardPage.jsx`, `RecapTable.jsx` | S |
| R20 (D5) | Detail quiz manusiawi | Ganti `<pre>` JSON dengan tabel kecil: waktu attempt, skor, status (pakai pola `table.inner` yang sudah ada). JSON mentah tetap tersedia di balik `<details>` "Lihat data mentah" untuk debug. | `RecapTable.jsx` | M |
| R21 | Toolbar search lebih jelas | Tambah ikon search di dalam input, tombol ✕ untuk clear saat terisi, dan teks hasil "X siswa · Y baris" dipindah ke kanan toolbar (sudah ada, pastikan tidak bentrok saat wrap di mobile). | `RecapTable.jsx`, `styles.css` | S |

**Kriteria terima WS5:** buka dashboard → minimal siswa "perlu perhatian" langsung terlihat tanpa klik; klik stat "Perlu perhatian" memfilter tabel; detail quiz terbaca tanpa membaca JSON.

### WS6 — Parity mobile 🟠 P1

| ID | Perbaikan | Spesifikasi | File | Effort |
|---|---|---|---|---|
| R22 (E1) | Kartu mobile untuk Recap | Ikuti pola `tbl-mobile`/`mcard` ReportPage: kartu per grup siswa (avatar, nama, badge perhatian), course sebagai baris ringkas (nama + minibar progress + tanggal relatif). Breakpoint sama (≤768px). | `RecapTable.jsx`, `styles.css` | L |
| R23 (E2) | Bottom-nav ringkas | Label pendek 1 kata: "Ringkasan", "Jurnal", "Report", "Aturan"? — usulan: **Ringkasan · Jurnal · Report · Atur**. Tooltip/title tetap memakai nama lengkap. Uji di lebar 360px. | `Layout.jsx` | S |
| R24 | Actionbar mobile | Di ≤640px, tombol CTA actionbar full-width di bawah deskripsi (pakai pola `.stack-sm` yang sudah ada) agar tidak terpotong. | `DashboardPage.jsx`, `styles.css` | S |

**Kriteria terima WS6:** halaman Ringkasan usable di 375px tanpa scroll horizontal; semua navigasi bottom-nav muat satu baris tanpa terpotong.

### WS7 — Aksesibilitas & polish 🟡 P2

| ID | Perbaikan | Spesifikasi | File | Effort |
|---|---|---|---|---|
| R25 (F1) | Baris klikabel via keyboard | `tr.grp`/`tr.course`/`.jitem`: tambah `tabIndex={0}`, `role="button"`, `onKeyDown` (Enter/Space = toggle), `aria-expanded`. | `RecapTable.jsx`, `JournalPanel.jsx` | M |
| R26 (F2) | Kontras AA | Gelapkan `--muted` ke `#6b7280` (≈4.6:1) atau `#64748b`; cek ulang semua teks `.muted.small` di atas `--surface-2`. | `styles.css` | S |
| R27 (F3) | Meta & favicon | Tambah favicon SVG (logo "R" ungu), `meta name="theme-color"`, `meta description`, `apple-mobile-web-app-capable` agar rapi saat di-install di HP. | `index.html`, aset baru | S |
| R28 (F4) | Focus trap modal | Terapkan trap fokus sederhana (Tab berputar di dalam modal, fokus awal ke elemen pertama, kembalikan fokus saat tutup) pada modal ReportPage & ConfirmDialog. | `ReportPage.jsx`, `ConfirmDialog.jsx` | M |
| R29 (F5) | Toggle password | Ikon mata untuk show/hide password di LoginPage. | `LoginPage.jsx`, `icons.jsx` | S |
| R30 (F6) | Bersihkan dead code | Hapus `IconBook` (atau pakai untuk nav Jurnal), hapus kelas CSS yatim hasil konsolidasi (audit setelah WS2). | `icons.jsx`, `styles.css` | S |
| R31 | Empty state berilustrasi | Tambah ikon besar muted + CTA di empty state utama (belum ada recap, belum ada rencana jurnal, scan kosong) — pola sudah ada, tinggal diberi ikon agar tidak terasa "mati". | berbagai | S |

**Kriteria terima WS7:** seluruh baris klikabel dapat dioperasikan dengan keyboard saja; teks utama lolos AA; tab tidak bisa keluar dari modal terbuka.

### WS8 — Microcopy & clean-up 🟡 P2

| ID | Perbaikan | Spesifikasi | File | Effort |
|---|---|---|---|---|
| R32 (A4) | Hapus rujukan wizard lama | Ganti "Ulangi langkah 1 di atas" → "Login dulu di halaman masuk." | `StudentsRaw.jsx` | S |
| R33 | Panduan copy singkat | Tetapkan: kalimat UI = Bahasa Indonesia sentence case; istilah baku: *recap*, *jurnal*, *report*, *blok*, *lesson*, *course* (tidak diterjemahkan bolak-balik); hindari kata teknis ("endpoint", "payload") di UI guru. Terapkan saat menyentuh file terkait (dicicil). | semua | S |

---

## 7. Prioritas & Rencana Rilis

### Fase 1 — "Jangan ada yang menipu" (P0, ±1–1.5 hari)
R1, R2, R3, R4.
Rilis begitu selesai — ini perbaikan kualitas dasar, bukan estetika.

### Fase 2 — "Rapi & konsisten" (P1, ±2–3 hari)
WS2 (R5–R10) → WS3 (R11–R13) → WS4 (R14–R17) → WS5 (R18–R21) → WS6 (R22–R24).
Urutan sengaja dari fondasi (tokens/tombol) dulu agar komponen baru (Progress, ConfirmDialog, kartu mobile) langsung lahir sesuai sistem.

### Fase 3 — "Polish" (P2, ±1–1.5 hari)
WS7 + WS8. Bisa dicicil per item tanpa rilis khusus.

### Definition of Done (semua fase)
- `pnpm/npm run build` di `client/` sukses; `client/dist` dipakai server tanpa regresi visual yang terlihat pada 1280px dan 375px.
- Tidak ada penggunaan `window.confirm`, `badge badu`, atau tombol polos bergaya primary.
- Checklist konsistensi §10.3 lulus.

---

## 8. Metrik Keberhasilan

Tool internal tanpa analytics — metrik berupa checklist terukur + observasi ringan:

| Metrik | Target | Cara ukur |
|---|---|---|
| State menyesatkan | 0 kejadian | Uji manual: matikan server, buka app → layar "server tidak terjangkau" |
| Kehilangan edit jurnal | 0 kejadian | Uji: edit notes → Buat Ulang → muncul dialog konfirmasi |
| Kontras teks utama | 100% AA (4.5:1) | Audit palet di `styles.css` (atau axe DevTools) |
| Parity mobile | 4/4 halaman usable di 375px tanpa scroll horizontal tak disengaja | Uji manual per halaman |
| Task completion | Skenario S1–S3 §4 selesai tanpa membaca `docs/API.md` | Minta 1 guru yang belum pernah pakai, observasi |
| Konsistensi tombol/status | 1 sistem tombol, 1 sistem chip | Review kode |

---

## 9. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| R5 (balik default tombol) salah menyasar tombol yang harusnya primary | CTA melemah | Audit menyeluruh semua `<button>` dalam satu commit; smoke-test semua halaman |
| R12 mengubah respons `/api/status` | Client lama tak kompatibel | Field tambahan saja (`loginEmail`), tidak mengubah field lama; build client dirilis bersamaan |
| R22 (kartu mobile Recap) duplikasi markup dengan tabel desktop | Beban maintenance | Terima duplikasi (pola yang sama sudah terbukti di ReportPage); jaga satu sumber data |
| Perubahan copy (R8, R33) tidak konsisten | Kebingungan sementara | Terapkan sekaligus per fase, jangan separuh-separuh |
| Scope creep ke redesign | Molor | PRD ini eksplisit Non-Tujuan §3; perubahan di luar daftar butuh PRD baru |

---

## 10. Lampiran

### 10.1 Token yang ditambahkan/diubah (usulan)

```css
:root {
  /* baru */
  --info: #0284c7;
  --info-soft: #eff6ff;

  /* diubah untuk kontras AA */
  --muted: #6b7280;          /* sebelumnya #8a94a6 */
}
```

Varian chip final: `.chip` (neutral/abu), `.chip.ok` (hijau), `.chip.warn` (oranye), `.chip.fail` (merah), `.chip.info` (biru), `.chip.wait` (oranye + dot, khusus "menunggu persetujuan").
Varian tombol final: `.primary` (ungu solid), default/secondary (putih + border), `.ghost` alias secondary, `.danger` (merah outline), `.quiet` (tekstual).

### 10.2 Aturan copy

- Sentence case untuk tombol & judul: "Buat rencana", "Perbarui recap".
- Istilah tetap: recap, jurnal, report, blok, lesson, course, CMS, sync → "muat/sinkron".
- Nada: singkat, aktif, menenangkan untuk error (selalu beri langkah berikutnya).

### 10.3 Checklist konsistensi (untuk review akhir)

- [ ] Tidak ada `<button>` tanpa kelas yang tampil ungu solid.
- [ ] Tidak ada kelas `.badu` / `.badge` yatim; semua status = `.chip.*`.
- [ ] Setiap warna semantik dipakai satu makna (ok/warn/fail/info).
- [ ] Satu operasi = satu label di semua halaman.
- [ ] Tidak ada judul halaman ganda.
- [ ] View aktif bertahan setelah refresh.
- [ ] Semua job panjang menampilkan progress bar.
- [ ] Semua baris klikabel bisa dioperasikan via keyboard.
- [ ] Semua halaman dicek di 1280px dan 375px.

### 10.4 Ide masa depan (di luar PRD ini)

- Dark mode (token CSS sudah siap).
- Riwayat aktivitas global ("apa yang berubah sejak kemarin").
- Notifikasi saat job selesai walau tab tidak fokus (Web Notifications).
- Multi-akun guru / ganti akun tanpa logout penuh.

---

*Dokumen ini dihasilkan dari audit kode `client/src/*`, `server/*`, dan `docs/API.md` per 18-08-2026. Semua referensi baris mengacu kondisi kode saat audit.*
