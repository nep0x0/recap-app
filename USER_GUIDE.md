# USER_GUIDE — RecapApp untuk Guru & Admin

Panduan ini untuk **pengguna aplikasi** (guru / admin Timedoor Academy), bukan untuk developer. Ikuti dari atas ke bawah pada pemakaian pertama.

---

## Daftar Isi

1. [Persiapan pertama kali](#1-persiapan-pertama-kali)
2. [Login ke CMS](#2-login-ke-cms)
3. [Halaman Ringkasan (Dashboard)](#3-halaman-ringkasan-dashboard)
4. [Sinkronisasi siswa](#4-sinkronisasi-siswa)
5. [Rekap progres](#5-rekap-progres)
6. [Jurnal meeting](#6-jurnal-meeting)
7. [Report siswa (blok 8 pertemuan)](#7-report-siswa-blok-8-pertemuan)
8. [Pengaturan & logout](#8-pengaturan--logout)
9. [Masalah umum](#9-masalah-umum)

---

## 1. Persiapan pertama kali

Pastikan **Node.js ≥ 22.5.0** (Disarankan Node.js 22 LTS atau 24) sudah terpasang, lalu minta teknisi untuk:

```bash
cd recap-app
npm install
npm start
```

Setelah server jalan, buka **http://localhost:3000** di browser. Halaman pertama yang muncul adalah **Login**.

> Alamat LAN juga muncul di terminal — berguna kalau ingin buka dari HP / tablet di jaringan lokal yang sama.

---

## 2. Login ke CMS

RecapApp memakai akun CMS Timedoor kamu. Tidak ada akun terpisah.

1. Buka tab **Login** (halaman pertama).
2. Isi **email** dan **password** CMS kamu.
3. Klik **Masuk**.

Kalau berhasil, kamu masuk ke **Ringkasan** dan email tampil di pojok kiri atas. Sesi login disimpan lokal — kamu tidak perlu login ulang tiap buka aplikasi, **kecuali** token CMS kedaluwarsa (lihat [§9](#9-masalah-umum)).

> ⚠️ Kredensial hanya dikirim ke endpoint resmi CMS lewat server. Tidak ada yang diunggah ke tempat lain.

---

## 3. Halaman Ringkasan (Dashboard)

Tab **Ringkasan** menampilkan progres semua siswa hasil rekap terakhir: mastery, coin, lesson, dan status belajar. Ini adalah tampilan baca saja — untuk mendapatkan data baru, jalankan **[rekap progres](#5-rekap-progres)** dari tab **Pengaturan** atau tombol yang tersedia.

---

## 4. Sinkronisasi siswa

Sebelum bisa rekap / jurnal / report, daftar siswa lokal harus diperbarui dari CMS.

1. Buka tab **Pengaturan**.
2. Klik **Sinkronkan siswa dari CMS**.
3. Tunggu sampai muncul notifikasi sukses. Biasanya < 1 menit.

Setelah sinkron, siswa baru / yang keluar sudah tercermin. Lakukan ini:

- Saat pertama kali pakai.
- Setelah ada siswa baru atau keluar.
- Setelah pergantian periode / level.

> Sesi CMS harus valid. Kalau gagal, lakukan **Refresh login** di tab Pengaturan, atau [login ulang](#2-login-ke-cms).

---

## 5. Rekap progres

Rekap menarik data progres setiap siswa dari CMS lalu menyimpannya sebagai snapshot.

1. Buka tab **Pengaturan**.
2. Klik **Mulai rekap semua siswa**.
3. Proses berjalan di background. Pantau **progress bar** — tidak perlu refresh halaman.
4. Kalau sudah selesai, buka tab **Ringkasan** untuk melihat hasilnya.
5. Riwayat rekap ada di tab **Pengaturan** → bagian **Rekapan tersimpan**.

Yang akan diambil per siswa: lesson terakhir, mastery, coin, dsb.

> Tiap request ke CMS diberi jeda ±400 ms agar tidak membebani server. Untuk 100 siswa, proses biasanya selesai 1–3 menit.

---

## 6. Jurnal meeting

Jurnal meeting adalah catatan yang dikirim ke CMS untuk siswa, berdasarkan data meeting di CMS.

Alur:

### Langkah A — Susun draf & Penyesuaian

1. Buka tab **Jurnal Meeting**.
2. Pilih filter siswa (atau biarkan kosong untuk semua siswa).
3. Klik **Buat rencana** / **Susun draf**.
4. Server mengambil data meeting dari CMS lalu menyusun draf otomatis.
5. **Edit Catatan & Nilai Lesson**:
   - Klik salah satu baris pertemuan di daftar sebelah kiri.
   - Di panel kanan, kamu dapat mengedit teks catatan jurnal.
   - Kamu juga dapat menyesuaikan **Nilai Lesson** untuk tiap aktivitas di meeting tersebut (masukkan skor manual 0–100 atau gunakan tombol cepat **Set Semua: 80, 85, 90, 95, 100**).
   - Perubahan tersimpan secara otomatis sebagai draf lokal (tombol *Kembalikan ke draf* tersedia jika ingin mereset).

### Langkah B — Kirim ke CMS

1. Centang baris jurnal yang ingin dikirim (atau gunakan *Pilih semua*).
2. Klik tombol **Isi N catatan ke CMS**.
3. Konfirmasi di dialog modal.
4. Proses berjalan di background. Pantau progress bar sampai selesai.

Kalau ada error (mis. sesi berakhir atau CMS down), hasil per baris akan ditandai dengan badge (tertulis, dilewati, atau gagal).

---

## 7. Report siswa (blok 8 pertemuan)

Report dibuat per **blok 8 pertemuan** (Blok 8 = Lesson 1–8, Blok 16 = Lesson 9–16, dst.). Fitur ini mendeteksi blok yang sudah memenuhi syarat tapi belum dibuatkan laporan.

### 7.1 Pindai blok yang belum selesai

1. Buka tab **Report Siswa**.
2. Klik **Pindai semua siswa** untuk memindai status seluruh blok di CMS.
3. Tunggu sampai progress selesai (±1 menit untuk 30–50 siswa).
4. Daftar blok yang belum dibuatkan laporan akan muncul di tabel **Due** (chip biru: siap dibuat; chip kuning: menunggu persetujuan).

### 7.2 Lihat & tandai selesai

- Tab **Due**: Blok yang masih perlu tindakan / dibuatkan report.
- Tab **Selesai**: Course yang sudah ditandai selesai (dilewati pemindaian agar tidak muncul lagi di Due).
- Untuk menandai course yang sudah beres / tidak perlu report lagi: klik ikon centang / **Tandai selesai** di baris siswa. Tindakan ini bisa dibatalkan kapan saja dari tab **Selesai**.

### 7.3 Buat report baru (Modal Pembuatan Report)

1. Pada blok di tabel **Due**, klik tombol **Buat blok N**.
2. Modal pembuatan report akan terbuka dan memuat pratinjau:
   - Menampilkan rentang lesson, jurnal yang tercakup, dan pengecekan tumpang-tindih (*overlap*).
   - Bila ada meeting di rentang yang belum punya jurnal, sistem akan **mengisi jurnal otomatis** saat report dikirim.
   - **Kriteria Penilaian**: Centang kriteria yang ingin disertakan. Isi skor (0–100) dan catatan (narasi otomatis terisi dari template CMS dengan nama siswa).
   - Gunakan tombol cepat **Set Semua Skor (80, 85, 90, 95, 100)** di atas daftar kriteria untuk mengisi nilai semua kriteria sekaligus.
3. Klik **Buat report blok N** untuk mengirim ke CMS.

### 7.4 Riwayat Log

Semua hasil create report (berhasil atau gagal beserta pesan CMS) tercatat di tabel **Logs** pada tab Report.

---

## 8. Pengaturan & logout

Di tab **Pengaturan** kamu bisa:

- 🔁 **Refresh login** — cek / perbarui sesi CMS tanpa login ulang.
- 🚪 **Logout** — hapus sesi lokal. Kamu akan diminta login lagi di pemakaian berikutnya.
- 🗑️ **Hapus data lokal** — reset cache siswa & log (tidak menghapus data di CMS).
- 📜 Lihat **Riwayat rekap**, **Log jurnal**, **Log report** kapan saja.

Logout disarankan kalau kamu memakai komputer bersama.

---

## 9. Masalah umum

| Gejala                                                | Penyebab umum                                   | Solusi                                                                 |
|-------------------------------------------------------|-------------------------------------------------|------------------------------------------------------------------------|
| Halaman Login muncul terus                            | Sesi CMS sudah kadaluarsa                       | Login ulang, atau klik **Refresh login** di Pengaturan                |
| Muncul `NOT_LOGGED_IN`                                | Token CMS tidak valid                           | Sama seperti di atas                                                    |
| Tombol "Sinkronkan" tidak bereaksi                    | Sesi tidak valid                                | Login ulang dulu                                                        |
| Rekap / jurnal jalan tapi tidak selesai               | Koneksi ke CMS lambat / timeout                 | Tunggu sampai job selesai; kalau mentok, refresh halaman & coba lagi  |
| `ALREADY_RUNNING` muncul                              | Job yang sama sedang jalan                      | Tunggu job sebelumnya selesai — jangan trigger dua kali                |
| `npm install` gagal                                   | Node versi lama / registry issue                | Pastikan Node ≥ 18; coba `npm cache clean --force` lalu `npm install` |
| Port 3000 sudah dipakai                               | Aplikasi lain di port 3000                      | Jalankan `PORT=8080 npm start` lalu buka `http://localhost:8080`       |
| Siswa tidak muncul setelah sync                       | Belum pernah sync, atau ada filter              | Klik **Sinkronkan siswa** di Pengaturan                                |
| Browser cache menyebabkan UI aneh                     | Build baru sudah keluar, browser cache lama     | Hard refresh: `Ctrl+Shift+R` (Win/Linux) / `Cmd+Shift+R` (Mac)         |

Kalau masalah belum terpecahkan, hubungi admin / teknisi yang mengelola server RecapApp di tempat kamu.

---

## Glosarium singkat

- **CMS** — Content Management System tempat data Timedoor (Timedoor Academy back-office).
- **Sesi CMS** — token login (`access_token` + `refresh_token`) yang tersimpan lokal agar tidak login tiap kali.
- **Job** — proses background yang berjalan di server (rekap, jurnal, scan). Dipicu sekali, berjalan sendiri, dicek via endpoint status.
- **Blok (report)** — satuan 8 pertemuan. Setiap blok punya report di CMS yang harus dilengkapi.
- **Snapshot rekap** — potret data siswa pada satu waktu. Tersimpan di rekapan tersimpan.
