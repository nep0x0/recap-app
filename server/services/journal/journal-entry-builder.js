const {
  REPORT_STEP,
  buildNote,
  computeScore,
} = require("./journal-helpers");

function generateJournalEntries({ sorted, statuses, student, sid, bookId, historyId, courseId, courseName }) {
  const startIdx = statuses.findIndex((j) => !j);
  if (startIdx < 0) return null;

  const skipped = [];
  const entries = [];
  let carried = [];

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const journal = statuses[i];

    if (journal) {
      const recorded = new Set(journal.recorded || []);
      const unrecorded = m.lessons.filter((l) => !recorded.has(l.content));
      carried = carried.concat(unrecorded);
      skipped.push({
        meeting_id: m.id,
        meeting_name: m.name,
        date: m.date,
        reason: "exists",
        lessons: unrecorded.map((l) => l.content),
      });
      continue;
    }
    if (i < startIdx) {
      carried = [];
      continue;
    }

    const candidate = carried.concat(m.lessons);
    carried = [];
    const examNums = candidate.filter((l) => l.num % REPORT_STEP === 0).map((l) => l.num);
    const lastExamNum = examNums.length ? Math.max(...examNums) : 0;
    const moved = lastExamNum ? candidate.filter((l) => l.num > lastExamNum) : [];
    const write = lastExamNum ? candidate.filter((l) => l.num <= lastExamNum) : candidate;

    if (moved.length) {
      carried = moved;
      skipped.push({
        meeting_id: m.id,
        meeting_name: m.name,
        date: m.date,
        reason: "moved",
        lessons: moved.map((l) => l.content),
      });
    }
    if (!write.length) {
      skipped.push({ meeting_id: m.id, meeting_name: m.name, date: m.date, reason: "empty" });
      continue;
    }

    entries.push({
      key: `${student.id}-${sid}-${m.id}`,
      student_id: student.id,
      student_name: student.name,
      session_id: sid,
      book_id: bookId,
      history_id: historyId,
      course_id: courseId,
      course_name: courseName,
      meeting_id: m.id,
      meeting_name: m.name,
      date: m.date,
      lessons: write.map((l) => l.content),
      note: buildNote(student.name, write),
      activities: write.map((l) => ({ id: l.id, name: l.content, score: computeScore(l) })),
      exists: null,
    });
  }

  return { entries, skipped };
}

module.exports = {
  generateJournalEntries,
};
