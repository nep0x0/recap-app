const { getDb } = require("../../db");
const { sleep } = require("../../lib/utils");
const {
  fetchAllPages,
  buildCoursePlan,
  REQUEST_DELAY,
} = require("./journal-course-plan.service");

let planRun = null;

function getPlanStatus() {
  if (!planRun) return { running: false, current: 0, total: 0, label: "", plan: null, failed: [] };
  return {
    running: planRun.running,
    startedAt: planRun.startedAt,
    current: planRun.current,
    total: planRun.total,
    label: planRun.label,
    plan: planRun.plan,
    failed: planRun.failed,
  };
}

// Job background: susun draf jurnal (read-only terhadap CMS).
// Respons trigger langsung { started: true }; progres diambil via getPlanStatus.
function runPlan(api, { studentId } = {}) {
  if (planRun && planRun.running) return { started: false, reason: "ALREADY_RUNNING" };
  planRun = {
    running: true,
    startedAt: new Date().toISOString(),
    current: 0,
    total: 0,
    label: "",
    plan: null,
    failed: [],
  };
  (async () => {
    try {
      const valid = await api.validateSession();
      if (!valid) throw new Error("NOT_LOGGED_IN");
      const headers = await api.getApiHeaders();
      if (!headers) throw new Error("NO_TOKEN");

      const db = getDb();
      const students = db.prepare("SELECT id, name FROM students ORDER BY lower(name)").all();
      const filterId = studentId ? Number(studentId) : null;
      const todo = filterId ? students.filter((st) => st.id === filterId) : students;
      planRun.total = todo.length;
      const courses = [];

      for (const st of todo) {
        planRun.current += 1;
        planRun.label = st.name;
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

      planRun.plan = {
        built_at: new Date().toISOString(),
        student_count: new Set(courses.map((c) => c.student_id)).size,
        course_count: courses.length,
        entry_count: entries.length,
        courses,
        entries,
        skipped,
      };
    } catch (e) {
      planRun.failed.push({ message: String(e.message || e) });
    } finally {
      planRun.running = false;
    }
  })();
  return { started: true };
}

module.exports = {
  runPlan,
  getPlanStatus,
};
