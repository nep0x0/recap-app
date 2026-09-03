const { fetchJson } = require("../../lib/cms-client");
const { sleep } = require("../../lib/utils");

const REQUEST_DELAY = 400;

async function fetchAllPages(baseUrl, headers) {
  const items = [];
  let p = 1;
  let lastPage = 1;
  for (;;) {
    const body = await fetchJson(`${baseUrl}&limit=100&page=${p}`, headers, { ttl: 30000 });
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

function parseQuizzes(progress) {
  const out = [];
  for (const pr of progress?.progresses || []) {
    for (const th of pr?.detail?.test_histories || []) {
      out.push({ unit_uuid: pr.detail.uuid, attempt: th });
    }
  }
  return out;
}

function scoreSummary(quiz) {
  const text = JSON.stringify(quiz.attempt || {});
  const m = text.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);
  const c = text.match(/"correct"\s*:\s*(\d+)/);
  const t = text.match(/"total"\s*:\s*(\d+)/);
  if (m) return `${m[1]}${t ? "/" + t[1] : ""}`;
  if (c) return `${c[1]}${t ? "/" + t[1] : ""}`;
  return null;
}

async function fetchSessionRecap(studentId, session, headers) {
  const sid = session.id;
  let det = session;
  try {
    const r = await fetchJson(`/api/tms/student/${studentId}/learning-session/${sid}`, headers);
    det = r.data || r;
  } catch {}
  const book = det.book || {};
  const bookId = book.id;
  const historyId = session.latest_learning_session_book_id || bookId;

  let progress = null;
  if (bookId) {
    try {
      const r = await fetchJson(`/api/v2/tms/student/${studentId}/book/${bookId}/progress-detail`, headers);
      progress = r.data || null;
    } catch {}
  }

  let meetings = [];
  if (bookId && historyId) {
    try {
      meetings = await fetchAllPages(
        `/api/cms/student/${studentId}/learning-session/${sid}/book/${historyId}/meeting-history?search=`,
        headers
      );
    } catch {}
  }

  const withLesson = meetings
    .filter((m) => (m.activities || []).length > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const lastMeeting = withLesson[0] || null;

  const quizzes = progress ? parseQuizzes(progress) : [];
  const stats = progress?.stats || null;

  return {
    session_id: sid,
    session_name: det.name || session.name || "",
    session_code: det.code || session.code || "",
    book_id: bookId,
    book_name: book.name || "",
    course_id: book?.course?.id ?? null,
    course_name: book?.course?.name || book.name || session.name || "Course",
    last_lesson: det.activity || (lastMeeting ? (lastMeeting.activities[0]?.data?.content || "") : null) || null,
    last_lesson_date: lastMeeting ? lastMeeting.date : null,
    last_meeting: lastMeeting ? lastMeeting.name : null,
    latest_progress: det.latest_progress ?? null,
    total_progress: det.total_progress ?? null,
    stats,
    quizzes,
    meetings: meetings
      .map((m) => ({
        name: m.name,
        date: m.date,
        start_time: m.start_time,
        end_time: m.end_time,
        lessons: (m.activities || []).map((a) => a?.data?.content || "").filter(Boolean),
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
  };
}

module.exports = {
  fetchAllPages,
  parseQuizzes,
  scoreSummary,
  fetchSessionRecap,
  REQUEST_DELAY,
};
