const { getDb } = require("../../db");
const { scoreSummary } = require("./recap-fetch.service");

function listRecaps() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.student_id, r.course_id, r.course_name, r.data, r.updated_at, s.name AS student_name
       FROM recaps r JOIN students s ON s.id = r.student_id
       ORDER BY s.name, r.course_name`
    )
    .all();
  return rows.map((r) => {
    let data = {};
    try {
      data = JSON.parse(r.data);
    } catch {}
    const stats = data.stats || {};
    const mp = stats.mastery_point || {};
    const lb = stats.learnable || {};
    const quizzes = (data.quizzes || []).map((q) => {
      const sc = scoreSummary(q);
      return { score: sc, attempt: q.attempt };
    });
    return {
      student_id: r.student_id,
      student_name: r.student_name,
      course_id: r.course_id,
      course_name: r.course_name,
      last_lesson: data.last_lesson || null,
      last_lesson_date: data.last_lesson_date || null,
      last_meeting: data.last_meeting || null,
      latest_progress: data.latest_progress ?? null,
      total_progress: data.total_progress ?? null,
      completion_percent: lb.completion_percentage ?? null,
      mastery_gained: mp.gained ?? null,
      mastery_max: mp.max ?? null,
      mastery_pct: mp.completion_percentage ?? null,
      coin_gained: (stats.coin || {}).gained ?? null,
      quiz_count: quizzes.length,
      quizzes,
      meetings: data.meetings || [],
      synced_at: r.updated_at,
    };
  });
}

module.exports = {
  listRecaps,
};
