"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2, X, Loader2 } from "lucide-react";
import { participantsApi } from "@/lib/api/participants";
import { queryKeys } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/client";
import { formatBytes, saveBlob } from "@/lib/files";
import type { ParticipantImportReportDto, ParticipantImportRowDto } from "@/lib/types/api";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

type Phase = "pick" | "checking" | "report" | "importing" | "done";

/**
 * Bulk-add stars from a spreadsheet. Two steps on purpose: the sheet is checked first and
 * every row reported by its line number, and nothing is written until the user has seen
 * that report and every row is clean — the same all-or-nothing rule the original loader had.
 */
export default function ImportStarsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [report, setReport] = useState<ParticipantImportReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  function describe(err: unknown, fallback: string) {
    return err instanceof ApiError && err.detail ? err.detail : fallback;
  }

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!picked) return;
    setError(null);
    setReport(null);
    setPhase("pick");
    if (!/\.csv$/i.test(picked.name)) { setError("Choose a .csv file — in Excel or Google Sheets use File → Download / Save As → CSV."); setFile(null); return; }
    if (picked.size === 0) { setError("That file is empty."); setFile(null); return; }
    if (picked.size > MAX_CSV_BYTES) { setError(`That file is ${formatBytes(picked.size)}; the limit is 5 MB.`); setFile(null); return; }
    setFile(picked);
  }

  async function check() {
    if (!file) return;
    setError(null);
    setPhase("checking");
    try {
      const r = await participantsApi.importCsv(file, false);
      setReport(r);
      setOnlyProblems(r.problemCount > 0);
      setPhase("report");
    } catch (err) {
      setError(describe(err, "Couldn't check the file — try again."));
      setPhase("pick");
    }
  }

  async function commit() {
    if (!file) return;
    setError(null);
    setPhase("importing");
    try {
      const r = await participantsApi.importCsv(file, true);
      setReport(r);
      if (r.committed) {
        queryClient.invalidateQueries({ queryKey: queryKeys.participants });
        setPhase("done");
      } else {
        // The file changed between check and commit, or a row now collides with a star
        // somebody added in the meantime: show the fresh report, nothing was written.
        setOnlyProblems(true);
        setPhase("report");
        setError("Nothing was imported — the sheet has problems now. See the rows below.");
      }
    } catch (err) {
      setError(describe(err, "Couldn't import — nothing was written. Try again."));
      setPhase("report");
    }
  }

  async function template() {
    try {
      const f = await participantsApi.downloadImportTemplate();
      saveBlob(f.blob, f.fileName ?? "stars-import-template.csv");
    } catch (err) {
      setError(describe(err, "Couldn't download the template."));
    }
  }

  const busy = phase === "checking" || phase === "importing";
  const rows = report?.rows ?? [];
  const shownRows = onlyProblems ? rows.filter((r) => r.status === "error") : rows;
  const canCommit = phase === "report" && !!report && report.problemCount === 0 && report.fileProblems.length === 0 && report.readyCount > 0;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(760px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Import stars from a spreadsheet</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
              The sheet is checked first. Nothing is saved until every row is clean and you confirm.
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)", overflowY: "auto" }}>
          <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={choose} style={{ display: "none" }} tabIndex={-1} aria-hidden="true" />

          {phase !== "done" && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <button type="button" className="ss-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
                <FileSpreadsheet className="ss-btn-icon" />
                {file ? "Choose a different file" : "Choose CSV file"}
              </button>
              {file && (
                <span style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }} title={file.name}>{file.name}</span>
                  <span style={{ color: "var(--fg-tertiary)" }}>{formatBytes(file.size)}</span>
                </span>
              )}
              <button type="button" className="ss-btn" onClick={template} disabled={busy} style={{ marginLeft: "auto" }} title="A blank sheet with the columns the import understands">
                <Download className="ss-btn-icon" />
                Blank template
              </button>
            </div>
          )}

          {phase === "pick" && !report && (
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)", lineHeight: 1.5 }}>
              Use the blank template, or the Stars <strong>Export</strong> from this page — the same columns import back in.
              Required: <strong>Name</strong>, <strong>Program</strong> (its name as shown in the CRM) and <strong>Started</strong> (the start date).
              Dates as YYYY-MM-DD. Mark an anaphylactic allergy with a trailing <strong>*</strong>, e.g. <em>peanuts *</em>.
            </div>
          )}

          {error && (
            <div className="ss-alert is-warning" style={{ margin: 0 }}>
              <AlertCircle />
              <span className="ss-alert-text">{error}</span>
            </div>
          )}

          {report && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 13 }}>
                <span className="ss-badge is-prospective">{report.rowCount} row{report.rowCount === 1 ? "" : "s"}</span>
                {phase === "done" ? (
                  <span className="ss-badge is-active"><CheckCircle2 />{report.createdCount} imported</span>
                ) : (
                  <>
                    <span className="ss-badge is-active"><CheckCircle2 />{report.readyCount} ready</span>
                    {report.problemCount > 0 && <span className="ss-badge is-attention"><AlertCircle />{report.problemCount} with problems</span>}
                  </>
                )}
                {report.problemCount > 0 && phase !== "done" && (
                  <label style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
                    Only rows with problems
                  </label>
                )}
              </div>

              {report.fileProblems.map((p) => (
                <div key={p} className="ss-alert is-warning" style={{ margin: 0 }}>
                  <AlertCircle />
                  <span className="ss-alert-text">{p}</span>
                </div>
              ))}

              {shownRows.length > 0 && (
                <div style={{ border: "0.5px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--bg-secondary)", textAlign: "left" }}>
                        <th style={{ padding: "6px 10px", fontWeight: 500, width: 52 }}>Line</th>
                        <th style={{ padding: "6px 10px", fontWeight: 500 }}>Name</th>
                        <th style={{ padding: "6px 10px", fontWeight: 500 }}>Program</th>
                        <th style={{ padding: "6px 10px", fontWeight: 500 }}>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map((r: ParticipantImportRowDto) => (
                        <tr key={r.line} style={{ borderTop: "0.5px solid var(--border)", verticalAlign: "top" }}>
                          <td style={{ padding: "6px 10px", color: "var(--fg-tertiary)" }}>{r.line}</td>
                          <td style={{ padding: "6px 10px" }}>{r.name || <em style={{ color: "var(--fg-tertiary)" }}>blank</em>}</td>
                          <td style={{ padding: "6px 10px" }}>{r.program}</td>
                          <td style={{ padding: "6px 10px" }}>
                            {r.status === "error" ? (
                              <ul style={{ margin: 0, paddingLeft: 16, color: "var(--danger)" }}>
                                {r.messages.map((m) => <li key={m}>{m}</li>)}
                              </ul>
                            ) : r.status === "created" ? (
                              <span className="ss-badge is-active"><CheckCircle2 />Imported</span>
                            ) : (
                              <span className="ss-badge is-active"><CheckCircle2 />Ready</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {phase === "report" && report.problemCount > 0 && (
                <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
                  Fix the rows above in your spreadsheet, save it as CSV again, choose the file and re-check. Nothing is imported until every row is clean.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          {phase === "done" ? (
            <button type="button" className="ss-btn ss-btn-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              <button type="button" className="ss-btn" onClick={onClose} disabled={busy}>Cancel</button>
              {phase === "report" && canCommit ? (
                <button type="button" className="ss-btn ss-btn-primary" onClick={commit} disabled={busy}>
                  {busy ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Upload className="ss-btn-icon" />}
                  Import {report!.readyCount} star{report!.readyCount === 1 ? "" : "s"}
                </button>
              ) : (
                <button type="button" className="ss-btn ss-btn-primary" onClick={check} disabled={!file || busy}>
                  {phase === "checking" ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 className="ss-btn-icon" />}
                  {report ? "Re-check file" : "Check file"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
