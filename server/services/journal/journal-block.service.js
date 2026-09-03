const { API_ORIGIN } = require("../../config");
const { fetchJson } = require("../../lib/cms-client");
const { sleep } = require("../../lib/utils");
const {
  REPORT_STEP,
  parseLessonNum,
  buildNote,
  lessonSorter,
  computeScore,
} = require("./journal-helpers");
const { fetchAllPages } = require("./journal-course-plan.service");


const REQUEST_DELAY = 400;

async function analyzeBlockJournals(api, { student_id, session_id, book_id, block, student_name }) {
  const valid = await api.validateSession();
  if (!valid) return { ok: false, error: "Sesi CMS berakhir — masuk ulang" };
  const headers = await api.getApiHeaders();
  if (!headers) return { ok: false, error: "Token tidak ditemukan" };

  const from = block - REPORT_STEP + 1;
  const to = block;

  const meetings = await fetchAllPages(
    `/api/cms/student/${student_id}/learning-session/${session_id}/book/${book_id}/meeting-history?search=`,
    headers
  );

  const valueMap = new Map();
  try {
    const v = await fetchJson(
      `/api/cms/student/${student_id}/learning-session/${session_id}/book/${book_id}/meeting-history/activity`,
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
        .filter((l) => l.num !== null && l.num >= from && l.num <= to)
        .sort(lessonSorter),
    }))
    .filter((m) => m.lessons.length > 0)
    .sort((a, b) => String(a.name || a.date).localeCompare(String(b.name || b.date), undefined, { numeric: true }));

  const missing = [];
  for (const m of sorted) {
    let exists = false;
    try {
      const r = await fetchJson(
        `/api/cms/student/${student_id}/learning-session/${session_id}/book/${book_id}/meeting-history/${m.id}/journal`,
        headers
      );
      exists = !!(r.data && r.data.id);
    } catch {}
    if (!exists) missing.push({ id: m.id, name: m.name, date: m.date, lessons: m.lessons });
  }

  return {
    ok: true,
    fillable: sorted.length > 0,
    student_name: student_name || "siswa",
    meetings: sorted.map((m) => ({ id: m.id, name: m.name })),
    missing,
  };
}

async function ensureJournalsForBlock(api, opts) {
  const a = await analyzeBlockJournals(api, opts);
  if (!a.ok) return a;
  if (!a.missing.length) return { ok: true, fillable: true, created: [], existing: a.meetings, failed: [] };

  const valid = await api.validateSession();
  const headers = await api.getApiHeaders();
  const { student_id, session_id, book_id } = opts;

  const created = [];
  const failed = [];
  for (const m of a.missing) {
    try {
      const r = await fetch(
        API_ORIGIN +
          `/api/cms/student/${student_id}/learning-session/${session_id}/book/${book_id}/meeting-history/${m.id}/journal`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + headers.token,
            "x-app-branch": headers.branch,
            "x-app-timezone": headers.timezone,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            note: buildNote(a.student_name, m.lessons),
            learning_session_book_meeting_activities: m.lessons.map((l) => ({ id: l.id, score: computeScore(l) })),
          }),
          signal: AbortSignal.timeout(30000),
        }
      );
      const body = await r.json().catch(() => null);
      if (r.status >= 200 && r.status < 300) {
        created.push({ meeting_id: m.id, meeting_name: m.name, lessons: m.lessons.length });
      } else {
        failed.push({ meeting_id: m.id, meeting_name: m.name, error: body?.message || `HTTP ${r.status}` });
      }
    } catch (er) {
      failed.push({ meeting_id: m.id, meeting_name: m.name, error: String(er.message || er) });
    }
    await sleep(REQUEST_DELAY);
  }
  return { ok: true, fillable: true, created, existing: [], failed };
}

module.exports = {
  analyzeBlockJournals,
  ensureJournalsForBlock,
};
