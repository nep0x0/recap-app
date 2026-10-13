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

const fs = require("fs");
const { CODING_IMAGE_PATH } = require("../../config");

function buildJournalFormData({ note, teacherNote, activities, imagePath = CODING_IMAGE_PATH }) {
  const fd = new FormData();
  fd.append("status", "created");
  const noteText = String(note || "");
  const teacherNoteText = String(teacherNote || noteText);
  fd.append("note", noteText);
  fd.append("teacher_note", teacherNoteText);
  fd.append(
    "learning_session_book_meeting_activities",
    JSON.stringify(activities || [])
  );

  const targetPath = imagePath || CODING_IMAGE_PATH;
  if (targetPath && fs.existsSync(targetPath)) {
    const fileBuffer = fs.readFileSync(targetPath);
    const blob = new Blob([fileBuffer], { type: "image/jpeg" });
    fd.append("evidence_photos", blob, "Coding1.jpg");
  }
  return fd;
}

module.exports = {
  REPORT_STEP,
  parseLessonNum,
  buildNote,
  lessonSorter,
  computeScore,
  buildJournalFormData,
};

