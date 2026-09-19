"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  Users,
  TrendingUp,
  CalendarCheck,
  CheckSquare,
  AlertTriangle,
  Check,
  GraduationCap,
  Download,
  GitBranch,
} from "lucide-react";
import Widget from "../components/Widget";
import StatCard from "../components/StatCard";
import BarChart from "../components/BarChart";
import StaffList from "../components/StaffList";
import { Skeleton, SkeletonList } from "../components/Skeleton";
import { useReports } from "@/lib/api/hooks";
import LoadError from "@/app/components/LoadError";
import { participantsApi } from "@/lib/api/participants";
import { auditApi } from "@/lib/api/audit";
import type { AuditExportKind, ReportsDto } from "@/lib/types/api";

const STATUS_ROWS: { key: "activeParticipants" | "prospective" | "attention" | "former"; label: string; cls: string }[] = [
  { key: "activeParticipants", label: "Active",          cls: "success" },
  { key: "prospective",        label: "Prospective",     cls: "info" },
  { key: "attention",          label: "Needs attention", cls: "danger" },
  { key: "former",             label: "Former",          cls: "neutral" },
];

function EmptyRow({ text }: { text: string }) {
  return <div style={{ padding: "18px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>{text}</div>;
}

export default function ReportsPage() {
  // Cached via React Query (#34); failures render as an explicit error (#35).
  const reportQ = useReports();
  const report: ReportsDto | null = reportQ.data ?? null;
  const loading = reportQ.isPending;
  const [exporting, setExporting] = useState(false);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);

  const dash = (v: React.ReactNode) => (loading ? <Skeleton w={48} h={22} style={{ marginTop: 2 }} /> : v);

  const chartColumns = useMemo(
    () =>
      (report?.programs ?? []).map((p) => ({
        dotClass: p.slug,
        label: p.name,
        bars: [{ pct: p.attendancePct, day: "Attend." }],
      })),
    [report]
  );

  const staffItems = useMemo(
    () =>
      (report?.staffOnboarding ?? []).map((s) => ({
        nm: s.name,
        pct: s.pct,
        fill: s.pct === 100 ? "success" : s.pct >= 50 ? "warning" : "danger",
      })),
    [report]
  );

  /**
   * Builds the CSV in the browser and saves it. Returns how many data rows it wrote —
   * header and blank separator lines excluded — so the audit report below always carries
   * the count of the file that actually landed, rather than a number computed separately
   * and free to drift away from it.
   */
  function downloadCsv(rows: (string | number)[][], filename: string): number {
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return rows.slice(1).filter((r) => r.length > 0).length;
  }

  /**
   * Tells the backend what just left the building. These CSVs are assembled in the browser
   * from data the page already holds, so the server never sees the file — this call is the
   * only record of which export ran and how much was in it.
   *
   * TWO JUDGEMENT CALLS, both deliberate:
   *
   * Ordering — the file is saved first and reported afterwards. Reporting first and
   * refusing the download when the call fails would look stricter, but it protects nothing:
   * the rows are already in the browser (the server logged the GET that supplied them), so
   * blocking would withhold a file the user demonstrably already has. The export is not the
   * disclosure; the earlier fetch was.
   *
   * Failure — it must not fail silently. An audit log where "never happened" and "happened
   * but the report was dropped" look identical is worth much less than one that says which
   * it was, and nobody would think to check. So a failed report surfaces a banner naming the
   * unrecorded export; the reviewer can reconcile it against the server-side row for the
   * GET, which is the authoritative record either way. It stays non-blocking: the download
   * has already succeeded, and a modal cannot un-download it.
   */
  async function reportExport(
    exportKind: AuditExportKind,
    rowCount: number,
    fileName: string,
    scope: string
  ) {
    try {
      await auditApi.recordExport({ exportKind, rowCount, fileName, scope });
      setAuditWarning(null);
    } catch {
      // No error detail here on purpose — it adds nothing the admin can act on, and the
      // useful record is the one that did not get written.
      setAuditWarning(
        `“${fileName}” downloaded, but it could not be recorded in the audit log. The download itself was still logged server-side when the data was fetched.`
      );
    }
  }

  const stamp = () => new Date().toISOString().slice(0, 10);

  function exportSummary() {
    if (!report) return;
    const fileName = `shining-stars-summary-${stamp()}.csv`;
    const rowCount = downloadCsv(
      [
        ["Program", "Enrolled", "Attendance %", "Sessions"],
        ...report.programs.map((p) => [p.name, p.enrolled, p.attendancePct, p.sessions]),
        [],
        ["Total stars", report.totals.totalParticipants],
        ["Active", report.totals.activeParticipants],
        ["Prospective", report.totals.prospective],
        ["Needs attention", report.totals.attention],
        ["Former", report.totals.former],
        ["Avg attendance %", report.totals.avgAttendancePct],
        ["Marked present rate %", report.attendance.presentRatePct],
        ["Open tasks", report.totals.openTasks],
        ["Overdue tasks", report.totals.overdueTasks],
      ],
      fileName
    );
    void reportExport(
      "reports-summary",
      rowCount,
      fileName,
      `Program totals and org-wide counts (${report.programs.length} programs)`
    );
  }

  function exportStarAttendance() {
    if (!report) return;
    const fileName = `star-attendance-${stamp()}.csv`;
    const rowCount = downloadCsv(
      [
        ["Name", "Program", "Status", "Present", "Absent", "Present rate %"],
        ...report.starAttendance.map((s) => [s.name, s.programName, s.status, s.present, s.absent, s.presentRatePct]),
      ],
      fileName
    );
    void reportExport("star-attendance", rowCount, fileName, "Per-star attendance and absences, all stars");
  }

  async function exportRoster() {
    setExporting(true);
    try {
      const ps = await participantsApi.getAll();
      const fileName = `participant-roster-${stamp()}.csv`;
      const rowCount = downloadCsv(
        [
          ["Name", "Program", "Status", "Attendance %", "Start Date"],
          ...ps.map((p) => [p.fullName, p.programName, p.status, p.attendancePct, p.startDate]),
        ],
        fileName
      );
      await reportExport("participant-roster", rowCount, fileName, "Full roster, no filters applied");
    } catch {
      /* ignore — leave the page as-is */
    } finally {
      setExporting(false);
    }
  }

  const t = report?.totals;
  const att = report?.attendance;
  const maxStatus = t ? Math.max(t.activeParticipants, t.prospective, t.attention, t.former, 1) : 1;

  const th: React.CSSProperties = {
    textAlign: "left", padding: "8px 16px", fontSize: 11, fontWeight: 500,
    textTransform: "uppercase", letterSpacing: ".04em", color: "var(--fg-tertiary)", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = { padding: "10px 16px", fontSize: 13 };

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Reports</h1>
          <span className="date">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
        <div className="right">
          <button className="ss-btn" type="button" onClick={exportSummary} disabled={!report}>
            <Download className="ss-btn-icon" />
            Summary CSV
          </button>
          <button className="ss-btn" type="button" onClick={exportRoster} disabled={exporting}>
            <Download className="ss-btn-icon" />
            {exporting ? "Exporting…" : "Roster CSV"}
          </button>
        </div>
      </div>

      <div className="adm-content">
        {auditWarning && (
          <div className="ss-alert is-warning">
            <AlertTriangle />
            <span className="ss-alert-text">
              <strong>Export not recorded in the audit log</strong> — {auditWarning}
            </span>
            <button
              className="ss-alert-action"
              type="button"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
              onClick={() => setAuditWarning(null)}
            >
              Dismiss
            </button>
          </div>
        )}
        {reportQ.isError && (
          <LoadError
            title="Couldn't load reports"
            error={reportQ.error}
            onRetry={() => reportQ.refetch()}
          />
        )}
        {/* KPI grid */}
        <div className="adm-statgrid">
          <StatCard
            label="Active Stars"
            num={dash(t?.activeParticipants ?? 0)}
            delta={<><Users />{t?.totalParticipants ?? 0} total · {t?.programs ?? 0} programs</>}
            deltaClass="muted"
          />
          <StatCard
            label="Avg Attendance"
            num={dash(t ? `${t.avgAttendancePct}%` : "—")}
            delta={<><TrendingUp />across all stars</>}
            deltaClass="muted"
          />
          <StatCard
            label="Marked Present Rate"
            num={dash(att ? `${att.presentRatePct}%` : "—")}
            delta={<><CalendarCheck />{att?.present ?? 0} present · {att?.absent ?? 0} absent{att && (att.rescheduled + att.notScheduled) > 0 ? ` · ${att.rescheduled + att.notScheduled} not counted` : ""}</>}
            deltaClass="muted"
          />
          <StatCard
            label="Open Tasks"
            num={dash(t?.openTasks ?? 0)}
            delta={(t?.overdueTasks ?? 0) > 0 ? <><AlertTriangle />{t?.overdueTasks} overdue</> : <><Check /> on track</>}
            deltaClass={(t?.overdueTasks ?? 0) > 0 ? "warn" : "muted"}
            className={(t?.overdueTasks ?? 0) > 0 ? "is-warn" : undefined}
          />
        </div>

        {/* row 2: attendance-by-program + status breakdown */}
        <div className="adm-row2">
          <Widget id="att-prog-heading" title="Attendance by Program" icon={<BarChart3 className="ico ico--primary" />} bodyClass="widget-body--padded">
            {loading ? <SkeletonList rows={3} /> : chartColumns.length ? <BarChart columns={chartColumns} /> : <EmptyRow text="No programs yet" />}
          </Widget>

          <Widget id="status-heading" title="Stars by Status" icon={<GitBranch className="ico ico--primary" />} bodyClass="widget-body--padded">
            {loading || !t ? (
              <SkeletonList rows={3} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0" }}>
                {STATUS_ROWS.map((row) => {
                  const count = t[row.key];
                  return (
                    <div key={row.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                          <span className={`ss-dot`} style={{ background: `var(--${row.cls})` }} />
                          {row.label}
                        </span>
                        <span style={{ fontWeight: 500 }}>{count}</span>
                      </div>
                      <div className="ss-progress">
                        <div className={`ss-progress-fill ${row.cls}`} style={{ width: `${Math.round((count / maxStatus) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Widget>
        </div>

        {/* enrollment by program table */}
        <Widget id="enroll-heading" title="Enrollment by Program" icon={<Users className="ico ico--primary" />}>
          {loading ? (
            <SkeletonList rows={3} />
          ) : report && report.programs.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                    <th style={th}>Program</th>
                    <th style={{ ...th, textAlign: "center" }}>Enrolled</th>
                    <th style={{ ...th, textAlign: "center" }}>Sessions</th>
                    <th style={{ ...th, textAlign: "left", width: "40%" }}>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {report.programs.map((p) => (
                    <tr key={p.slug} style={{ borderBottom: "0.5px solid var(--border)" }}>
                      <td style={td}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span className={`ss-dot ${p.slug}`} />
                          {p.name}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>{p.enrolled}</td>
                      <td style={{ ...td, textAlign: "center", color: "var(--fg-secondary)" }}>{p.sessions}</td>
                      <td style={td}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="ss-progress" style={{ flex: 1 }}>
                            <span className={`ss-progress-fill ${p.slug}`} style={{ width: `${p.attendancePct}%` }} />
                          </span>
                          <span style={{ fontSize: 12, color: "var(--fg-secondary)", minWidth: 34, textAlign: "right" }}>{p.attendancePct}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyRow text="No programs yet" />
          )}
        </Widget>

        {/* per-star attendance incl. absences */}
        <Widget
          id="star-att-heading"
          title="Star Attendance & Absences"
          icon={<CalendarCheck className="ico ico--primary" />}
          action={
            <button className="ss-btn" type="button" onClick={exportStarAttendance} disabled={!report}>
              <Download className="ss-btn-icon" />CSV
            </button>
          }
        >
          {loading ? (
            <SkeletonList rows={4} />
          ) : report && report.starAttendance.length ? (
            <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                    <th style={th}>Star</th>
                    <th style={th}>Program</th>
                    <th style={{ ...th, textAlign: "center" }}>Present</th>
                    <th style={{ ...th, textAlign: "center" }}>Absent</th>
                    <th style={{ ...th, textAlign: "left", width: "32%" }}>Present rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.starAttendance.map((s) => (
                    <tr key={s.participantId} style={{ borderBottom: "0.5px solid var(--border)" }}>
                      <td style={td}>{s.name}</td>
                      <td style={td}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span className={`ss-dot ${s.programSlug}`} />
                          {s.programName}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "center", color: "var(--success-text)" }}>{s.present}</td>
                      <td style={{ ...td, textAlign: "center", color: s.absent > 0 ? "var(--danger)" : "var(--fg-secondary)", fontWeight: s.absent > 0 ? 500 : 400 }}>{s.absent}</td>
                      <td style={td}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="ss-progress" style={{ flex: 1 }}>
                            <span className={`ss-progress-fill ${s.programSlug}`} style={{ width: `${s.presentRatePct}%` }} />
                          </span>
                          <span style={{ fontSize: 12, color: "var(--fg-secondary)", minWidth: 34, textAlign: "right" }}>{s.presentRatePct}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyRow text="No attendance recorded yet" />
          )}
        </Widget>

        {/* staff onboarding */}
        <Widget id="onboard-heading" title="Staff Onboarding" icon={<GraduationCap className="ico ico--primary" />}>
          {loading ? (
            <SkeletonList rows={3} />
          ) : staffItems.length ? (
            <>
              <div style={{ padding: "6px 16px 2px", fontSize: 12, color: "var(--fg-tertiary)" }}>
                {report?.totals.fullyOnboardedStaff ?? 0} of {report?.totals.staff ?? 0} fully onboarded
              </div>
              <StaffList items={staffItems} />
            </>
          ) : (
            <EmptyRow text="No staff yet" />
          )}
        </Widget>
      </div>
    </div>
  );
}
