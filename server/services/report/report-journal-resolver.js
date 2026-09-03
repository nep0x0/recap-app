const { fetchJson } = require("../../lib/cms-client");
const { extractList } = require("../../lib/utils");
const journalService = require("../journal");
const { blockLessonRange, lessonNumbersOfJournal } = require("./report-helpers");

async function resolveBlockJournals(api, { sid, lsid, bid, block, studentName }, headers) {
  const range = blockLessonRange(block);
  const jl = await fetchJson(
    `/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/meeting-history/journal`,
    headers
  );
  let journals = extractList(jl).map((j) => ({
    id: j.id,
    name: j.name || "Meeting ?",
    lessons: lessonNumbersOfJournal(j),
  }));
  let inRange = journals.filter((j) => j.lessons.some((n) => n >= range.from && n <= range.to));
  let journalIds = inRange.map((j) => j.id);

  if (!journalIds.length) {
    let auto = null;
    try {
      auto = await journalService.ensureJournalsForBlock(api, {
        student_id: sid,
        session_id: lsid,
        book_id: bid,
        block,
        student_name: studentName,
      });
    } catch {}
    if (!auto || !auto.ok) {
      return {
        ok: false,
        error: `Tidak ada jurnal untuk Lesson ${range.from}-${range.to} (isi lewat fitur Jurnal Meeting dulu)`,
      };
    }
    if (auto.failed && auto.failed.length) {
      return {
        ok: false,
        error: `Gagal mengisi jurnal otomatis: ${auto.failed.map((f) => f.meeting_name + " (" + f.error + ")").join("; ")}`,
      };
    }

    const re = await fetchJson(
      `/api/cms/student/${sid}/learning-session/${lsid}/book/${bid}/meeting-history/journal`,
      headers
    );
    journals = extractList(re).map((j) => ({
      id: j.id,
      name: j.name || "Meeting ?",
      lessons: lessonNumbersOfJournal(j),
    }));
    inRange = journals.filter((j) => j.lessons.some((n) => n >= range.from && n <= range.to));
    if (!inRange.length) {
      return {
        ok: false,
        error: `Jurnal otomatis selesai tapi Lesson ${range.from}-${range.to} belum tercatat — periksa di fitur Jurnal Meeting`,
      };
    }
    journalIds = inRange.map((j) => j.id);
  }

  return { ok: true, journalIds, journals, range };
}

module.exports = {
  resolveBlockJournals,
};
