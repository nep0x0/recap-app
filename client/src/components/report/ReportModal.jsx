import { IconAlert, IconClose, IconReport } from "../../icons.jsx";

export default function ReportModal({
  create,
  preview,
  criteria,
  setCriteria,
  disableReasons,
  canSubmit,
  creating,
  onClose,
  onSubmit,
  trapRef,
}) {
  if (!create) return null;

  const journalsOk =
    !!preview &&
    preview.ok &&
    (preview.journalIds?.length > 0 || (preview.fillable && (preview.missing_journals || []).length > 0));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        ref={trapRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Buat report blok ${create.block}`}
      >
        <div className="modal-head">
          <div className="crit-head">
            <b>{create.student_name}</b>
            <span className="muted small">
              · {create.course_name} · Blok {create.block}
              {preview?.ok ? ` · Lesson ${preview.lessons[0]}–${preview.lessons[1]}` : ""}
            </span>
          </div>
          <button className="ghost sm" onClick={onClose} aria-label="Tutup">
            <IconClose width={14} height={14} />
          </button>
        </div>

        {!preview ? (
          <div className="muted small">
            <span className="spinner sm" /> Memuat pratinjau…
          </div>
        ) : preview.error ? (
          <div className="banner banner-warn">
            <IconAlert width={15} height={15} />
            {preview.error}
          </div>
        ) : (
          <>
            <div className="muted small">
              Meeting {preview.journals?.map((j) => j.name.replace(/^Meeting\s*/i, "")).join(", ") || "—"}
              <span className="chip ok">{preview.journals?.length || 0} jurnal</span>
            </div>
            {preview.covered?.covered && (
              <div className="banner banner-warn">
                <IconAlert width={15} height={15} />
                Lesson {preview.covered.lessons[0]}–{preview.covered.lessons[preview.covered.lessons.length - 1]} sudah
                tercakup report "{preview.covered.reportName}" — pilih blok lain.
              </div>
            )}
            {!preview.covered?.covered && (preview.missing_journals || []).length > 0 && (
              <div className="banner banner-info">
                <IconAlert width={15} height={15} />
                Jurnal untuk {preview.missing_journals.join(", ")} belum ada — akan diisi otomatis saat report
                dibuat.
              </div>
            )}
            {!preview.covered?.covered &&
              preview.journalIds?.length === 0 &&
              !(preview.fillable && (preview.missing_journals || []).length > 0) && (
                <div className="banner banner-warn">
                  <IconAlert width={15} height={15} />
                  Belum ada jurnal untuk Lesson {preview.lessons[0]}–{preview.lessons[1]} — buat lewat fitur
                  Jurnal Meeting dulu.
                </div>
              )}

            {journalsOk && !preview.covered?.covered && (
              <>
                <div className="modal-body">
                  <div className="quick-score-bar" style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
                    <span className="muted small" style={{ fontWeight: 600, marginRight: "4px" }}>Set Semua Skor:</span>
                    {[80, 85, 90, 95, 100].map((val) => (
                      <button
                        key={val}
                        type="button"
                        className="ghost sm"
                        style={{ padding: "2px 8px", fontSize: "12px", height: "auto" }}
                        title={`Isi semua kriteria dengan skor ${val}`}
                        onClick={() =>
                          setCriteria((arr) =>
                            arr.map((c) => (c.include ? { ...c, score: String(val) } : c))
                          )
                        }
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  {criteria.map((c, i) => (
                    <label key={c.id} className={`crit-row ${c.include ? "" : "off"}`}>
                      <input
                        type="checkbox"
                        className="crit-check"
                        checked={c.include}
                        onChange={() =>
                          setCriteria((arr) =>
                            arr.map((x, j) => (j === i ? { ...x, include: !x.include } : x))
                          )
                        }
                      />
                      <span className="crit-name">{c.name}</span>
                      <span className="crit-inputs">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          placeholder="0–100"
                          disabled={!c.include}
                          value={c.score}
                          aria-label={`Skor ${c.name}`}
                          onChange={(e) =>
                            setCriteria((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, score: e.target.value } : x))
                            )
                          }
                        />
                        <textarea
                          rows={2}
                          placeholder="Catatan guru (opsional)"
                          disabled={!c.include}
                          value={c.note}
                          aria-label={`Catatan ${c.name}`}
                          onChange={(e) =>
                            setCriteria((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, note: e.target.value } : x))
                            )
                          }
                        />
                      </span>
                    </label>
                  ))}
                </div>

                {disableReasons.length > 0 && (
                  <div className="banner banner-err disable-reasons" role="status">
                    <IconAlert width={15} height={15} />
                    <span>
                      {disableReasons.slice(0, 3).join(" ")}
                      {disableReasons.length > 3 ? ` (+${disableReasons.length - 3} lagi)` : ""}
                    </span>
                  </div>
                )}

                <div className="modal-foot">
                  <button className="ghost" onClick={onClose} disabled={creating}>
                    Batalkan
                  </button>
                  <button className="primary" disabled={!canSubmit} onClick={onSubmit}>
                    {creating ? <span className="spinner sm" /> : <IconReport width={16} height={16} />}
                    {creating ? "Mengirim…" : `Buat report blok ${create.block}`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
