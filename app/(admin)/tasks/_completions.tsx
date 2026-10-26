"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Info } from "lucide-react";
import { tasksApi } from "@/lib/api/tasks";
import { auditApi } from "@/lib/api/audit";
import { localMonthKey } from "@/lib/format";
import { saveBlob } from "@/lib/files";
import LoadError from "@/app/components/LoadError";
import type { TaskRole } from "@/lib/types/api";
import { TASK_ROLES, roleLabel } from "./_modal";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COLUMNS: (TaskRole | "None")[] = [...TASK_ROLES.map((r) => r.value), "None"];
const columnLabel = (c: TaskRole | "None") => (c === "None" ? "No role" : TASK_ROLES.find((r) => r.value === c)!.short);

/**
 * Completed by (Rachel, Oct 2026): who finished which tasks in a month, per job-title role —
 * for annual evaluations. Managers only (the API is ManagementWrite and audits every read).
 * Months are org-local. Rows reconstructed from the audit log for tasks finished before
 * tracking began are marked "est." and counted separately so nobody mistakes them for exact.
 */
export default function CompletionsReport() {
  const [ym, setYm] = useState(() => {
    const [y, m] = localMonthKey().split("-").map(Number);
    return { y, m };
  });
  const [person, setPerson] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["tasks", "completions", ym.y, ym.m],
    queryFn: () => tasksApi.getCompletions(ym.y, ym.m),
  });
  const report = q.data;

  function shift(delta: number) {
    setPerson(null);
    setYm(({ y, m }) => {
      const d = new Date(y, m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  }

  const items = useMemo(
    () => (report?.items ?? []).filter((i) => person === null || i.userId === person),
    [report, person],
  );
  const anyEstimated = (report?.people ?? []).some((p) => p.estimated > 0);

  async function exportCsv() {
    if (!report) return;
    const label = `${ym.y}-${String(ym.m).padStart(2, "0")}`;
    const fileName = `task-completions-${label}.csv`;
    const rows: (string | number)[][] = [
      ["Person", ...COLUMNS.map(columnLabel), "Total", "Estimated"],
      ...report.people.map((p) => [p.name, ...COLUMNS.map((c) => p.byRole[c] ?? 0), p.total, p.estimated]),
      [],
      ["Completed", "Person", "Role", "Task", "Project", "Estimated"],
      ...report.items.map((i) => [i.completedAt.replace("T", " "), i.name, roleLabel(i.role) ?? "No role", i.taskName, i.projectTitle, i.estimated ? "yes" : ""]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), fileName);
    // Same rule as the Reports page: the file is saved first, then the export is recorded;
    // a failed record surfaces instead of vanishing.
    try {
      await auditApi.recordExport({ exportKind: "task-completions", rowCount: report.items.length, fileName, scope: label });
      setAuditWarning(null);
    } catch {
      setAuditWarning(`“${fileName}” downloaded, but it could not be recorded in the audit log. The report itself was logged when it loaded.`);
    }
  }

  const cell: React.CSSProperties = { padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="ss-btn" aria-label="Previous month" onClick={() => shift(-1)} style={{ minHeight: 34 }}><ChevronLeft className="ss-btn-icon" /></button>
        <span style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", minWidth: 150, textAlign: "center" }}>{MONTHS[ym.m - 1]} {ym.y}</span>
        <button type="button" className="ss-btn" aria-label="Next month" onClick={() => shift(1)} style={{ minHeight: 34 }}><ChevronRight className="ss-btn-icon" /></button>
        <button type="button" className="ss-btn" style={{ marginLeft: "auto" }} disabled={!report || report.items.length === 0} onClick={exportCsv}>
          <Download className="ss-btn-icon" />Export CSV
        </button>
      </div>

      <div className="info-note">
        <Info />
        <span>
          Counts the tasks each person marked Done this month, by the task&apos;s role. It credits whoever was signed in, so it&apos;s only accurate when everyone uses their own login.
          {anyEstimated && " Rows marked est. were finished before tracking started and are estimated from the activity log."}
        </span>
      </div>

      {auditWarning && <div role="alert" className="ss-alert is-warning" style={{ margin: 0 }}><span className="ss-alert-text">{auditWarning}</span></div>}

      {q.isPending ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
      ) : q.isError ? (
        <LoadError title="Couldn't load the report" error={q.error} onRetry={() => q.refetch()} />
      ) : !report || report.people.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>No tasks were completed in {MONTHS[ym.m - 1]}.</div>
      ) : (
        <>
          <div className="proj" style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 10px" }}>Person</th>
                  {COLUMNS.map((c) => <th key={c} style={cell}>{columnLabel(c)}</th>)}
                  <th style={cell}>Total</th>
                </tr>
              </thead>
              <tbody>
                {report.people.map((p) => (
                  <tr key={p.userId} className="task-row-editable" tabIndex={0} aria-pressed={person === p.userId}
                    onClick={() => setPerson(person === p.userId ? null : p.userId)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPerson(person === p.userId ? null : p.userId); } }}
                    style={person === p.userId ? { outline: "2px solid var(--primary)", outlineOffset: -2 } : undefined}
                    title="Show this person's tasks below">
                    <td style={{ padding: "8px 10px" }}>
                      {p.name}
                      {p.estimated > 0 && <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}> · {p.estimated} est.</span>}
                    </td>
                    {COLUMNS.map((c) => <td key={c} style={{ ...cell, color: p.byRole[c] ? "var(--fg)" : "var(--fg-tertiary)" }}>{p.byRole[c] ?? 0}</td>)}
                    <td style={{ ...cell, fontWeight: "var(--w-medium)" }}>{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ss-label" style={{ color: "var(--fg-tertiary)" }}>
            {person ? `Tasks completed by ${report.people.find((p) => p.userId === person)?.name}` : "All completed tasks"} ({items.length})
          </div>
          <div className="proj">
            <table className="tbl">
              <tbody>
                {items.map((i) => (
                  <tr key={i.taskId}>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      {new Date(i.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div className="task-name"><span className="tn">{i.taskName}</span><span className="tc">{i.projectTitle}</span></div>
                    </td>
                    <td style={{ padding: "8px 10px" }}>{roleLabel(i.role) ? <span className="ss-chip" style={{ fontSize: 11 }}>{roleLabel(i.role)}</span> : <span style={{ color: "var(--fg-tertiary)", fontSize: 12 }}>No role</span>}</td>
                    <td style={{ padding: "8px 10px" }}>{i.name}{i.estimated && <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}> (est.)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
