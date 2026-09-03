const { fetchJson } = require("../../lib/cms-client");
const { extractList } = require("../../lib/utils");

const BLOCK_SIZE = 8;
const BLOCK_VALUES = [8, 16, 24, 32];

function parseLessonNum(content) {
  const m = String(content || "").match(/Lesson\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function maxLessonFromMeetings(meetings) {
  let max = 0;
  for (const m of meetings || []) {
    for (const a of m.activities || []) {
      const n = parseLessonNum(a?.data?.content || a?.data?.title || "");
      if (n && n > max) max = n;
    }
  }
  return max;
}

function lessonNumbersOfJournal(journal) {
  const out = [];
  for (const a of journal?.activities || []) {
    const n = parseLessonNum(a?.data?.content || a?.data?.title || "");
    if (n) out.push(n);
  }
  return out;
}

function scoreOfActivity(a) {
  const v = a?.value ?? a?.data?.value ?? a?.score;
  return typeof v === "number" && !isNaN(v) ? v : 100;
}

function blockLabels(block) {
  const labels = [];
  for (let i = 1; i <= block; i++) labels.push(i * BLOCK_SIZE);
  return labels;
}

function blockLessonRange(block) {
  return { from: block - BLOCK_SIZE + 1, to: block };
}

function fullBlocksOf(maxLesson, coveredLessons) {
  const out = [];
  for (let i = 1; i <= Math.floor(maxLesson / BLOCK_SIZE); i++) {
    const from = i * BLOCK_SIZE - BLOCK_SIZE + 1;
    const to = i * BLOCK_SIZE;
    let full = true;
    for (let n = from; n <= to; n++) {
      if (!coveredLessons.has(n)) {
        full = false;
        break;
      }
    }
    if (full) out.push(to);
  }
  return out;
}

function coveredBlocksOf(maxLesson, coveredLessons) {
  return fullBlocksOf(maxLesson, coveredLessons).join(",");
}

async function fetchCourseCriteria(courseId, headers) {
  if (!courseId) return [];
  try {
    const res = await fetchJson(`/api/cms/course/${courseId}/report-criteria`, headers);
    const list = extractList(res);
    return list.map((c) => {
      const tpl =
        (Array.isArray(c.templates) ? c.templates : []).find((t) => t?.lang === "id") ||
        (Array.isArray(c.templates) ? c.templates[0] : null);
      return { id: c.id, name: c.name, template: tpl?.content || "" };
    });
  } catch {
    return [];
  }
}

function templateForBlock(criterion, block, studentName) {
  const content = (criterion?.template || "").trim();
  if (!content || content === "-" || content === "-\n") return "";

  const want = block / BLOCK_SIZE;
  const matches = [...content.matchAll(/Report\s*(\d+)[\s:\-\.]*/gi)];
  let text = "";

  if (!matches.length) {
    text = content;
  } else {
    const blocks = new Map();
    const leading = content.slice(0, matches[0].index).trim();
    if (leading && Number(matches[0][1]) > 1) blocks.set(1, leading);
    for (let i = 0; i < matches.length; i++) {
      const num = Number(matches[i][1]);
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
      blocks.set(num, content.slice(start, end).trim());
    }
    text = blocks.get(want) || (blocks.size === 1 && blocks.has(1) ? blocks.get(1) : "");
  }

  if (!text || text === "-") return "";
  return text.replace(/\((?:nama[_\s]siswa|student[_\s]name)\)/gi, studentName || "siswa").trim();
}

async function fetchReportsWithJournals(sid, lsid, bid, headers) {
  const res = await fetchJson(`/api/tms/student/${sid}/learning-session/${lsid}/book/${bid}/report`, headers);
  const list = extractList(res);
  const out = [];
  for (const r of list) {
    const journalIds = [];
    try {
      const det = await fetchJson(
        `/api/tms/student/${sid}/learning-session/${lsid}/book/${bid}/report/${r.id}`,
        headers
      );
      const payload = det?.data || det;
      const js = Array.isArray(payload?.learning_session_book_meeting_journals)
        ? payload.learning_session_book_meeting_journals
        : [];
      for (const j of js) if (j?.id != null) journalIds.push(j.id);
    } catch {}
    out.push({ id: r.id, name: r.name || "", journalIds });
  }
  return out;
}

module.exports = {
  BLOCK_SIZE,
  BLOCK_VALUES,
  parseLessonNum,
  maxLessonFromMeetings,
  lessonNumbersOfJournal,
  scoreOfActivity,
  blockLabels,
  blockLessonRange,
  fullBlocksOf,
  coveredBlocksOf,
  fetchCourseCriteria,
  templateForBlock,
  fetchReportsWithJournals,
};
