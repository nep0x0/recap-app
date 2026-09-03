const { fetchJson } = require("../../lib/cms-client");
const { sleep } = require("../../lib/utils");
const { parseLessonNum, lessonSorter } = require("./journal-helpers");
const { generateJournalEntries } = require("./journal-entry-builder");

const REQUEST_DELAY = 400;

async function fetchAllPages(baseUrl, headers) {
  const items = [];
  let p = 1;
  let lastPage = 1;
  for (;;) {
    const body = await fetchJson(`${baseUrl}&page=${p}`, headers);
    const arr = Array.isArray(body.data) ? body.data : [];
    items.push(...arr);
    if (body.meta && body.meta.last_page) lastPage = body.meta.last_page;
    if (p >= lastPage) break;
    p++;
    if (p > 50) break;
    await sleep(REQUEST_DELAY);
  }
  return items;
}

async function buildCoursePlan(student, session, headers) {
  const sid = session.id;
  const bookId = session?.book?.id || null;
  const historyId = session.latest_learning_session_book_id || bookId;
  if (!historyId) return null;

  let det = session;
  try {
    const r = await fetchJson(`/api/tms/student/${student.id}/learning-session/${sid}`, headers);
    det = r.data || session;
  } catch {}

  const book = det.book || {};
  const course = book.course || {};
  const courseId = course.id ?? bookId ?? sid;

  const meetings = await fetchAllPages(
    `/api/cms/student/${student.id}/learning-session/${sid}/book/${historyId}/meeting-history?search=`,
    headers
  );

  const valueMap = new Map();
  try {
    const v = await fetchJson(
      `/api/cms/student/${student.id}/learning-session/${sid}/book/${historyId}/meeting-history/activity`,
      headers
    );
    for (const a of v.data || []) {
      if (a && a.id != null && a.data && a.data.value != null) valueMap.set(a.id, a.data.value);
    }
  } catch {}

  const sorted = meetings
    .map((m) => ({
      id: m.id,
      name: m.name,
      date: m.date,
      lessons: (m.activities || [])
        .map((a) => ({
          id: a.id,
          content: a?.data?.content || "",
          value: valueMap.has(a.id) ? valueMap.get(a.id) : (a?.data?.value ?? 0),
          num: parseLessonNum(a?.data?.content),
        }))
        .filter((l) => l.num !== null)
        .sort(lessonSorter),
    }))
    .sort((a, b) => String(a.name || a.date).localeCompare(String(b.name || b.date), undefined, { numeric: true }));

  const lessonsAll = sorted.flatMap((m) => m.lessons);
  const maxNum = lessonsAll.reduce((mx, l) => Math.max(mx, l.num), 0);
  const totalLessons = Math.max(det.total_progress ?? 0, maxNum);

  const statuses = [];
  for (const m of sorted) {
    let journal = null;
    try {
      const r = await fetchJson(
        `/api/cms/student/${student.id}/learning-session/${sid}/book/${historyId}/meeting-history/${m.id}/journal`,
        headers
      );
      const d = r.data || {};
      journal = d.id
        ? { id: d.id, note: d.note, recorded: (d.activities || []).map((a) => a?.data?.content || "").filter(Boolean) }
        : null;
    } catch {}
    statuses.push(journal);
  }

  const courseName = course.name || book.name || sid;
  const generated = generateJournalEntries({
    sorted,
    statuses,
    student,
    sid,
    bookId,
    historyId,
    courseId,
    courseName,
  });

  if (!generated) return null;

  return {
    course_id: courseId,
    total_lessons: totalLessons,
    course_name: courseName,
    book_id: bookId,
    history_id: historyId,
    session_id: sid,
    latest_progress: det.latest_progress ?? maxNum,
    total_progress: det.total_progress ?? null,
    entries: generated.entries,
    skipped: generated.skipped,
  };
}

module.exports = {
  fetchAllPages,
  buildCoursePlan,
  REQUEST_DELAY,
};
