"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { parseLocalDate } from "@/lib/format";
import {
  Plus,
  TrendingUp,
  Users,
  AlertTriangle,
  AlertCircle,
  Calendar,
  GitBranch,
  CheckSquare,
  UserCheck,
  BarChart3,
  Check,
} from "lucide-react";
import AlertList from "../components/AlertList";
import PipelineList from "../components/PipelineList";
import TasksList from "../components/TasksList";
import StaffList from "../components/StaffList";
import Widget from "../components/Widget";
import StatCard from "../components/StatCard";
import { Skeleton, SkeletonList } from "../components/Skeleton";
import BarChart from "../components/BarChart";
import AddParticipantModal from "../components/AddParticipantModal";
import { useDashboard, queryKeys } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import { nextPathwaysReportDue } from "@/lib/pathwaysReports";
import { tasksApi } from "@/lib/api/tasks";
import LoadError from "@/app/components/LoadError";
import type {
  ParticipantSummaryDto,
  AttendanceRosterEntryDto,
  ProjectDto,
  StaffSummaryDto,
  ProgramSummaryDto,
  CalendarEventDto,
  ParticipantStatus,
} from "@/lib/types/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseDate = parseLocalDate;
const shortDate = (s: string) => parseDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const STATUS_BADGE: Record<ParticipantStatus, { type: string; text: string }> = {
  Active:      { type: "active",      text: "Active" },
  Prospective: { type: "prospective", text: "Prospective" },
  Attention:   { type: "attention",   text: "Needs attention" },
  Former:      { type: "info",        text: "Former" },
  AuthPending: { type: "prospective", text: "Auth pending" },
  Inquiry:     { type: "prospective", text: "Inquiry" },
  NotInterested: { type: "info",      text: "Not interested" },
};
const STATUS_ORDER: Record<ParticipantStatus, number> = { Attention: 0, AuthPending: 1, Prospective: 2, Inquiry: 3, Active: 4, Former: 5, NotInterested: 6 };

function EmptyRow({ text }: { text: string }) {
  return <div style={{ padding: "18px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>{text}</div>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Cached + deduplicated via React Query (#34); errors surface instead of
  // rendering as fake empty stats (#35).
  const dashboard = useDashboard();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const loading = dashboard.isPending;
  const [addOpen, setAddOpen] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const participants: ParticipantSummaryDto[] = dashboard.data?.participants ?? [];
  const roster: AttendanceRosterEntryDto[] = dashboard.data?.todayRoster ?? [];
  const projects: ProjectDto[] = dashboard.data?.projects ?? [];
  const staff: StaffSummaryDto[] = dashboard.data?.staff ?? [];
  const programs: ProgramSummaryDto[] = dashboard.data?.programs ?? [];
  const events: CalendarEventDto[] = dashboard.data?.events ?? [];

  const progSlugById = useMemo(
    () => Object.fromEntries(programs.map((p) => [p.id, p.slug])),
    [programs]
  );

  // ── Stats ────────────────────────────────────────────────────────────────────
  const activeCount = participants.filter((p) => p.status === "Active").length;
  const newThisMonth = useMemo(() => {
    const now = new Date();
    return participants.filter((p) => {
      const d = parseDate(p.startDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [participants]);

  const presentToday = roster.filter((r) => r.status === "Present").length;
  const rosterTotal = roster.length;
  const attPct = rosterTotal ? Math.round((presentToday / rosterTotal) * 100) : 0;

  const allTasks = useMemo(
    () => projects.flatMap((p) => p.tasks.map((t) => ({ t, project: p.title }))),
    [projects]
  );
  const openTasks = allTasks.filter((x) => x.t.taskStatus !== "Done");
  const overdueCount = allTasks.filter((x) => x.t.isOverdue || x.t.taskStatus === "Overdue").length;

  const docAlertParticipants = participants.filter((p) => p.hasDocAlerts);

  // ── Alerts ────────────────────────────────────────────────────────────────────
  const alertItems = useMemo(() => {
    type AlertSev = "danger" | "warning" | "info";
    // Dated alerts are built FIRST and document alerts collapse into a single summary row at
    // the end. Seeding the list with one row per Star missing paperwork used to fill all five
    // slots before the loop below ever ran, so an expired POS authorization — the alert with
    // billing and legal consequences, and the one the client asked for by name — silently
    // never appeared. A missing intake form is worth one line; a lapsed authorization is worth
    // the top of the list.
    const items: { severity: AlertSev; txt: string; sub: string; act: string; href: string }[] = [];

    // POS authorizations and IPPs expiring within a month (or already expired) — in-app notification.
    for (const p of participants) {
      if (items.length >= 5) break;
      for (const [iso, label] of [[p.authorizationExpiry, "POS authorization"], [p.ippExpiry, "IPP"]] as const) {
        if (!iso || items.length >= 5) continue;
        const days = Math.ceil((parseDate(iso).getTime() - Date.now()) / 86_400_000);
        if (days > 31) continue;
        items.push({
          severity: days < 0 ? "danger" : "warning",
          txt: days < 0
            ? `${p.fullName} — ${label} expired`
            : `${p.fullName} — ${label} expires in ${days} day${days === 1 ? "" : "s"}`,
          sub: `${p.programName} · renew ${label}`,
          act: "Review",
          href: `/students/${p.id}`,
        });
      }
    }

    // Staff training / paperwork renewals (TB, CPR, harassment training) within 60 days or
    // already lapsed. The API only fills these for admins.
    for (const st of staff) {
      if (items.length >= 6) break;
      for (const a of st.trainingAlerts ?? []) {
        if (items.length >= 6) break;
        items.push({
          severity: a.daysUntil < 0 ? "danger" : "warning",
          txt: a.daysUntil < 0
            ? `${st.fullName} — ${a.label} expired`
            : `${st.fullName} — ${a.label} renews in ${a.daysUntil} day${a.daysUntil === 1 ? "" : "s"}`,
          sub: `Staff onboarding · ${a.daysUntil < 0 ? "lapsed" : "due"} ${a.expiryDate}`,
          act: "Review",
          href: "/staff",
        });
      }
    }

    // Pathways 6/12-month reports coming due within a month.
    for (const p of participants) {
      if (items.length >= 6) break;
      if (p.status !== "Active" && p.status !== "Attention") continue;
      const due = nextPathwaysReportDue(p.startDate, p.programSlug);
      if (!due || due.daysUntil > 31) continue;
      items.push({
        severity: "warning",
        txt: `${p.fullName} — ${due.label} due in ${due.daysUntil} day${due.daysUntil === 1 ? "" : "s"}`,
        sub: `Pathways · due ${due.due}`,
        act: "Review",
        href: `/students/${p.id}`,
      });
    }

    const prospective = participants.filter((p) => p.status === "Prospective");
    if (prospective.length && items.length < 5) {
      items.push({
        severity: "info",
        txt: `${prospective.length} prospective star${prospective.length > 1 ? "s" : ""} awaiting follow-up`,
        sub: "Assign a coordinator",
        act: "Assign",
        href: "/students",
      });
    }

    const authPending = participants.filter((p) => p.status === "AuthPending");
    if (authPending.length && items.length < 6) {
      items.push({
        severity: "warning",
        txt: `${authPending.length} star${authPending.length > 1 ? "s" : ""} awaiting authorization`,
        sub: "Admin/instructor sign-off needed",
        act: "Review",
        href: "/students",
      });
    }

    // One row for all outstanding intake paperwork, not one per Star. Every imported Star
    // starts with this unset, so per-Star rows would bury everything else on day one.
    if (docAlertParticipants.length && items.length < 6) {
      items.push({
        severity: "warning",
        txt: `${docAlertParticipants.length} star${docAlertParticipants.length > 1 ? "s" : ""} missing intake documents`,
        sub: "Confirm intake paperwork on each star's profile",
        act: "Review",
        href: "/students",
      });
    }
    return items;
  }, [docAlertParticipants, participants, staff]);

  // ── Upcoming events ────────────────────────────────────────────────────────────
  const upcoming = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return events
      .filter((e) => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)
      .map((e) => {
        const d = parseDate(e.date);
        const slug = e.programId ? progSlugById[e.programId] : undefined;
        return {
          key: e.id,
          d: String(d.getDate()).padStart(2, "0"),
          month: d.toLocaleDateString("en-US", { month: "short" }),
          title: e.title,
          slug,
          meta: [e.programName, e.timeRange, e.location].filter(Boolean).join(" · "),
        };
      });
  }, [events, progSlugById]);

  // ── Pipeline ──────────────────────────────────────────────────────────────────
  const pipeline = useMemo(
    () =>
      participants
        .slice()
        .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
        .slice(0, 5)
        .map((p) => ({
          initials: p.initials,
          name: p.fullName,
          sub: p.programName,
          badge: STATUS_BADGE[p.status],
        })),
    [participants]
  );

  // ── Open tasks list ─────────────────────────────────────────────────────────────
  const taskItems = useMemo(
    () =>
      openTasks
        .slice()
        .sort((a, b) => (b.t.isOverdue ? 1 : 0) - (a.t.isOverdue ? 1 : 0))
        .slice(0, 4)
        .map((x) => ({
          id: x.t.id,
          nm: x.t.name,
          sub: x.project,
          due: x.t.isOverdue
            ? "Overdue"
            : x.t.dueDate
              ? `Due ${shortDate(x.t.dueDate)}`
              : x.t.taskStatus,
          overdue: x.t.isOverdue || x.t.taskStatus === "Overdue",
        })),
    [openTasks]
  );

  async function completeTask(taskId: string) {
    setCompletingId(taskId);
    setTaskError(null);
    try {
      await tasksApi.updateTask(taskId, { taskStatus: "Done" });
      // Task lists live in both caches — refetch them (#34).
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } catch {
      setTaskError("Couldn't mark the task done — try again.");
    } finally {
      setCompletingId(null);
    }
  }

  // ── Staff onboarding ─────────────────────────────────────────────────────────────
  const staffItems = useMemo(
    () =>
      staff
        .slice()
        .sort((a, b) => a.onboardingProgressPct - b.onboardingProgressPct)
        .slice(0, 5)
        .map((s) => ({
          nm: s.fullName,
          pct: s.onboardingProgressPct,
          fill: s.onboardingProgressPct === 100 ? "success" : s.onboardingProgressPct >= 50 ? "warning" : "danger",
        })),
    [staff]
  );

  // ── Attendance today by program (real data; replaces the mock weekly chart) ──────
  const chartColumns = useMemo(() => {
    const by = new Map<string, { name: string; present: number; total: number }>();
    roster.forEach((r) => {
      const cur = by.get(r.programSlug) ?? { name: r.programName, present: 0, total: 0 };
      cur.total += 1;
      if (r.status === "Present") cur.present += 1;
      by.set(r.programSlug, cur);
    });
    return Array.from(by.entries()).map(([slug, v]) => ({
      dotClass: slug,
      label: v.name,
      bars: [{ pct: v.total ? Math.round((v.present / v.total) * 100) : 0, day: "Today" }],
    }));
  }, [roster]);

  const dash = (v: React.ReactNode) => (loading ? <Skeleton w={48} h={22} style={{ marginTop: 2 }} /> : v);

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Dashboard</h1>
          <span className="date">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
        <div className="right">
          <div className="row tight flex items-center gap-1.5">
            {programs.map((p) => (
              <span className="ss-chip ss-chip--static" key={p.id}>
                <span className={`ss-dot ${p.slug}`} />
                {p.name}
              </span>
            ))}
          </div>
          {/* Adding a star is an admin task (client rule) — teachers don't get the button. */}
          {isAdmin && (
            <button className="ss-btn ss-btn-primary" type="button" onClick={() => setAddOpen(true)}>
              <Plus className="ss-btn-icon" />
              Add star
            </button>
          )}
        </div>
      </div>

      <div className="adm-content">
        {dashboard.isError && (
          <LoadError
            title="Couldn't load the dashboard"
            error={dashboard.error}
            onRetry={() => dashboard.refetch()}
          />
        )}
        {/* stat grid */}
        <div className="adm-statgrid">
          <StatCard
            label="Active Stars"
            num={dash(activeCount)}
            delta={newThisMonth > 0 ? <><TrendingUp /> +{newThisMonth} this month</> : <><Users /> {participants.length} total</>}
            deltaClass={newThisMonth > 0 ? "up" : "muted"}
          />
          <StatCard
            label="Attendance Today"
            num={dash(rosterTotal ? `${attPct}%` : "—")}
            delta={rosterTotal ? <><Users /> {presentToday} of {rosterTotal} present</> : <><Users /> No session today</>}
            deltaClass="muted"
          />
          <StatCard
            label="Open Tasks"
            num={dash(openTasks.length)}
            delta={overdueCount > 0 ? <><AlertTriangle />{overdueCount} overdue</> : <><Check /> On track</>}
            deltaClass={overdueCount > 0 ? "warn" : "muted"}
            className={overdueCount > 0 ? "is-warn" : undefined}
          />
          <StatCard
            label="Document Alerts"
            num={dash(docAlertParticipants.length)}
            delta={docAlertParticipants.length > 0 ? <><AlertCircle /> Need attention</> : <><Check /> All clear</>}
            deltaClass={docAlertParticipants.length > 0 ? "danger" : "muted"}
            className={docAlertParticipants.length > 0 ? "is-danger" : undefined}
          />
        </div>

        {/* row 2: alerts + events */}
        <div className="adm-row2">
          <Widget id="alerts-heading" title="Alerts" icon={<AlertTriangle className="ico ico--warning" />} linkText="View all" linkHref="/students">
            {loading ? <SkeletonList rows={3} /> : alertItems.length ? <AlertList items={alertItems} /> : <EmptyRow text="No open alerts" />}
          </Widget>

          <Widget id="events-heading" title="Upcoming Events" icon={<Calendar className="ico ico--primary" />} linkText="Calendar" linkHref="/calendar">
            {loading ? (
              <SkeletonList rows={3} />
            ) : upcoming.length ? (
              <div>
                {upcoming.map((e) => (
                  <div className="event-row" key={e.key}>
                    <div className="event-date">
                      <span className="d">{e.d}</span>
                      <span className="m">{e.month}</span>
                    </div>
                    <div className="body">
                      <div className="title">{e.title}</div>
                      <div className="meta">
                        {e.slug && <span className={`ss-dot ${e.slug}`} />}
                        {e.meta}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRow text="No upcoming events" />
            )}
          </Widget>
        </div>

        {/* row 3: pipeline + tasks + onboarding */}
        <div className="adm-row3">
          <Widget id="pipeline-heading" title="Star Pipeline" icon={<GitBranch className="ico ico--primary" />}>
            {loading ? <SkeletonList rows={3} /> : pipeline.length ? <PipelineList items={pipeline} /> : <EmptyRow text="No stars yet" />}
          </Widget>

          <Widget id="tasks-heading" title="Open Tasks" icon={<CheckSquare className="ico ico--primary" />} linkText="View all" linkHref="/tasks">
            {taskError && (
              <div style={{ padding: "6px 0", fontSize: 12, color: "var(--danger)" }}>{taskError}</div>
            )}
            {loading ? (
              <SkeletonList rows={3} />
            ) : taskItems.length ? (
              <TasksList items={taskItems} onComplete={completeTask} completingId={completingId} />
            ) : (
              <EmptyRow text="No open tasks" />
            )}
          </Widget>

          {/* Onboarding completion is admin-only (client rule). */}
          {isAdmin && (
            <Widget id="onboard-heading" title="Staff Onboarding" icon={<UserCheck className="ico ico--primary" />}>
              {loading ? <SkeletonList rows={3} /> : staffItems.length ? <StaffList items={staffItems} /> : <EmptyRow text="No staff yet" />}
            </Widget>
          )}
        </div>

        {/* attendance today by program */}
        <Widget id="attendance-heading" title="Attendance Today by Program" icon={<BarChart3 className="ico ico--primary" />} bodyClass="widget-body--padded">
          {loading ? (
            <SkeletonList rows={3} />
          ) : chartColumns.length ? (
            <BarChart columns={chartColumns} />
          ) : (
            <EmptyRow text="No attendance recorded today" />
          )}
        </Widget>
      </div>

      {addOpen && <AddParticipantModal programs={programs} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
