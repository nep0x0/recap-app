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

Pastikan **Node.js 18+** sudah terpasang, lalu minta teknisi untuk:

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
5. Riwayat rekap tersimpan otomatis — data terbaru tinggal klik **Perbarui recap**.

Yang akan diambil per siswa: lesson terakhir, mastery, coin, dsb.

> Tiap request ke CMS diberi jeda ±400 ms agar tidak membebani server. Untuk 100 siswa, proses biasanya selesai 1–3 menit.

---

## 6. Jurnal meeting

Jurnal meeting adalah catatan yang dikirim ke CMS untuk siswa, berdasarkan data meeting di CMS.

Alur dua langkah:

### Langkah A — Susun draf

1. Buka tab **Jurnal Meeting**.
2. Pilih siswa (atau beberapa siswa).
3. Klik **Susun draf**.
4. Proses berjalan sebagai job background — progress bar menampilkan siswa ke-n dari total. **Aman pindah tab atau refresh halaman**: job lanjut di server, dan saat kamu kembali ke tab Jurnal polling akan menyambung lagi.
5. Setelah selesai, pratinjau muncul. Periksa isinya.

### Langkah B — Kirim ke CMS

1. Setelah pratinjau sesuai, klik **Kirim ke CMS**.
2. Proses berjalan sebagai job background. Pantau status di tab yang sama.
3. Setelah selesai, hasil & log tampil di halaman.

Kalau ada error (mis. siswa tanpa data meeting), cek bagian **Log** di bawah halaman Jurnal.

---

## 7. Report siswa (blok 8 pertemuan)

Report dibuat per **blok 8 pertemuan**. Fitur ini membantu melengkapi blok yang belum beres.

### 7.1 Pindai blok yang belum selesai

1. Buka tab **Report Siswa**.
2. Klik **Pindai semua siswa** untuk memindai blok report.
3. Tunggu sampai progress selesai.
4. Setelah selesai, daftar **blok yang perlu dikerjakan** muncul di bagian **Due**.

### 7.2 Lihat & tandai selesai

- Buka **Due** untuk daftar blok yang belum lengkap.
- Buka **Selesai** untuk blok yang sudah ditandai selesai (status: ditandai manual oleh kamu).

Untuk book tertentu yang sudah kamu kerjakan manual di CMS tapi tidak terdeteksi:

1. Cari siswa di **Daftar siswa** di bawah halaman Report.
2. Klik **Tandai selesai** pada book yang dimaksud.
3. Book pindah ke tab **Selesai**. Batalkan kapan saja dari tab yang sama.

### 7.3 Buat report baru

1. Dari daftar **Due** atau **Selesai**, klik **Buat report** pada blok yang dimaksud.
2. Tinjau **pratinjau** (kriteria, jurnal, cover) di panel kanan.
3. Klik **Kirim ke CMS**.

### 7.4 Riwayat

Semua pembuatan report tercatat di bagian **Riwayat** di tab Report — bisa difilter berdasarkan status (berhasil / skip / gagal).

---

## 8. Pengaturan & logout

Di tab **Pengaturan** kamu bisa:

- 🔁 **Refresh login** — cek / perbarui sesi CMS tanpa login ulang.
- 🚪 **Logout** — hapus sesi lokal. Kamu akan diminta login lagi di pemakaian berikutnya.
- 📜 **Log jurnal** ada di tab **Jurnal Meeting**; **Riwayat report** ada di tab **Report Siswa** (filter per status).

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
