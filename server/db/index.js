const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const { DATA_DIR, DB_PATH } = require("../config");

let dbInstance = null;

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      info TEXT,
      raw TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recaps (
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      course_name TEXT,
      data TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS report_scan (
      student_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      course_id INTEGER,
      course_name TEXT,
      max_lesson INTEGER DEFAULT 0,
      block INTEGER DEFAULT 0,
      report_exists INTEGER DEFAULT 0,
      report_id INTEGER,
      report_name TEXT,
      covered_blocks TEXT DEFAULT '',
      block_status TEXT DEFAULT '',
      block_info TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (student_id, session_id, book_id)
    );

    CREATE TABLE IF NOT EXISTS report_done (
      student_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (student_id, book_id)
    );

    CREATE TABLE IF NOT EXISTS report_log (
      student_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      block INTEGER NOT NULL DEFAULT 0,
      course_name TEXT,
      report_id INTEGER,
      report_name TEXT,
      status TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (student_id, session_id, book_id, block)
    );

    CREATE TABLE IF NOT EXISTS journal_log (
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      meeting_id INTEGER NOT NULL,
      note TEXT,
      status TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (student_id, course_id, meeting_id)
    );
  `);

  // Migrations for older databases if columns are missing
  const columnsToAdd = [
    { table: "report_scan", column: "covered_blocks TEXT DEFAULT ''" },
    { table: "report_scan", column: "block_status TEXT DEFAULT ''" },
    { table: "report_scan", column: "block_info TEXT DEFAULT ''" },
  ];

  for (const item of columnsToAdd) {
    try {
      db.exec(`ALTER TABLE ${item.table} ADD COLUMN ${item.column}`);
    } catch {
      // Column likely already exists
    }
  }
}

/**
 * Migrasi report_log lama: tambah kolom `block` ke primary key supaya
 * riwayat beberapa blok untuk book yang sama tidak saling menimpa.
 * Idempoten — langsung kembali bila skema baru sudah ada.
 * Backup database dibuat sekali sebelum perubahan struktural.
 */
function migrateReportLog(db) {
  const cols = db.prepare("PRAGMA table_info(report_log)").all();
  if (cols.some((c) => c.name === "block")) return;

  try {
    fs.copyFileSync(DB_PATH, `${DB_PATH}.bak`);
  } catch (e) {
    console.error("[db] gagal backup sebelum migrasi report_log:", e?.message || e);
    return;
  }

  console.log("[db] migrasi report_log: tambah kolom block ke primary key…");
  db.exec("ALTER TABLE report_log RENAME TO report_log_old");
  db.exec(`
    CREATE TABLE report_log (
      student_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      block INTEGER NOT NULL DEFAULT 0,
      course_name TEXT,
      report_id INTEGER,
      report_name TEXT,
      status TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (student_id, session_id, book_id, block)
    )
  `);

  const rows = db.prepare("SELECT * FROM report_log_old").all();
  const insert = db.prepare(
    `INSERT INTO report_log (student_id, session_id, book_id, block, course_name, report_id, report_name, status, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let migrated = 0;
  for (const r of rows) {
    const m = /Blok\s+(\d+)/i.exec(String(r.message || ""));
    insert.run(
      r.student_id,
      r.session_id,
      r.book_id,
      m ? Number(m[1]) : 0,
      r.course_name,
      r.report_id,
      r.report_name,
      r.status,
      r.message,
      r.created_at
    );
    migrated++;
  }
  db.exec("DROP TABLE report_log_old");
  console.log(`[db] migrasi report_log selesai — ${migrated} baris (block di-backfill dari teks pesan).`);
}

/**
 * Returns the singleton DatabaseSync instance.
 * Automatically creates tables and runs schema migration on initialization.
 *
 * @returns {DatabaseSync}
 */
function getDb() {
  if (!dbInstance) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    dbInstance = new DatabaseSync(DB_PATH);
    initSchema(dbInstance);
    migrateReportLog(dbInstance);
  }
  return dbInstance;
}

module.exports = {
  getDb,
};
