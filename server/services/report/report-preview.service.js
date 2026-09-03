const { getDb } = require("../../db");
const { fetchJson } = require("../../lib/cms-client");
const { extractList } = require("../../lib/utils");
const journalService = require("../journal");
const {
  BLOCK_VALUES,
  blockLessonRange,
  lessonNumbersOfJournal,
  fetchReportsWithJournals,
  fetchCourseCriteria,
  templateForBlock,
} = require("./report-helpers");
const { isDone } = require("./report-due.service");

async function previewBlock(api, studentId, bookId, block) {
  if (!BLOCK_VALUES.includes(block)) return { ok: false, error: "Blok harus 8, 16, 24, atau 32" };
  const valid = await api.validateSession();
  if (!valid) return { ok: false, error: "Sesi CMS berakhir — masuk ulang" };
  const headers = await api.getApiHeaders();
  if (!headers) return { ok: false, error: "Token tidak ditemukan" };

  const db = getDb();
  const row = db
    .prepare(
      `SELECT rs.student_id, rs.session_id, rs.book_id, rs.course_id, rs.course_name, s.name AS student_name
       FROM report_scan rs JOIN students s ON s.id = rs.student_id
       WHERE rs.student_id = ? AND rs.book_id = ?`
    )
    .get(studentId, bookId);
  if (!row) return { ok: false, error: "Book tidak ditemukan di hasil scan — pindai ulang dulu" };
  if (isDone(studentId, bookId)) {
    return {
      ok: false,
      error: "Course ini sudah ditandai selesai — batalkan di bagian 'Ditandai selesai' dulu",
    };
  }

  const range = blockLessonRange(block);
  const jl = await fetchJson(
    `/api/cms/student/${studentId}/learning-session/${row.session_id}/book/${bookId}/meeting-history/journal`,
    headers
  );
  const journals = extractList(jl).map((j) => ({
    id: j.id,
    name: j.name || "Meeting ?",
    lessons: lessonNumbersOfJournal(j),
  }));
  const inRange = journals.filter((j) => j.lessons.some((n) => n >= range.from && n <= range.to));
  inRange.sort((a, b) => (a.lessons[0] || 0) - (b.lessons[0] || 0));

  let covered = { covered: false, reportName: null, lessons: [] };
  try {
    const reports = await fetchReportsWithJournals(studentId, row.session_id, bookId, headers);
    for (const rep of reports) {
      const set = new Set();
      for (const j of journals) if (rep.journalIds.includes(j.id)) for (const n of j.lessons) set.add(n);
      const overlap = [...set].filter((n) => n >= range.from && n <= range.to);
      if (overlap.length) {
        covered = { covered: true, reportName: rep.name, lessons: overlap.sort((a, b) => a - b) };
        break;
      }
    }
  } catch {}

  const criteria = await fetchCourseCriteria(row.course_id, headers);

  let missing = [];
  let fillable = false;
  try {
    const a = await journalService.analyzeBlockJournals(api, {
      student_id: studentId,
      session_id: row.session_id,
      book_id: bookId,
      block,
      student_name: row.student_name,
    });
    if (a.ok) {
      fillable = a.fillable;
      missing = a.missing.map((m) => m.name);
    }
  } catch {}

  return {
    ok: true,
    block,
    lessons: [range.from, range.to],
    journals: inRange.map((j) => ({ id: j.id, name: j.name, lessons: j.lessons })),
    journalIds: inRange.map((j) => j.id),
    covered,
    criteria: criteria.map((c) => ({ ...c, note_template: templateForBlock(c, block, row.student_name) })),
    missing_journals: missing,
    fillable,
    student_name: row.student_name,
    course_name: row.course_name,
  };
}

module.exports = {
  previewBlock,
};
