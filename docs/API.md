# Dokumentasi API — RecapApp

Otomasi report & jurnal siswa Timedoor Academy. Server Express (`server/index.js`) melayani **API JSON** di `/api/*` dan **SPA client** (`client/dist`) di `/`. Semua contoh respons di dokumen ini adalah **respons asli** yang ditangkap dari server berjalan (data nyata, 17-08-2026).

## Konvensi umum

- **Base URL**: `http://localhost:3000` (dev). Port dari env `PORT` (default 3000).
- **Format**: JSON. Request dengan body wajib `Content-Type: application/json`.
- **Auth app**: tidak ada token khusus app — server memakai **sesi CMS** guru yang tersimpan di `server/data/profile/storage.json` (hasil login). Endpoint yang menyentuh CMS memvalidasi sesi dulu (`validateSession()`); bila token kedaluwarsa, server otomatis mencoba refresh via `refresh_token`.
- **Error umum**:
  - `400` — parameter hilang/tidak valid: `{ "error": "…" }`
  - `401` — sesi CMS tidak valid (`NOT_LOGGED_IN`) — hanya untuk route yang melempar error ini (mis. `POST /api/recap`, `POST /api/journal/plan`). Endpoint report lain mengembalikan `{ ok: false, error/message }` dengan status 400.
  - `500` — error tak terduga: `{ "error": "…" }`
- **Job background**: beberapa endpoint memulai proses async di memori (satu proses Node, state tidak persisten antar restart). Pola: panggil trigger → dapat `{ "started": true }` → **poll status** sampai `running: false`. Pemicu kedua saat masih jalan → `{ "started": false, "reason": "ALREADY_RUNNING" }`.
- **Rate limit CMS**: semua request ke CMS di-jeda **400 ms** (konstanta `REQUEST_DELAY` di tiap service).

## Indeks endpoint

| Method | Path | Fitur | Jenis | § |
|---|---|---|---|---|
| GET | `/api/status` | Status sesi & state app | langsung | 1 |
| POST | `/api/login-api` | Login CMS via API | langsung | 1 |
| POST | `/api/refresh-login` | Cek ulang sesi | langsung | 1 |
| POST | `/api/logout` | Hapus sesi | langsung | 1 |
| POST | `/api/sync` | Sinkron daftar siswa | langsung | 2 |
| GET | `/api/students?q=` | Cari siswa (flattened) | langsung | 2 |
| POST | `/api/recap` | Rekap progres semua siswa | **job** (poll `/api/recap-status`) | 3 |
| GET | `/api/recap-status` | Status job recap | — | 3 |
| GET | `/api/recaps` | Rekapan tersimpan | langsung | 3 |
| POST | `/api/journal/plan` | Susun draf jurnal (read-only CMS) | langsung | 4 |
| POST | `/api/journal/fill` | Kirim jurnal ke CMS | **job** (poll `/api/journal/status`) | 4 |
| GET | `/api/journal/status` | Status job fill | — | 4 |
| POST | `/api/report/scan` | Pindai blok report semua siswa | **job** (poll `/api/report/scan-status`) | 5 |
| GET | `/api/report/scan-status` | Status job scan | — | 5 |
| GET | `/api/report/due` | Daftar blok belum beres + menunggu | langsung | 5 |
| GET | `/api/report/done` | Daftar "Tandai Selesai" | langsung | 5 |
| POST | `/api/report/done` | Tandai book selesai | langsung | 5 |
| DELETE | `/api/report/done` | Batalkan tandai selesai | langsung | 5 |
| GET | `/api/report/books?student_id=` | Book milik siswa | langsung | 5 |
| GET | `/api/report/preview` | Pratinjau blok (kriteria, jurnal, cover) | langsung | 5 |
| POST | `/api/report/create` | Buat report blok ke CMS | langsung | 5 |
| POST | `/api/report/run` | **Legacy** — create semua book satu siswa | **job** (poll `/api/report/run-status`) | 5 |
| GET | `/api/report/run-status` | Status job legacy | — | 5 |
| GET | `/api/report/logs` | Riwayat create report | langsung | 5 |
| GET | `/` `/*` | SPA (fallback `index.html`) | — | 6 |

Referensi kode per endpoint dicantumkan di tiap bagian (route `server/index.js:baris` → layanan `server/services/*.js`).

---

## 1. Autentikasi & Status

### GET /api/status

Status sesi CMS & metadata sync. Memanggil `validateSession()` (memvalidasi token ke CMS, cache 15 detik).

**Respons 200:**
```json
{
  "loggedIn": true,
  "lastCheckAt": 1786889272963,
  "lastSyncAt": "2026-08-14T18:22:59.755Z",
  "studentCount": 32,
  "sessionValid": true
}
```

| Field | Tipe | Keterangan |
|---|---|---|
| `loggedIn` | boolean | State tersimpan (true = pernah login) |
| `lastCheckAt` | number | Epoch ms terakhir validasi |
| `lastSyncAt` | string ISO / null | Sync siswa terakhir |
| `studentCount` | number | Jumlah siswa di DB |
| `sessionValid` | boolean | Token CMS masih valid saat dicek |
| `loginEmail` | string / null | Email guru dari login terakhir; `null` setelah logout |

Ref: `server/index.js:26` · `server/services/session.js` (`readState`, `validateSession`).

---

### POST /api/login-api

Login ke CMS Timedoor via API (`/api/tms/auth/login`), menyimpan `access_token`/`refresh_token` ke `server/data/profile/storage.json`.

**Body:**
```json
{ "username": "guru@timedooracademy.com", "password": "rahasia" }
```

**Respons:**
- `200` → `{ "ok": true, "loggedIn": true }`
- `400` → `{ "error": "Email dan password wajib diisi" }`
- `401` → `{ "error": "Email atau password salah" }` (atau pesan dari CMS)
- `500` → `{ "error": "Tidak bisa menghubungi server CMS. Periksa internet." }` dsb.

Ref: `server/index.js:32` · `session.js:108` (`loginViaApi`).

---

### POST /api/refresh-login

Validasi ulang sesi tanpa login ulang (dipakai app saat start / tombol refresh).

**Respons 200:** `{ "loggedIn": true | false }`

Ref: `server/index.js:47` · `session.js:135` (`validateSession`).

---

### POST /api/logout

Menghapus `storage.json` (token CMS) & menandai state tidak login. Tanpa body.

**Respons 200:** `{ "ok": true }`

Ref: `server/index.js:56` · `session.js:177` (`logout`).

---

## 2. Siswa & Sync

### POST /api/sync

Menarik daftar semua siswa dari CMS (paginasi `/api/tms/student?limit=100`), upsert ke tabel `students`. Menulis state `lastSyncAt` + `studentCount` bila berhasil. **Hanya baca dari CMS.**

**Respons 200:**
```json
{ "loggedIn": true, "students": 32, "inserted": 0, "pages": 1, "method": "api" }
```

| Field | Keterangan |
|---|---|
| `loggedIn` | `false` + `error: "NOT_LOGGED_IN"` bila sesi tidak valid |
| `students` | Total siswa di DB setelah sync |
| `inserted` | Jumlah siswa baru |
| `pages` | Jumlah halaman paginasi CMS |
| `method` | `"api"` (selalu; legacy browser disingkirkan) |

Ref: `server/index.js:64` · `server/services/sync.js:61` (`syncStudents`).

---

### GET /api/students?q={query}

Cari siswa (case-insensitive, `LIKE %q%`, maks 2000 baris). Setiap baris memuat `raw` CMS yang **di-flatten** (nested object → `parent.name`, dsb.; array → JSON string).

**Respons 200:**
```json
{
  "students": [
    {
      "id": 60251,
      "name": "Kiano Byan Azala",
      "info": "STD-20260529-1334 · 2 sesi",
      "synced_at": "2026-08-14 18:22:57",
      "data": {
        "id": 60251,
        "code": "STD-20260529-1334",
        "name": "Kiano Byan Azala",
        "total_sessions": 2,
        "parent.id": 46150,
        "parent.code": "PRN-20260529-1048",
        "parent.name": "Pingkan",
        "created_at": "2026-05-29T09:14:34.759Z",
        "updated_at": "2026-06-04T08:31:06.789Z"
      }
    }
  ],
  "total": 32
}
```

Ref: `server/index.js:77` · `sync.js` (`getDb`).

---

## 3. Recap

### POST /api/recap

Job background: untuk tiap siswa **yang belum punya data** di tabel `recaps` (atau semua bila `force: true`), tarik session → detail → progress (`/api/v2/tms/student/{sid}/book/{bid}/progress-detail`) → meeting-history → simpan JSON ke `recaps`. Hanya baca CMS.

**Body:** `{ "force": false }` — `force: true` = ambil ulang semua siswa.

**Respons 200:**
- `{ "started": true }`
- `{ "started": false, "reason": "ALREADY_RUNNING" }`

`401` bila `NOT_LOGGED_IN`. Ref: `server/index.js:108` · `server/services/recap.js:155` (`runRecap`).

---

### GET /api/recap-status

Status job recap terakhir/berjalan.

**Respons 200:**
```json
{
  "running": false,
  "startedAt": null,
  "finishedAt": null,
  "current": 0,
  "total": 0,
  "studentName": null,
  "failed": [],
  "lastError": null
}
```

| Field | Keterangan |
|---|---|
| `startedAt` / `finishedAt` | ISO timestamp; `null` bila belum pernah jalan |
| `current` / `total` | Kemajuan per siswa (tiap siswa = beberapa request CMS, durasi bisa menit) |
| `studentName` | Siswa yang sedang diproses |
| `failed` | `[{ id, name, error }]` |
| `lastError` | Pesan error terakhir / `null` |

Ref: `server/index.js:118` · `recap.js` (`getStatus`).

---

### GET /api/recaps

Semua rekapan tersimpan (join tabel `recaps` + `students`), data mentah diringkas.

**Respons 200 (terpotong):**
```json
{
  "recaps": [
    {
      "student_id": 50583,
      "student_name": "Kenneth Kenzie Adison",
      "course_id": 80880,
      "course_name": "Tech Explorer",
      "last_lesson": "Lesson 9 - Learning Online Safety Using Scratch",
      "last_lesson_date": "2026-08-08",
      "last_meeting": "Meeting 5",
      "latest_progress": 8,
      "total_progress": 24,
      "completion_percent": 33,
      "mastery_gained": 260,
      "mastery_max": 1140,
      "mastery_pct": 23,
      "coin_gained": 560,
      "quiz_count": 0,
      "quizzes": [],
      "meetings": [
        {
          "name": "Meeting 5",
          "date": "2026-08-08",
          "start_time": "06:30:00",
          "end_time": "08:00:00",
          "lessons": ["Lesson 8 - Exam", "Lesson 9 - Learning Online Safety Using Scratch"]
        }
      ],
      "synced_at": "2026-08-14 19:48:59"
    }
  ]
}
```

| Field | Keterangan |
|---|---|
| `last_lesson` / `last_lesson_date` / `last_meeting` | Aktivitas meeting terakhir dengan lesson |
| `latest_progress` / `total_progress` | Lesson terakhir selesai / total lesson |
| `completion_percent` | % `learnable` selesai |
| `mastery_gained` / `mastery_max` / `mastery_pct` | Poin penguasaan (statistik CMS) |
| `coin_gained` | Koin terkumpul (statistik CMS) |
| `quiz_count` / `quizzes` | `quizzes[i] = { score, attempt }` — `score` string hasil ekstrak dari attempt (`score`/`correct`/`total`) |
| `meetings` | Urut tanggal terbaru dulu |

Ref: `server/index.js:122` · `recap.js:213` (`listRecaps`), `recap.js:71` (`parseQuizzes`), `recap.js:81` (`scoreSummary`).

---

## 4. Jurnal Meeting

Alur: `POST /api/journal/plan` (susun draf dari data CMS) → edit/pilih di UI → `POST /api/journal/fill` (kirim ke CMS, async) → `GET /api/journal/status` (poll hasil). `plan` **tidak menulis apa pun** ke CMS; `fill` yang menulis (POST upsert jurnal).

### POST /api/journal/plan

Untuk tiap siswa (atau satu bila `student_id` diisi): ambil meeting-history + `activity` (skor per aktivitas), hitung lesson yang belum tercatat di jurnal, teruskan (carry) lesson ke meeting berikutnya sampai ada kelipatan 8 (batas report), lalu susun draf entry. Meeting yang sudah punya jurnal dilewati (`skipped`).

**Body:** `{ "student_id": 60251 }` — kosongkan = semua siswa.

**Respons 200:**
```json
{
  "built_at": "2026-08-16T10:00:00.000Z",
  "student_count": 32,
  "course_count": 42,
  "entry_count": 193,
  "skipped_count": 297,
  "entries": [
    {
      "key": "60251-62864-667061",
      "student_id": 60251,
      "student_name": "Kiano Byan Azala",
      "session_id": 62864,
      "book_id": 197935,
      "history_id": 197935,
      "course_id": 6,
      "course_name": "Coding Xplorer",
      "meeting_id": 667061,
      "meeting_name": "Meeting 22",
      "date": "2026-08-16",
      "lessons": ["Lesson 28 - Calculator for Distance Apps"],
      "note": "Kiano Byan Azala mempelajari Lesson 28 - Calculator for Distance Apps dengan baik.",
      "activities": [{ "id": 350016, "score": 100 }],
      "exists": null
    }
  ],
  "skipped": [
    {
      "meeting_id": 667060,
      "meeting_name": "Meeting 21",
      "date": "2026-08-13",
      "reason": "exists",
      "lessons": ["Lesson 27 - ..."]
    }
  ]
}
```

| Field entry | Keterangan |
|---|---|
| `key` | `<student>-<session>-<meeting>` (id unik UI) |
| `book_id` | `session.book.id` (bisa `null`) |
| `history_id` | `latest_learning_session_book_id` — dipakai sebagai `book` di URL CMS |
| `course_id` | `course.id` (fallback `book_id`, lalu `session_id`) |
| `lessons` | Konten lesson yang akan dicatat di meeting ini |
| `note` | `${nama} mempelajari ${lesson} dengan baik.` |
| `activities` | `{ id: activityId, score }` — skor: kelipatan 8 → `100`; aktivitas bernilai 0 → `86`; selainnya `max(70, min(value+10, 100))` |
| `exists` | `null` (legacy; sudah difilter) |

`skipped.reason`: `exists` (jurnal sudah ada; `lessons` = yang belum tercatat di jurnal itu), `moved` (lesson dibawa ke meeting berikutnya karena melewati batas kelipatan 8), `empty` (tidak ada lesson yang ditulis).

`401 NOT_LOGGED_IN` bila sesi CMS habis. Ref: `server/index.js:126` · `server/services/journal.js:235` (`buildPlan`), `journal.js:87` (`buildCoursePlan`).

---

### POST /api/journal/fill

Job background: kirim draf entries ke CMS (`POST .../meeting-history/{meetingId}/journal` dengan body `{ note, learning_session_book_meeting_activities: [{ id, score }] }`). Meeting yang ternyata sudah punya jurnal → `skipped` (tanpa menulis). Hasil tercatat di tabel `journal_log`.

**Body:**
```json
{
  "entries": [
    { "student_id": 60251, "session_id": 62864, "history_id": 197935, "meeting_id": 667061,
      "course_id": 6, "note": "…", "activities": [{ "id": 350016, "score": 100 }] }
  ]
}
```

**Respons 200:**
- `{ "started": true }`
- `{ "started": false, "reason": "ALREADY_RUNNING" }` — job lain masih jalan
- `{ "started": false, "reason": "EMPTY" }` — `entries` kosong

**Polling** via `GET /api/journal/status`:

```json
{
  "running": false,
  "current": 0,
  "total": 0,
  "results": [],
  "failed": []
}
```

`results[i]`: `{ "meeting_id", "meeting_name", "ok": true|false, "status": "ok"|"skipped"|"failed", "message" }` — `failed` berisi salinan hasil yang gagal `{ meeting_id, meeting_name, message }`.

Ref: `server/index.js:136,145` · `journal.js:289` (`runFill`), `journal.js:26` (`getFillStatus`).

---

## 5. Report Siswa

Model CMS: report dibuat per **book** (session-history) dan menutup **blok 8 lesson** (blok 8 = lesson 1–8, blok 16 = 9–16, dst.). Satu book bisa punya banyak report; nama report dibuat CMS dari rentang meeting ("Meeting 1 - Meeting 6"). Status report: `approved`, `waiting_approval`, dsb.

Alur fitur UI: `POST /api/report/scan` → poll `scan-status` → baca `GET /api/report/due` → klik blok → `GET /api/report/preview` → isi skor 0–100 + catatan (kriteria live dari CMS, template narasi auto-fill) → `POST /api/report/create` → cek `GET /api/report/logs`. Book lama/beres bisa ditandai selesai via `/api/report/done`.

### POST /api/report/scan

> Sengaja **POST** (bukan GET): endpoint ini memulai job berat dengan efek samping. GET adalah *simple request* (tanpa preflight) sehingga bisa dipicu situs/HTML lain di LAN (CSRF via `<img src=…>`); POST dengan body JSON terlindung karena `express.json()` menolak body non-JSON lintas-origin.

Job background: loop semua siswa → session → book. Book di `report_done` **dilewati tanpa menyentuh CMS**. Tiap book: max lesson (parse `Lesson N` dari aktivitas meeting), daftar jurnal, list report + detail tiap report (jurnal yang tercakup) → hitung:
- `covered_blocks` — blok yang seluruh lesson-nya tercakup report existing
- `block_status` / `block_info` — status per blok dari `status` report CMS (bila satu blok dinaungi banyak report, `approved` menang)

Durasi ±65 detik untuk 32 siswa (400 ms jeda antar request).

**Respons 200:** `{ "started": true }` · `{ "started": false, "reason": "ALREADY_RUNNING" }`

Ref: `server/routes/report.routes.js` (`POST /report/scan`) · `report-scan.service.js` (`runScan`).

---

### GET /api/report/scan-status

**Respons 200:**
```json
{
  "running": false,
  "startedAt": null,
  "finishedAt": null,
  "current": 0,
  "total": 0,
  "studentName": null,
  "errors": []
}
```

`errors[i] = { id, name, error }` (per siswa gagal). `studentName` = siswa yang sedang diproses. Ref: `server/index.js:157` · `report.js:93` (`getScanStatus`).

---

### GET /api/report/due

Book yang masih punya **blok belum beres** (dari scan terakhir). Berbeda dengan `covered_blocks` (scan), `due_blocks` = label blok yang **belum punya report sama sekali** (memakai `block_status`). Blok berstatus `approved` tidak tampil; blok berstatus lain tampil di `waiting_blocks` (chip kuning di UI).

**Respons 200:**
```json
{
  "due": [
    {
      "student_id": 10046,
      "student_name": "Aileene Aurelia",
      "session_id": 29450,
      "book_id": 170580,
      "course_id": 65,
      "course_name": "Full Stack Programming for Roblox",
      "max_lesson": 23,
      "block": 2,
      "covered_blocks": "8",
      "block_status": "{\"8\":\"approved\"}",
      "block_info": "{\"8\":{\"report_id\":50109,\"report_name\":\"Meeting 1 - Meeting 7\",\"status\":\"approved\"}}",
      "due_blocks": [16],
      "waiting_blocks": [],
      "updated_at": "2026-08-17 09:22:28",
      "report_id": 50109,
      "report_name": "Meeting 1 - Meeting 7"
    },
    {
      "student_id": 60251,
      "student_name": "Kiano Byan Azala",
      "session_id": 62864,
      "book_id": 197935,
      "course_id": 6,
      "course_name": "Coding Xplorer",
      "max_lesson": 28,
      "block": 3,
      "covered_blocks": "8,16,24",
      "block_status": "{\"8\":\"approved\",\"16\":\"waiting_approval\",\"24\":\"waiting_approval\"}",
      "block_info": "{\"8\":{\"report_id\":69142,\"report_name\":\"Meeting 1 - Meeting 6\",\"status\":\"approved\"},\"16\":{\"report_id\":112472,\"report_name\":\"Meeting 7 - Meeting 13\",\"status\":\"waiting_approval\"},\"24\":{\"report_id\":112505,\"report_name\":\"Meeting 14 - Meeting 19\",\"status\":\"waiting_approval\"}}",
      "due_blocks": [],
      "waiting_blocks": [
        { "block": 16, "report_id": 112472, "report_name": "Meeting 7 - Meeting 13", "status": "waiting_approval" },
        { "block": 24, "report_id": 112505, "report_name": "Meeting 14 - Meeting 19", "status": "waiting_approval" }
      ],
      "updated_at": "2026-08-17 09:51:34",
      "report_id": 69142,
      "report_name": "Meeting 1 - Meeting 6"
    }
  ]
}
```

| Field | Keterangan |
|---|---|
| `covered_blocks` | `"8,16"` — blok tercakup report existing menurut scan (string CSV) |
| `block_status` | JSON string: `{ blok: status }` |
| `block_info` | JSON string: `{ blok: { report_id, report_name, status } }` |
| `due_blocks` | Label blok **tanpa report** → chip biru "buat blok N" |
| `waiting_blocks` | Blok berstatus non-`approved` → chip kuning; klik → toast info, tidak bisa dikerjakan ulang |

`block_status`/`block_info` dihitung saat scan; **`POST /api/report/create` yang sukses langsung mengupdatenya** (tanpa scan ulang). Ref: `server/index.js:161` · `report.js:230` (`listDue`), `report.js:250` (`blockLabels`).

---

### GET /api/report/done · POST /api/report/done · DELETE /api/report/done

"Tandai Selesai" — book lama/beres yang tidak perlu report lagi. Efek: tidak muncul di `/due` & `/books`, dilewati scan, ditolak `/preview` & `/create`.

**GET** → `{ "done": [...] }`:
```json
{
  "done": [
    {
      "student_id": 10008,
      "student_name": "Dzaki Alif Adibri",
      "book_id": 88629,
      "session_id": 29461,
      "course_id": 36,
      "course_name": "Code and Design with Roblox",
      "max_lesson": 24,
      "created_at": "2026-08-17 08:00:45"
    }
  ]
}
```

**POST** body `{ "student_id": 10008, "book_id": 88629 }` →
- `200` `{ "ok": true }`
- `400` `{ "ok": false, "error": "Book tidak ditemukan di hasil scan — pindai ulang dulu" }` (atau `{ "error": "student_id dan book_id wajib diisi" }`)

**DELETE** body sama → `{ "ok": true }` (selalu berhasil, walau tidak ada baris).

Ref: `server/index.js:225,233,247` · `report.js:258` (`listDone`), `report.js:272` (`markDone`), `report.js:282` (`unmarkDone`).

---

### GET /api/report/books?student_id={id}

Semua book (course) milik siswa dari hasil scan (kecuali yang ditandai selesai). Catatan: `due_blocks` di sini = **semua label blok sampai `max_lesson`** (belum difilter status).

**Respons 200:**
```json
{
  "books": [
    {
      "book_id": 197935,
      "session_id": 62864,
      "course_id": 6,
      "course_name": "Coding Xplorer",
      "max_lesson": 28,
      "block": 3,
      "report_exists": 1,
      "report_id": 69142,
      "report_name": "Meeting 1 - Meeting 6",
      "updated_at": "2026-08-17 09:51:34",
      "due_blocks": [8, 16, 24]
    },
    { "book_id": 197057, "session_id": 62496, "course_id": 22, "course_name": "Python Coder",
      "max_lesson": 0, "block": 0, "report_exists": 0, "report_id": null, "report_name": null,
      "updated_at": "2026-08-17 09:23:03", "due_blocks": [] }
  ]
}
```

`400` `{ "error": "student_id wajib diisi" }` bila parameter hilang. Ref: `server/index.js:184` · `report.js:309` (`listBooks`).

---

### GET /api/report/preview?student_id={id}&book_id={bhid}&block={8|16|24|32}

Pratinjau blok sebelum create: jurnal meeting yang memuat lesson dalam rentang blok, cek tumpang-tindih report existing, kriteria course (live dari CMS) + template narasi, dan analisis jurnal yang belum ada (read-only).

**Respons 200 — blok kosong (Kenneth — Tech Explorer, blok 8, 5 jurnal belum ada):**
```json
{
  "ok": true,
  "block": 8,
  "lessons": [1, 8],
  "journals": [],
  "journalIds": [],
  "covered": { "covered": false, "reportName": null, "lessons": [] },
  "criteria": [
    { "id": 479, "name": "Character", "template": " ", "note_template": "" },
    {
      "id": 477,
      "name": "Coding & Literacy Concept",
      "template": "Report 1\n\n(student_name) mempelajari konsep dasar coding ...\n\nReport 2\n...",
      "note_template": "Kenneth Kenzie Adison mempelajari konsep dasar coding seperti algoritma, sequence, loops, dan events. ..."
    }
  ],
  "missing_journals": ["Meeting 1", "Meeting 2", "Meeting 3", "Meeting 4", "Meeting 5"],
  "fillable": true,
  "student_name": "Kenneth Kenzie Adison",
  "course_name": "Tech Explorer"
}
```

**Respons 200 — blok sudah tercakup report (Kiano — Coding Xplorer, blok 16):**
```json
{
  "ok": true,
  "block": 16,
  "lessons": [9, 16],
  "journals": [
    { "id": 502434, "name": "Meeting 7", "lessons": [9] },
    { "id": 508284, "name": "Meeting 8", "lessons": [11, 10] }
  ],
  "journalIds": [502434, 508284],
  "covered": {
    "covered": true,
    "reportName": "Meeting 7 - Meeting 13",
    "lessons": [9, 10, 11, 12, 13, 14, 15, 16]
  },
  "criteria": [
    { "id": 1, "name": "Coding & Literacy Concept", "template": "Report 1\n...", "note_template": "Kiano Byan Azala mempelajari konsep dasar pemrograman ..." }
  ],
  "missing_journals": [],
  "fillable": true,
  "student_name": "Kiano Byan Azala",
  "course_name": "Coding Xplorer"
}
```

| Field | Keterangan |
|---|---|
| `lessons` | Rentang lesson blok `[from, to]` |
| `journals` / `journalIds` | Jurnal meeting yang memuat lesson di rentang (urut lesson awal); `[]` bila kosong |
| `covered` | `covered: true` bila blok (sebagian/seluruh) sudah tercakup report existing → UI memblokir submit; `lessons` = lesson yang overlap, `reportName` = report pemilik |
| `criteria[].template` | Isi mentah template "Report 1..N" dari CMS (belum diproses; `"-"` atau `" "` = tidak ada template) |
| `criteria[].note_template` | Bagian "Report N" (N = blok/8) dgn placeholder `(nama_siswa)`/`(student_name)` sudah diganti nama asli; `""` bila kriteria tanpa template (mis. Character) atau blok melebihi Report terakhir — UI memakai ini sebagai awal catatan (bisa diedit) |
| `missing_journals` | Nama meeting di rentang yang **belum punya jurnal** |
| `fillable` | `true` = ada lesson di rentang, jadi jurnal bisa diisi otomatis saat create |

**Respons 400** (tidak menyentuh CMS): `{ "ok": false, "error": "…" }` — contoh pesan:
- `"Blok harus 8, 16, 24, atau 32"` (blok invalid)
- `"Book tidak ditemukan di hasil scan — pindai ulang dulu"`
- `"Course ini sudah ditandai selesai — batalkan di bagian 'Ditandai selesai' dulu"`
- `"Sesi CMS berakhir — masuk ulang"`

Ref: `server/index.js:194` · `report.js:340` (`previewBlock`), `report.js:578` (`fetchCourseCriteria`), `report.js:592` (`templateForBlock`), `journal.js:360` (`analyzeBlockJournals`).

---

### POST /api/report/create

Buat report satu blok ke CMS: validasi ulang (jurnal ada di rentang, tidak overlap report existing), `POST summary` lalu `POST report` dengan `{ learning_session_book_meeting_journal_ids, criterias }`. Kriteria minimal satu (subset bebas); tiap kriteria divalidasi id-nya milik course, skor di-clamp 0–100. Bila CMS menolak `note` (pesan mengandung criteria/note/score), dikirim ulang tanpa note.

**Auto-isi jurnal:** bila tidak ada jurnal untuk lesson di rentang, server memanggil `ensureJournalsForBlock` — tiap meeting di rentang yang belum punya jurnal **dibuat otomatis** (note + skor, pola sama dengan fitur Jurnal Meeting: kelipatan 8 → 100, selainnya 70–100), lalu jurnal di-fetch ulang. Gagal mengisi → create ditolak dengan daftar meeting yang gagal. Sukses → `block_status`/`block_info` blok diupdate (`waiting_approval`) tanpa scan ulang.

**Body:**
```json
{
  "student_id": 60251,
  "book_id": 197935,
  "block": 16,
  "criteria": [
    { "id": 1, "score": 85, "note": "Kiano Byan Azala mempelajari ..." },
    { "id": 2, "score": 90, "note": "" }
  ]
}
```

**Respons 200:**
```json
{
  "ok": true,
  "status": "ok",
  "message": "Blok 24 terkirim (#112505) — Meeting 14 - Meeting 19",
  "report_id": 112505,
  "report_name": "Meeting 14 - Meeting 19"
}
```

**Respons 400** (ditolak, tanpa menulis CMS): `{ "ok": false, "status": "failed", "message": "…" }` — contoh:
- `"Lesson 9-16 sudah tercakup report \"Meeting 7 - Meeting 13\" (#112472)"`
- `"Tidak ada jurnal untuk Lesson 9-16 (isi lewat fitur Jurnal Meeting dulu)"`
- `"Gagal mengisi jurnal otomatis: Meeting 3 (HTTP 500)"`
- `"Jurnal otomatis selesai tapi Lesson 9-16 belum tercatat — periksa di fitur Jurnal Meeting"`
- `"Pilih minimal satu kriteria — isi skor 0–100 untuk kriteria yang disertakan"`
- `"Course ini sudah ditandai selesai — batalkan di bagian 'Ditandai selesai' dulu"`
- `"Sesi CMS berakhir — masuk ulang"` · pesan error dari CMS (`resp.data.message`)

Semua hasil (sukses/gagal) tercatat di `report_log` (lihat `/api/report/logs`). Ref: `server/index.js:209` · `report.js:411` (`createBlockReport`), `journal.js:425` (`ensureJournalsForBlock`).

---

### POST /api/report/run · GET /api/report/run-status

**Legacy** — alur lama (sekali jalan untuk satu siswa, semua book, semua kriteria skor 0). Sudah digantikan `/api/report/create`; dipertahankan untuk kompatibilitas, **tidak dipakai UI**. Jangan andalkan endpoint ini untuk fitur baru — riwayatnya tercatat dengan `block = 0` di `report_log`.

**POST** body `{ "student_id": 60251 }` →
- `200` `{ "started": true }` · `{ "started": false, "reason": "ALREADY_RUNNING" }`
- `400` `{ "error": "student_id wajib diisi" }`

**GET run-status**:
```json
{
  "running": false, "startedAt": null, "finishedAt": null,
  "current": 0, "total": 0, "studentName": null,
  "results": [], "failed": []
}
```
`results[i] = { book_id, course_name, ok, status: "ok"|"skipped"|"failed", message, report_id?, report_name? }`. Per book: report sudah ada → `skipped`; tidak ada jurnal → `failed`.

Ref: `server/index.js:169,180` · `report.js:677` (`runReportForStudents`), `report.js:608` (`createBookReport`).

---

### GET /api/report/logs

Riwayat 500 percobaan create terbaru (tabel `report_log`).

**Respons 200:**
```json
{
  "logs": [
    {
      "student_id": 60251,
      "student_name": "Kiano Byan Azala",
      "session_id": 62864,
      "book_id": 197935,
      "course_name": "Coding Xplorer",
      "report_id": 112505,
      "report_name": "Meeting 14 - Meeting 19",
      "status": "ok",
      "message": "Blok 24 terkirim (#112505) — Meeting 14 - Meeting 19",
      "created_at": "2026-08-17 09:51:34"
    }
  ]
}
```

`status`: `ok` / `skipped` / `failed`. Satu baris per `(student_id, session_id, book_id)` — percobaan terbaru menimpa yang lama. Ref: `server/index.js:260` · `report.js:39` (skema `report_log`).

---

## 6. Halaman web (SPA)

| Path | Keterangan |
|---|---|
| `/` | SPA client (dari `client/dist`) |
| `/assets/*` | Aset hasil build Vite |
| `/*` (selain `/api/*`) | Fallback ke `index.html` (client routing) |

Hanya disajikan bila `client/dist` ada (hasil `npm run build -w client`). Ref: `server/index.js:277`.

---

## 7. Skema DB (SQLite `server/data/recap.db`)

DB lokal `node:sqlite` (`DatabaseSync`), dibuat otomatis saat service dipakai. Migrasi kolom baru memakai `ALTER TABLE ... ADD COLUMN` dalam `try/catch` (lihat `report.js:reportDb`).

### `students`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INTEGER PK | ID siswa di CMS |
| `name` | TEXT | Nama siswa |
| `info` | TEXT | Ringkasan (kode · jumlah sesi) |
| `raw` | TEXT | JSON mentah dari `/api/tms/student` |
| `updated_at` | TEXT | Waktu sync |

### `recaps`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `student_id` | INTEGER PK | ID siswa |
| `course_id` | INTEGER PK | ID session (`session.id`) |
| `course_name` | TEXT | Nama course |
| `data` | TEXT | JSON lengkap recap (`fetchSessionRecap`) |
| `updated_at` | TEXT | Waktu update |

### `journal_log`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `student_id` / `course_id` / `meeting_id` | INTEGER PK | ID siswa, course, meeting |
| `note` | TEXT | Isi jurnal yang dikirim |
| `status` | TEXT | `ok` / `skipped` / `failed` |
| `message` | TEXT | Keterangan |
| `created_at` | TEXT | Waktu log |

### `report_scan`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `student_id` / `session_id` / `book_id` | INTEGER PK | Siswa, session, book |
| `course_id` | INTEGER | ID course |
| `course_name` | TEXT | Nama course |
| `max_lesson` | INTEGER | Lesson terakhir terdeteksi |
| `block` | INTEGER | `floor(max_lesson / 8)` |
| `report_exists` | INTEGER | 0/1 ada report (legacy, tidak dipakai filter due) |
| `report_id` / `report_name` | — | Report pertama dari list CMS |
| `covered_blocks` | TEXT | `"8,16"` — blok tercakup report existing (hasil scan) |
| `block_status` | TEXT | JSON `{ "16": "waiting_approval" }` — status per blok |
| `block_info` | TEXT | JSON `{ "16": { "report_id", "report_name", "status" } }` |
| `updated_at` | TEXT | Waktu scan |

### `report_done`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `student_id` / `book_id` | INTEGER PK | PK `(student_id, book_id)` |
| `created_at` | TEXT | Waktu ditandai |

### `report_log`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `student_id` / `session_id` / `book_id` | INTEGER PK | PK `(student_id, session_id, book_id)` |
| `course_name` | TEXT | Nama course |
| `report_id` / `report_name` | — | Hasil create bila berhasil |
| `status` | TEXT | `ok` / `skipped` / `failed` |
| `message` | TEXT | Keterangan |
| `created_at` | TEXT | Waktu log |

---

## 8. Endpoint CMS Timedoor (referensi)

Dipanggil server dengan header `Authorization: Bearer <token>`, `x-app-branch: [238]`, `x-app-timezone: Asia/Jakarta`. Origin `https://cms.timedooracademy.com`.

| Endpoint | Method | Fungsi |
|---|---|---|
| `/api/tms/auth/login` | POST | Login → `access_token` + `refresh_token` |
| `/api/auth/refresh-token` | POST | Perpanjang sesi |
| `/api/tms/student?search=&limit=&page=` | GET | Daftar siswa (paginasi, `meta.last_page`) |
| `/api/tms/student/{sid}/learning-session?search=` | GET | Daftar session siswa (tiap session: `book`, `latest_learning_session_book_id`) |
| `/api/tms/student/{sid}/learning-session/{lsid}` | GET | Detail session + book + course |
| `/api/tms/student/{sid}/learning-session/{lsid}/book` | GET | Daftar book (session-history) |
| `/api/tms/student/{sid}/learning-session/{lsid}/book/{bhid}/report` | GET/POST | List / buat report |
| `/api/tms/student/{sid}/learning-session/{lsid}/book/{bhid}/report/{rid}` | GET | Detail report (jurnal tercakup di `learning_session_book_meeting_journals`) |
| `/api/tms/student/{sid}/learning-session/{lsid}/book/{bhid}/report/{rid}` | PATCH/DELETE | Ubah / hapus report |
| `.../report/{rid}/update-status` | PATCH | Ubah status approval |
| `/api/cms/student/{sid}/learning-session/{lsid}/book/{bhid}/meeting-history?search=` | GET | Meeting + aktivitas (lesson, `content: "Lesson N - ..."`) |
| `/api/cms/student/{sid}/learning-session/{lsid}/book/{bhid}/meeting-history/activity` | GET | Skor aktivitas (`data.value`) per activity |
| `/api/cms/student/{sid}/learning-session/{lsid}/book/{bhid}/meeting-history/journal` | GET | Daftar jurnal semua meeting |
| `/api/cms/student/{sid}/learning-session/{lsid}/book/{bhid}/meeting-history/{mid}/journal` | GET/POST | Baca / tulis jurnal satu meeting (upsert; PUT/PATCH 404) |
| `/api/cms/student/{sid}/learning-session/{lsid}/book/{bhid}/summary` | POST | Hitung ringkasan report (body `{ learning_session_book_meeting_journal_ids }`) |
| `/api/cms/course/{courseId}/report-criteria` | GET | Kriteria + `templates[]` narasi (lang `id`/`en`) |
| `/api/v2/tms/student/{sid}/book/{bid}/progress-detail` | GET | Statistik progres: `stats` (`learnable`, `mastery_point`, `coin`, `child`, `course_skills`), `progresses[].detail` (`test_histories`, `project`) |

**Body create report CMS:** `{ learning_session_book_meeting_journal_ids: [...], criterias: [{ id, score, note }] }` — nama report ("Meeting 1 - Meeting 6") dibuat otomatis oleh CMS dari rentang meeting.

**Catatan data**: `test_histories` (jawaban quiz) dan `project` (hasil kerja siswa) **selalu kosong/null** pada semua siswa yang diuji — data quiz per soal belum tersedia lewat API ini (per 17-08-2026).

---

## 9. Catatan teknis

- **Jeda request CMS**: 400 ms (`REQUEST_DELAY`) — anti rate-limit.
- **Tanpa browser**: seluruh request ke CMS memakai `fetch` HTTP murni dari Node; tidak ada Playwright/Chromium.
- **Token**: dibaca dari `server/data/profile/storage.json` (cookies `access_token`/`refresh_token`); `validateSession()` punya cache 15 detik dan auto-refresh via `refresh_token` saat 401/403.
- **State non-persisten**: job background (`scanRun`, `recapRun`, `fillRun`, `runRun`) hidup di memori proses — restart server membatalkan job dan mereset status.
- **Node**: memakai `node:sqlite` (eksperimental, Node ≥ 22). Dependensi npm server: hanya `express`.
- **Create report = aksi tulis CMS**: `POST /api/report/create` menulis report (dan jurnal bila kosong) — tanpa izin pengguna, gunakan `/api/report/preview` yang read-only.
