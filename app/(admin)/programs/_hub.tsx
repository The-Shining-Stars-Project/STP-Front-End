"use client";

import { useState } from "react";
import { parseLocalDate } from "@/lib/format";
import Link from "next/link";
import {
  Users, CalendarCheck, AlertCircle, AlertTriangle,
  Minus, Check, Clock, X,
  UserCheck, CheckCircle2, UserPlus, UserMinus,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { programsApi } from "@/lib/api/programs";
import { useStaff, queryKeys } from "@/lib/api/hooks";
import EnrollStudentModal from "../components/EnrollStudentModal";
import type { ProgramDetailDto, StaffSummaryDto } from "@/lib/types/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProgramSlug = string;

// ── Manage staff modal ────────────────────────────────────────────────────────

function ManageStaffModal({
  programId,
  programName,
  slug,
  assignedIds,
  onClose,
}: {
  programId: string;
  programName: string;
  slug: string;
  assignedIds: Set<string>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const staffQ = useStaff();
  const allStaff: StaffSummaryDto[] = staffQ.data ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(s: StaffSummaryDto) {
    const isAssigned = assignedIds.has(s.id);
    setBusyId(s.id);
    setError(null);
    try {
      if (isAssigned) await programsApi.unassignStaff(programId, s.id);
      else await programsApi.assignStaff(programId, s.id);
      // Assignments feed the program detail and per-teacher program scoping (#34).
      await queryClient.invalidateQueries({ queryKey: ["program-detail", slug] });
      queryClient.invalidateQueries({ queryKey: queryKeys.myPrograms });
    } catch {
      setError(`Couldn't ${isAssigned ? "remove" : "add"} ${s.fullName} — try again.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
    >
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(440px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "80vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Manage staff</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>Add or remove staff for {programName}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-2) var(--space-4)", overflowY: "auto" }}>
          {staffQ.isPending ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>Loading staff…</div>
          ) : allStaff.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>
              No staff yet — add staff members on the Staff page first.
            </div>
          ) : allStaff.map((s) => {
            const isAssigned = assignedIds.has(s.id);
            const busy = busyId === s.id;
            return (
              <div className="list-row" key={s.id}>
                <span className={`ss-avatar ${s.role.toLowerCase()} sm`}>{s.initials}</span>
                <div className="grow">
                  <div className="nm">{s.fullName}</div>
                  <div className="sub">{s.role}</div>
                </div>
                <button
                  className={`ss-btn${isAssigned ? "" : " ss-btn-primary"}`}
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(s)}
                  style={{ minWidth: 96, justifyContent: "center" }}
                >
                  {busy ? (
                    "Saving…"
                  ) : isAssigned ? (
                    <><UserMinus className="ss-btn-icon" />Remove</>
                  ) : (
                    <><UserPlus className="ss-btn-icon" />Add</>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ margin: "0 var(--space-4) var(--space-3)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}
        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProgramHub({ slug }: { slug: ProgramSlug }) {
  // Cached per-slug via React Query (#34); revisiting a program is instant.
  const detailQ = useQuery({
    queryKey: ["program-detail", slug],
    queryFn: () => programsApi.getDetail(slug),
  });
  const detail: ProgramDetailDto | null = detailQ.data ?? null;
  const loading = detailQ.isPending;
  const [addOpen, setAddOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);

  const colorVar  = `var(--${slug})`;

  const label       = detail?.name         ?? slug.toUpperCase();
  const enrolled    = detail?.enrolledCount ?? 0;
  const attPct      = detail?.attendancePct ?? null;
  const alertCount  = detail?.alerts?.length ?? 0;
  const participants = detail?.participants ?? [];
  const events      = detail?.upcomingEvents ?? [];
  const staff       = detail?.staff ?? [];
  const alerts      = detail?.alerts ?? [];
  const assignedIds = new Set(staff.map((s) => s.id));

  // derive "next session" label from the nearest upcoming event or sessions
  const nextSessionLabel = "—";
  const nextSessionMeta  = detail?.defaultLocation ?? "";

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>
            <span className={`ss-dot ${slug}`} style={{ marginRight: 8 }} />
            {label}
          </h1>
          <span className="date">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
        <div className="right">
          <button className="ss-btn ss-btn-primary" type="button" disabled={!detail} onClick={() => setAddOpen(true)}>
            <UserPlus className="ss-btn-icon" />
            Enroll star
          </button>
        </div>
      </div>

      <div className="adm-content">
        {/* stat strip */}
        <div className="adm-statgrid">
          <div className="adm-stat">
            <span className="label">Enrolled</span>
            <span className="num">{enrolled}</span>
            <span className="delta muted">
              <Minus />{detail ? "Current enrollment" : "No data yet"}
            </span>
          </div>
          <div className="adm-stat">
            <span className="label">Avg Attendance</span>
            <span className="num">{attPct !== null ? `${attPct}%` : "—"}</span>
            <span className="delta muted">
              <CalendarCheck />{detail?.sessionSchedule ?? "—"}
            </span>
          </div>
          <div className={`adm-stat${alertCount > 0 ? " is-danger" : ""}`}>
            <span className="label">Open Alerts</span>
            <span className="num">{alertCount}</span>
            <span className={`delta ${alertCount > 0 ? "danger" : "muted"}`}>
              {alertCount > 0 ? <AlertCircle /> : <Check />}
              {alertCount > 0 ? "Action required" : "All clear"}
            </span>
          </div>
          <div className="adm-stat">
            <span className="label">Next Session</span>
            <span className="num" style={{ fontSize: "var(--fs-h2)" }}>{nextSessionLabel}</span>
            <span className="delta muted">
              <Clock />{nextSessionMeta}
            </span>
          </div>
        </div>

        {/* row 2: stars + this week */}
        <div className="adm-row2">
          <div className="widget">
            <div className="widget-head">
              <Users className="ico" style={{ color: colorVar }} />
              <h3>Stars</h3>
              <Link className="link" href="/students">View all</Link>
            </div>
            <div className="widget-body">
              {participants.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>
                  No participants yet
                </div>
              ) : participants.map((p) => (
                <div className="list-row" key={p.id}>
                  <span className="ss-avatar sm" style={{ background: `var(--${slug}-fill)`, color: `var(--${slug})`, border: `0.5px solid var(--${slug}-border)` }}>
                    {p.initials}
                  </span>
                  <div className="grow">
                    <Link href={`/students/${p.id}`} className="nm" style={{ color: "inherit", textDecoration: "none", display: "block" }}>
                      {p.fullName}
                    </Link>
                    {p.hasDocAlerts ? (
                      <div style={{ fontSize: 11, color: "var(--danger)", display: "flex", alignItems: "center", gap: 3 }}>
                        <AlertCircle style={{ width: 11, height: 11 }} />Document alert
                      </div>
                    ) : (
                      <div className="sub">{p.status}</div>
                    )}
                  </div>
                  <span className={`ss-badge ${p.status === "Active" ? "is-active" : p.status === "Attention" ? "is-attention" : ""}`}>
                    {p.status === "Active" ? <><CheckCircle2 />Active</> : p.status === "Attention" ? <><AlertTriangle />Attention</> : <><Clock />Prospective</>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="widget">
            <div className="widget-head">
              <CalendarCheck className="ico" style={{ color: colorVar }} />
              <h3>This Week</h3>
              <Link className="link" href="/calendar">Calendar</Link>
            </div>
            <div className="widget-body">
              {events.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>
                  No upcoming events
                </div>
              ) : (
                <>
                  {events.slice(0, 3).map((e) => {
                    const d = parseLocalDate(e.date);
                    return (
                      <div className="event-row" key={e.id}>
                        <div className="event-date">
                          <span className="d">{String(d.getDate()).padStart(2, "0")}</span>
                          <span className="m">{d.toLocaleDateString("en-US", { month: "short" })}</span>
                        </div>
                        <div className="body">
                          <div className="title">{e.title}</div>
                          <div className="meta">
                            <span className={`ss-dot ${slug}`} />{e.meta ?? e.location}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {events.length > 3 && (
                    <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "0.5px solid var(--border)" }}>
                      <div className="ss-label" style={{ marginBottom: 8 }}>More upcoming</div>
                      {events.slice(3).map((e) => {
                        const d = parseLocalDate(e.date);
                        const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                        return (
                          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "6px 0", borderBottom: "0.5px solid var(--border)" }}>
                            <div>
                              <div style={{ fontSize: 13, color: "var(--fg)" }}>{e.title}</div>
                              <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>{e.meta}</div>
                            </div>
                            <span style={{ fontSize: 12, color: "var(--fg-secondary)", whiteSpace: "nowrap", marginLeft: 12 }}>{date}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* row 3: alerts + staff */}
        <div className="adm-row2">
          <div className="widget">
            <div className="widget-head">
              <AlertTriangle className="ico" style={{ color: "var(--warning)" }} />
              <h3>Alerts</h3>
            </div>
            <div className="widget-body">
              {alerts.length > 0 ? alerts.map((a, i) => (
                <div className="alert-row" key={i}>
                  <AlertCircle style={{ color: "var(--danger)", width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
                  <div className="body">
                    <div className="txt">{a.message}</div>
                    <div className="sub">{a.severity}</div>
                  </div>
                  <Link className="act" href={a.participantId ? `/students/${a.participantId}` : "/students"}>Review</Link>
                </div>
              )) : (
                <div style={{ padding: "20px 0", textAlign: "center" }}>
                  <CheckCircle2 style={{ width: 20, height: 20, color: "var(--success)", margin: "0 auto 8px", display: "block" }} />
                  <div style={{ fontSize: 13, color: "var(--fg-secondary)" }}>No open alerts</div>
                </div>
              )}
            </div>
          </div>

          <div className="widget">
            <div className="widget-head">
              <UserCheck className="ico" style={{ color: "var(--primary)" }} />
              <h3>Staff</h3>
              <button
                className="ss-btn"
                type="button"
                disabled={!detail}
                onClick={() => setStaffOpen(true)}
                style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 12 }}
              >
                <UserPlus className="ss-btn-icon" />
                Add / remove
              </button>
            </div>
            <div className="widget-body">
              {staff.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>
                  No staff assigned
                </div>
              ) : staff.map((s) => (
                <div className="list-row" key={s.id}>
                  <span className={`ss-avatar ${s.role.toLowerCase()} sm`}>{s.initials}</span>
                  <div className="grow">
                    <Link
                      href={`/staff?expand=${encodeURIComponent(s.fullName)}`}
                      className="nm"
                      style={{ color: "inherit", textDecoration: "none", display: "block" }}
                    >
                      {s.fullName}
                    </Link>
                    <div className="sub">{s.role}</div>
                  </div>
                  <span className="ss-badge is-active"><Check />Active</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {!loading && !detail && (
          <div className="ss-alert" style={{ marginTop: "var(--space-4)" }}>
            <AlertCircle />
            <span className="ss-alert-text">
              Could not load live data — make sure the backend is running on port 5208.
            </span>
          </div>
        )}
      </div>

      {addOpen && detail && (
        <EnrollStudentModal
          programId={detail.id}
          programName={detail.name}
          slug={slug}
          onClose={() => setAddOpen(false)}
        />
      )}

      {staffOpen && detail && (
        <ManageStaffModal
          programId={detail.id}
          programName={detail.name}
          slug={slug}
          assignedIds={assignedIds}
          onClose={() => setStaffOpen(false)}
        />
      )}
    </div>
  );
}
