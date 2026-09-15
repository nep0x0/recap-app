async function j(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  status: () => j("GET", "/api/status"),
  loginApi: (username, password) => j("POST", "/api/login-api", { username, password }),
  refresh: () => j("POST", "/api/refresh-login"),
  logout: () => j("POST", "/api/logout"),
  sync: () => j("POST", "/api/sync"),
  students: (q) => j("GET", `/api/students?q=${encodeURIComponent(q || "")}`),
  recap: (force) => j("POST", "/api/recap", { force: !!force }),
  recapStatus: () => j("GET", "/api/recap-status"),
  recaps: () => j("GET", "/api/recaps"),
  journalPlan: (studentId) => j("POST", "/api/journal/plan", { student_id: studentId }),
  journalPlanStatus: () => j("GET", "/api/journal/plan-status"),
  journalFill: (entries) => j("POST", "/api/journal/fill", { entries }),
  journalStatus: () => j("GET", "/api/journal/status"),
  reportScan: () => j("POST", "/api/report/scan"),
  reportScanStatus: () => j("GET", "/api/report/scan-status"),
  reportDue: () => j("GET", "/api/report/due"),
  reportBooks: (studentId) => j("GET", `/api/report/books?student_id=${studentId}`),
  reportPreview: (studentId, bookId, block) => j("GET", `/api/report/preview?student_id=${studentId}&book_id=${bookId}&block=${block}`),
  reportCreate: (payload) => j("POST", "/api/report/create", payload),
  reportLogs: () => j("GET", "/api/report/logs"),
  reportDone: () => j("GET", "/api/report/done"),
  reportMarkDone: (studentId, bookId) => j("POST", "/api/report/done", { student_id: studentId, book_id: bookId }),
  reportUnmarkDone: (studentId, bookId) => j("DELETE", "/api/report/done", { student_id: studentId, book_id: bookId }),
};