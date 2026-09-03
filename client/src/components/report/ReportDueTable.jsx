import { IconCheck, IconExternal, IconRefresh, IconAlert, IconReport } from "../../icons.jsx";
import { SkelRows } from "../common/Skeleton.jsx";
import { relDate } from "../../fmt.js";

function cmsUrl(studentId, sessionId, bookId) {
  return `https://cms.timedooracademy.com/tms/student/${studentId}/session/${sessionId}/session-history/${bookId}/report`;
}

function initials(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

export default function ReportDueTable({
  due,
  lastScanAt,
  scanStale,
  scanStatus,
  initialLoading,
  busy,
  creating,
  onScan,
  onPickBlock,
  onMarkDone,
  isChipActive,
}) {
  return (
    <>
      <div className="row spread wrap">
        <span className="muted small">
          {lastScanAt
            ? `Blok yang belum tercakup report — dicek ${relDate(new Date(lastScanAt).toISOString())}. Klik blok untuk membuat.`
            : "Pindai dulu untuk tahu siswa yang sudah melampaui batas blok tapi report-nya belum dibuat."}
        </span>
        <button className="ghost" disabled={busy || scanStatus.running} onClick={onScan}>
          {scanStatus.running ? <span className="spinner sm" /> : <IconRefresh width={16} height={16} />}
          {scanStatus.running
            ? `Memindai… ${scanStatus.current ?? "?"}/${scanStatus.total ?? "?"}${
                scanStatus.total > 0 ? ` (${Math.round(((scanStatus.current || 0) / scanStatus.total) * 100)}%)` : ""
              }${scanStatus.studentName ? ` · ${scanStatus.studentName}` : ""}`
            : "Pindai ulang"}
        </button>
      </div>

      {scanStale && (
        <div className="banner banner-warn">
          <IconAlert width={15} height={15} />
          Data scan lebih dari 1 hari — pindai ulang agar daftar akurat.
        </div>
      )}

      {initialLoading ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Siswa</th>
                <th>Course</th>
                <th>Blok</th>
                <th className="hide-sm">Lesson</th>
                <th>CMS</th>
                <th>Selesai</th>
              </tr>
            </thead>
            <SkelRows cols={6} />
          </table>
        </div>
      ) : due.length === 0 ? (
        <div className="empty">
          <IconReport width={34} height={34} className="empty-ico" />
          <b>Tidak ada siswa yang perlu report.</b>
          <br />
          Semua blok yang sudah tercapai sudah tercakup report — atau belum ada data scan.
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
                    <th className="hide-sm">Lesson</th>
                    <th>CMS</th>
                    <th>Selesai</th>
                  </tr>
                </thead>
                <tbody>
                  {due.map((d) => (
                    <tr key={`${d.student_id}-${d.book_id}`}>
                      <td className="now">{d.student_name}</td>
                      <td className="ellip" title={d.course_name}>
                        {d.course_name || "—"}
                      </td>
                      <td className="now">
                        {d.due_blocks.map((b) => (
                          <button
                            key={b}
                            className={`chip ${isChipActive(d, b) ? "active" : ""}`}
                            disabled={creating}
                            onClick={() => onPickBlock(d, b)}
                          >
                            blok {b}
                          </button>
                        ))}
                        {(d.waiting_blocks || []).map((w) => (
                          <button
                            key={`w-${w.block}`}
                            className="chip wait"
                            title={`Report "${w.report_name || "?"}" ${
                              w.status === "waiting_approval" ? "menunggu persetujuan" : `berstatus ${w.status}`
                            }`}
                            disabled={creating}
                            onClick={() => onPickBlock(d, w.block)}
                          >
                            <span className="dot" />
                            blok {w.block}
                          </button>
                        ))}
                      </td>
                      <td className="mono hide-sm">{d.max_lesson || "—"}</td>
                      <td className="now">
                        <a
                          className="rowlink"
                          href={cmsUrl(d.student_id, d.session_id, d.book_id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <IconExternal width={13} height={13} />
                          CMS
                        </a>
                      </td>
                      <td className="now">
                        <button className="ghost sm" disabled={creating} onClick={() => onMarkDone(d)}>
                          <IconCheck width={13} height={13} />
                          Selesai
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tbl-mobile">
            {due.map((d) => (
              <div key={`m-${d.student_id}-${d.book_id}`} className="mcard">
                <div className="mcard-top">
                  <span className="avatar">{initials(d.student_name)}</span>
                  <b className="ellip">{d.student_name}</b>
                </div>
                <div className="muted small ellip">{d.course_name || "—"}</div>
                <div className="muted small">
                  Lesson terakhir: <b className="mono">{d.max_lesson || "—"}</b>
                </div>
                <div className="mcard-blocks">
                  {d.due_blocks.map((b) => (
                    <button
                      key={b}
                      className={`chip ${isChipActive(d, b) ? "active" : ""}`}
                      disabled={creating}
                      onClick={() => onPickBlock(d, b)}
                    >
                      buat blok {b}
                    </button>
                  ))}
                  {(d.waiting_blocks || []).map((w) => (
                    <button
                      key={`w-${w.block}`}
                      className="chip wait"
                      title={`Report "${w.report_name || "?"}" ${
                        w.status === "waiting_approval" ? "menunggu persetujuan" : `berstatus ${w.status}`
                      }`}
                      disabled={creating}
                      onClick={() => onPickBlock(d, w.block)}
                    >
                      <span className="dot" />
                      blok {w.block}
                    </button>
                  ))}
                </div>
                <div className="mcard-actions">
                  <a
                    className="rowlink"
                    href={cmsUrl(d.student_id, d.session_id, d.book_id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconExternal width={13} height={13} />
                    Buka CMS
                  </a>
                  <button className="ghost sm" disabled={creating} onClick={() => onMarkDone(d)}>
                    <IconCheck width={13} height={13} />
                    Tandai selesai
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
