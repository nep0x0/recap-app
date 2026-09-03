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
      course_name TEXT,
      report_id INTEGER,
      report_name TEXT,
      status TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (student_id, session_id, book_id)
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
  }
  return dbInstance;
}

module.exports = {
  getDb,
};
