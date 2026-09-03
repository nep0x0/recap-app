const REPORT_STEP = 8;

function parseLessonNum(content) {
  const m = String(content || "").match(/Lesson\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function buildNote(studentName, lessons) {
  return lessons.map((l) => `${studentName} mempelajari ${l.content} dengan baik.`).join(" ");
}

function lessonSorter(a, b) {
  return (a.num || 0) - (b.num || 0);
}

function computeScore(l) {
  if (l.num % REPORT_STEP === 0) return 100;
  if ((l.value ?? 0) === 0) return 86;
  return Math.max(70, Math.min((l.value ?? 0) + 10, 100));
}

module.exports = {
  REPORT_STEP,
  parseLessonNum,
  buildNote,
  lessonSorter,
  computeScore,
};
