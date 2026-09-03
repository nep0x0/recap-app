const { getDb } = require("../../db");
const { sleep } = require("../../lib/utils");
const {
  fetchAllPages,
  buildCoursePlan,
  REQUEST_DELAY,
} = require("./journal-course-plan.service");

async function buildPlan(api, { studentId } = {}) {
  const valid = await api.validateSession();
  if (!valid) throw new Error("NOT_LOGGED_IN");
  const headers = await api.getApiHeaders();
  if (!headers) throw new Error("NO_TOKEN");

  const db = getDb();
  const students = db.prepare("SELECT id, name FROM students ORDER BY lower(name)").all();
  const filterId = studentId ? Number(studentId) : null;
  const courses = [];

  for (const st of students) {
    if (filterId && st.id !== filterId) continue;
    let sessions = [];
    try {
      sessions = await fetchAllPages(`/api/tms/student/${st.id}/learning-session?search=`, headers);
    } catch {
      continue;
    }
    for (const session of sessions || []) {
      try {
        const cp = await buildCoursePlan(st, session, headers);
        if (cp) courses.push({ student_id: st.id, student_name: st.name, ...cp });
      } catch {
        continue;
      }
      await sleep(REQUEST_DELAY);
    }
  }

  const entries = courses
    .flatMap((c) => c.entries.map((e) => ({ ...e, course_name: c.course_name })))
    .filter((e) => !e.exists);
  const skipped = courses.flatMap((c) => c.skipped);

  return {
    built_at: new Date().toISOString(),
    student_count: new Set(courses.map((c) => c.student_id)).size,
    course_count: courses.length,
    entry_count: entries.length,
    courses,
    entries,
    skipped,
  };
}

module.exports = {
  buildPlan,
};
