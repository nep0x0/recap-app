import { IconCheck } from "../../icons.jsx";
import { SkelRows } from "../common/Skeleton.jsx";
import { relDate } from "../../fmt.js";

export default function ReportDoneTable({ done, initialLoading, onUnmark }) {
  return (
    <>
      <div className="row spread wrap">
        <span className="muted small">
          Course yang sudah beres tanpa report — tidak akan muncul saat scan. Batalkan bila salah tandai.
        </span>
      </div>

      {initialLoading ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Siswa</th>
                <th>Course</th>
                <th className="hide-sm">Lesson</th>
                <th className="hide-sm">Waktu</th>
                <th>Batalkan</th>
              </tr>
            </thead>
            <SkelRows cols={5} />
          </table>
        </div>
      ) : done.length === 0 ? (
        <div className="empty">
          <IconCheck width={34} height={34} className="empty-ico" />
          Belum ada course yang ditandai selesai.
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
                    <th className="hide-sm">Lesson</th>
                    <th className="hide-sm">Waktu</th>
                    <th>Batalkan</th>
                  </tr>
                </thead>
                <tbody>
                  {done.map((x) => (
                    <tr key={`d-${x.student_id}-${x.book_id}`}>
                      <td className="now">{x.student_name}</td>
                      <td className="ellip" title={x.course_name}>
                        {x.course_name || "—"}
                      </td>
                      <td className="mono hide-sm">{x.max_lesson || "—"}</td>
                      <td className="muted small now hide-sm">
                        {relDate(x.created_at.replace(" ", "T") + "Z")}
                      </td>
                      <td className="now">
                        <button className="ghost sm" onClick={() => onUnmark(x)}>
                          Batalkan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tbl-mobile">
            {done.map((x) => (
              <div key={`m-d-${x.student_id}-${x.book_id}`} className="mcard">
                <div className="mcard-top">
                  <b className="ellip">{x.student_name}</b>
                  <span className="chip ok">selesai</span>
                </div>
                <div className="muted small ellip">{x.course_name || "—"}</div>
                <div className="mcard-foot">
                  <span className="muted small now">{relDate(x.created_at.replace(" ", "T") + "Z")}</span>
                  <button className="ghost sm" onClick={() => onUnmark(x)}>
                    Batalkan
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
