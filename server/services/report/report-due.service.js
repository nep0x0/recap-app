const { getDb } = require("../../db");
const { blockLabels } = require("./report-helpers");

function listDue() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT rs.student_id, s.name AS student_name, rs.session_id, rs.book_id, rs.course_id, rs.course_name,
              rs.max_lesson, rs.block, rs.covered_blocks, rs.block_status, rs.block_info, rs.updated_at, rs.report_id, rs.report_name
       FROM report_scan rs JOIN students s ON s.id = rs.student_id
       LEFT JOIN report_done rd ON rd.student_id = rs.student_id AND rd.book_id = rs.book_id
       WHERE rs.block >= 1 AND rd.book_id IS NULL
       ORDER BY s.name, rs.course_name`
    )
    .all();

  return rows
    .map((r) => {
      const covered = new Set(String(r.covered_blocks || "").split(",").filter(Boolean).map((x) => Number(x)));
      let statusMap = {};
      try {
        statusMap = JSON.parse(r.block_status || "{}") || {};
      } catch {}
      let infoMap = {};
      try {
        infoMap = JSON.parse(r.block_info || "{}") || {};
      } catch {}
      const labels = blockLabels(r.block);
      const due_blocks = labels.filter((b) => !covered.has(b) && !statusMap[b]);
      const waiting_blocks = labels
        .filter((b) => statusMap[b] && statusMap[b] !== "approved")
        .map((b) => ({ block: b, status: statusMap[b], ...(infoMap[b] || {}) }));
      return { ...r, due_blocks, waiting_blocks };
    })
    .filter((r) => r.due_blocks.length > 0 || r.waiting_blocks.length > 0);
}

function listDone() {
  const db = getDb();
  return db
    .prepare(
      `SELECT rd.student_id, s.name AS student_name, rd.book_id, rs.session_id, rs.course_id,
              COALESCE(rs.course_name, '') AS course_name, rs.max_lesson, rd.created_at
       FROM report_done rd
       JOIN students s ON s.id = rd.student_id
       LEFT JOIN report_scan rs ON rs.student_id = rd.student_id AND rs.book_id = rd.book_id
       ORDER BY s.name, rs.course_name`
    )
    .all();
}

function markDone(studentId, bookId) {
  const db = getDb();
  const exists = db
    .prepare("SELECT 1 FROM report_scan WHERE student_id = ? AND book_id = ?")
    .get(studentId, bookId);
  if (!exists) return { ok: false, error: "Book tidak ditemukan di hasil scan — pindai ulang dulu" };
  db.prepare("INSERT OR IGNORE INTO report_done (student_id, book_id, created_at) VALUES (?, ?, datetime('now'))").run(
    studentId,
    bookId
  );
  return { ok: true };
}

function unmarkDone(studentId, bookId) {
  const db = getDb();
  db.prepare("DELETE FROM report_done WHERE student_id = ? AND book_id = ?").run(studentId, bookId);
  return { ok: true };
}

function isDone(studentId, bookId) {
  return !!getDb().prepare("SELECT 1 FROM report_done WHERE student_id = ? AND book_id = ?").get(studentId, bookId);
}

function listBooks(studentId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT rs.book_id, rs.session_id, rs.course_id, rs.course_name, rs.max_lesson, rs.block,
              rs.report_exists, rs.report_id, rs.report_name, rs.updated_at
       FROM report_scan rs
       LEFT JOIN report_done rd ON rd.student_id = rs.student_id AND rd.book_id = rs.book_id
       WHERE rs.student_id = ? AND rd.book_id IS NULL
       ORDER BY rs.course_name, rs.book_id`
    )
    .all(studentId);
  return rows.map((r) => ({ ...r, due_blocks: blockLabels(r.block) }));
}

module.exports = {
  listDue,
  listDone,
  markDone,
  unmarkDone,
  isDone,
  listBooks,
};
