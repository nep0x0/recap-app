import { IconExternal, IconReport } from "../../icons.jsx";
import StatusChip from "../common/StatusChip.jsx";
import { SkelRows } from "../common/Skeleton.jsx";
import { relDate } from "../../fmt.js";

function cmsUrl(studentId, sessionId, bookId) {
  return `https://cms.timedooracademy.com/tms/student/${studentId}/session/${sessionId}/session-history/${bookId}/report`;
}

export default function ReportLogsTable({
  logs,
  viewLogs,
  logFilter,
  logCounts,
  initialLoading,
  onFilterChange,
}) {
  const filterOptions = [
    ["all", "Semua"],
    ["ok", `${logCounts.ok} berhasil`],
    ["skipped", `${logCounts.skipped} skip`],
    ["failed", `${logCounts.failed} gagal`],
  ];

  return (
    <>
      <div className="row spread wrap">
        <span className="muted small">Semua percobaan pembuatan report — klik status untuk menyaring.</span>
      </div>
      <div className="chiprow">
        {filterOptions.map(([k, label]) => (
          <button
            key={k}
            className={`chip ${logFilter === k ? "active" : ""}`}
            onClick={() => onFilterChange(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {initialLoading ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Siswa</th>
                <th>Course</th>
                <th>Blok</th>
                <th>Status</th>
                <th>Pesan</th>
                <th className="hide-sm">Waktu</th>
              </tr>
            </thead>
            <SkelRows cols={6} />
          </table>
        </div>
      ) : viewLogs.length === 0 ? (
        <div className="empty">
          <IconReport width={34} height={34} className="empty-ico" />
          {logs.length === 0 ? "Belum ada riwayat pembuatan report." : "Tidak ada baris dengan filter ini."}
        </div>
      ) : (
        <>
          <div className="tbl-desktop">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Siswa</th>
                    <th>Course</th>
                    <th>Blok</th>
                    <th>Status</th>
                    <th>Pesan</th>
                    <th className="hide-sm">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {viewLogs.map((l) => (
                    <tr key={`${l.student_id}-${l.book_id}-${l.block}-${l.created_at}`}>
                      <td className="now">{l.student_name}</td>
                      <td className="ellip" title={l.course_name}>
                        {l.course_name || "—"}
                      </td>
                      <td className="mono now">{l.block ? `blok ${l.block}` : "—"}</td>
                      <td>
                        <StatusChip status={l.status} />
                      </td>
                      <td className="small">
                        {l.message}
                        {l.status === "ok" && (
                          <a
                            className="rowlink"
                            href={cmsUrl(l.student_id, l.session_id, l.book_id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <IconExternal width={12} height={12} />
                            buka di CMS
                          </a>
                        )}
                      </td>
                      <td className="muted small now hide-sm">{relDate(l.created_at.replace(" ", "T") + "Z")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tbl-mobile">
            {viewLogs.map((l) => (
              <div key={`m-${l.student_id}-${l.book_id}-${l.block}-${l.created_at}`} className="mcard">
                <div className="mcard-top">
                  <b className="ellip">{l.student_name}</b>
                  <StatusChip status={l.status} />
                </div>
                <div className="muted small ellip">
                  {l.course_name || "—"}
                  {l.block ? ` · blok ${l.block}` : ""}
                </div>
                <div className="small">{l.message}</div>
                <div className="mcard-foot">
                  <span className="muted small now">{relDate(l.created_at.replace(" ", "T") + "Z")}</span>
                  {l.status === "ok" && (
                    <a
                      className="rowlink"
                      href={cmsUrl(l.student_id, l.session_id, l.book_id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <IconExternal width={12} height={12} />
                      Buka CMS
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
