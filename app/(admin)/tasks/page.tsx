"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { parseLocalDate } from "@/lib/format";
import { staffRoleAvatarClass } from "@/lib/staffRoles";
import {
  FolderPlus,
  Plus,
  AlertCircle,
  Drama,
  UserPlus,
  Shield,
  Calendar,
  ChevronDown,
  Check,
  type LucideIcon,
} from "lucide-react";
import { tasksApi } from "@/lib/api/tasks";
import { useProjects, useStaff, queryKeys } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import LoadError from "@/app/components/LoadError";
import { ApiError } from "@/lib/api/client";
import type {
  ProjectDto,
  ProjectTaskDto,
  StaffSummaryDto,
  ProjectType,
} from "@/lib/types/api";

import {
  AddTaskModal,
  EMPTY_TASK_FORM,
  NewProjectModal,
  EMPTY_PROJECT_FORM,
  type AddTaskForm,
  type NewProjectForm,
  type Task,
  type Project,
  type TaskStatus,
  type Prio,
  TAG,
} from "./_modal";

// ── Mapping helpers ───────────────────────────────────────────────────────────

const TYPE_ICON: Record<ProjectType, LucideIcon> = {
  Production: Drama,
  Staff: UserPlus,
  Admin: Shield,
  Event: Calendar,
};

const TYPE_CLS: Record<ProjectType, string> = {
  Production: "amber",
  Staff:      "gray",
  Admin:      "blue",
  Event:      "teal",
};

const TYPE_BARCLS: Record<ProjectType, string> = {
  Production: "productions",
  Staff:      "",
  Admin:      "danger",
  Event:      "pathways",
};

const STATUS_LABEL: Record<string, string> = {
  inprogress: "In progress",
  planning:   "Planning",
  blocked:    "Blocked",
  done:       "Done",
};

const TASK_STATUS_MAP: Record<string, TaskStatus> = {
  Upcoming:   "upcoming",
  InProgress: "inprogress",
  Done:       "done",
  Overdue:    "overdue",
  Blocked:    "blocked",
};

const PRIO_MAP: Record<string, Prio> = {
  High:   "high",
  Medium: "med",
  Low:    "low",
};

const PRIO_API_MAP: Record<Prio, string> = {
  high: "High",
  med:  "Medium",
  low:  "Low",
};

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dtoToTask(dto: ProjectTaskDto, staffList: StaffSummaryDto[]): Task {
  const staff = staffList.find((s) => s.id === dto.assignedToId);
  const arole = staff ? staffRoleAvatarClass(staff.role) : "admin";
  return {
    id: dto.id,
    name: dto.name,
    ctx: dto.context ?? undefined,
    assignedToId: dto.assignedToId,
    ai: dto.assignedToInitials ?? "?",
    ar: arole,
    an: dto.assignedToName ?? "Unassigned",
    due: formatDueDate(dto.dueDate),
    status: TASK_STATUS_MAP[dto.taskStatus] ?? "upcoming",
    overdue: dto.isOverdue,
    prio: PRIO_MAP[dto.priority] ?? "med",
  };
}

function dtoToProject(dto: ProjectDto, staffList: StaffSummaryDto[]): Project {
  const tasks = dto.tasks.map((t) => dtoToTask(t, staffList));
  const done = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter((t) => t.overdue || t.status === "overdue").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const alertParts: string[] = [];
  if (overdue > 0) alertParts.push(`${overdue} overdue`);
  if (blocked > 0) alertParts.push(`${blocked} blocked`);

  return {
    id: dto.id,
    collapsed: true,
    icon: TYPE_ICON[dto.type] ?? Drama,
    iconcls: TYPE_CLS[dto.type] ?? "amber",
    title: dto.title,
    type: [dto.type.toLowerCase(), dto.type],
    status: [dto.status, STATUS_LABEL[dto.status] ?? dto.status],
    scope: dto.scope ?? "All programs",
    frac: `${done} / ${tasks.length} done`,
    pct: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
    barcls: TYPE_BARCLS[dto.type] ?? "",
    alert: alertParts.join(" · "),
    due: formatDueDate(dto.dueDate),
    tasks,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  // Cached + shared via React Query (#34).
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const projectsQ = useProjects();
  const staffQ = useStaff();
  const staffList: StaffSummaryDto[] = staffQ.data ?? [];
  const projects = useMemo(
    () => (projectsQ.data ?? []).map((p) => dtoToProject(p, staffQ.data ?? [])),
    [projectsQ.data, staffQ.data]
  );
  const loading = projectsQ.isPending || staffQ.isPending;
  // Keyed by project id; projects start collapsed.
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
  const [doneTasks, setDoneTasks] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AddTaskForm>(EMPTY_TASK_FORM);
  const [projModalOpen, setProjModalOpen] = useState(false);
  const [projForm, setProjForm] = useState<NewProjectForm>(EMPTY_PROJECT_FORM);
  const [view, setView] = useState<"project" | "my" | "all">("project");
  const [typeFilter, setTypeFilter] = useState<"all" | "production" | "staff" | "admin" | "event">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // derived stats
  const allTasks = projects.flatMap((p) => p.tasks);
  const stats = {
    projects: projects.length,
    total:    allTasks.length,
    done:     allTasks.filter((t) => t.status === "done").length,
    overdue:  allTasks.filter((t) => t.overdue || t.status === "overdue").length,
    blocked:  allTasks.filter((t) => t.status === "blocked").length,
  };

  // "My tasks" matches on the staff member linked to the signed-in account;
  // fall back to a name match when the link isn't set.
  const myStaffId =
    user?.staffMemberId ??
    staffList.find((s) => s.fullName === user?.fullName)?.id ??
    null;

  const isCollapsed = (id: string) => collapsedMap[id] ?? true;
  const toggleProject = (id: string) =>
    setCollapsedMap((prev) => ({ ...prev, [id]: !isCollapsed(id) }));

  // Checking a task off persists to the API. doneTasks holds only the optimistic
  // override while the save is in flight; once the refetch lands, server state wins.
  async function toggleTask(t: Task) {
    const nowDone = !(doneTasks[t.id] ?? t.status === "done");
    setDoneTasks((prev) => ({ ...prev, [t.id]: nowDone }));
    const clearOverride = () =>
      setDoneTasks((prev) => {
        const rest = { ...prev };
        delete rest[t.id];
        return rest;
      });
    try {
      await tasksApi.updateTask(t.id, { taskStatus: nowDone ? "Done" : "Upcoming" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      clearOverride();
    } catch (e) {
      clearOverride();
      setSaveError(e instanceof ApiError && e.detail ? e.detail : "Couldn't update the task — try again.");
    }
  }

  function openModal(targetProjectIdx: number | null = null) {
    setForm({ ...EMPTY_TASK_FORM, projectIdx: targetProjectIdx });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); }

  function openProjModal() {
    setProjForm(EMPTY_PROJECT_FORM);
    setProjModalOpen(true);
  }

  async function handleProjectSubmit() {
    setProjModalOpen(false);
    try {
      await tasksApi.createProject({
        title: projForm.title.trim(),
        type: projForm.type,
        status: projForm.status,
        scope: projForm.scope.trim() || undefined,
        dueDate: projForm.due || undefined,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } catch (e) {
      setSaveError(e instanceof ApiError && e.detail ? e.detail : "Couldn't create the project — try again.");
    }
  }

  async function handleSubmit() {
    if (form.projectIdx === null) return;
    const proj = projects[form.projectIdx];
    setCollapsedMap((prev) => ({ ...prev, [proj.id]: false }));
    closeModal();

    try {
      await tasksApi.addTask(proj.id, {
        projectId: proj.id,
        name: form.name.trim(),
        context: form.ctx.trim() || undefined,
        assignedToId: form.assigneeId || undefined,
        priority: PRIO_API_MAP[form.prio] as "High" | "Medium" | "Low",
        dueDate: form.due || undefined,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } catch (e) {
      // A failed save must not silently look successful (#35).
      setSaveError(e instanceof ApiError && e.detail ? e.detail : "Couldn't save the task — try again.");
    }
  }

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Tasks &amp; Projects</h1>
        </div>
        <div className="right">
          <div className="seg">
            <button className={view === "project" ? "is-active" : ""} onClick={() => setView("project")}>By project</button>
            <button className={view === "my" ? "is-active" : ""} onClick={() => setView("my")}>My tasks</button>
            <button className={view === "all" ? "is-active" : ""} onClick={() => setView("all")}>All tasks</button>
          </div>
          <button className="ss-btn" type="button" onClick={openProjModal}>
            <FolderPlus className="ss-btn-icon" />New project
          </button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={() => openModal(null)}>
            <Plus className="ss-btn-icon" />New task
          </button>
        </div>
      </div>

      <div className="adm-content">
        <div className="row tight" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {([ ["all", "All projects"], ["production", "Productions"], ["staff", "Staff tasks"], ["admin", "Admin"] ] as [typeof typeFilter, string][]).map(([val, label]) => (
            <span
              key={val}
              className={`ss-chip${typeFilter === val ? " is-active" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setTypeFilter(val)}
            >
              {label}
            </span>
          ))}
          <span style={{ width: 1, height: 22, background: "var(--border-strong)", margin: "0 4px" }} />
          <span
            className={`ss-chip${assigneeFilter === "all" ? " is-active" : ""}`}
            style={{ cursor: "pointer" }}
            onClick={() => setAssigneeFilter("all")}
          >
            All assignees
          </span>
          {staffList.slice(0, 3).map((s) => (
            <span
              key={s.id}
              className={`ss-chip${assigneeFilter === s.id ? " is-active" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setAssigneeFilter(assigneeFilter === s.id ? "all" : s.id)}
            >
              <span className={`ss-avatar ${staffRoleAvatarClass(s.role)} sm`} style={{ width: 18, height: 18, fontSize: 9 }}>{s.initials}</span>
              {s.fullName}
            </span>
          ))}
          <span style={{ width: 1, height: 22, background: "var(--border-strong)", margin: "0 4px" }} />
          <span
            className="ss-chip"
            style={{
              background: overdueOnly ? "var(--danger-text)" : "var(--danger-fill)",
              color: overdueOnly ? "var(--surface)" : "var(--danger-text)",
              borderColor: "var(--danger-border)",
              cursor: "pointer",
            }}
            onClick={() => setOverdueOnly((v) => !v)}
          >
            <AlertCircle style={{ width: 12, height: 12 }} />Overdue
          </span>
        </div>

        <div className="board-stats">
          <div className="board-stat"><span className="num">{stats.projects}</span><span className="label">Projects</span></div>
          <div className="board-stat"><span className="num">{stats.total}</span><span className="label">Total Tasks</span></div>
          <div className="board-stat"><span className="num green">{stats.done}</span><span className="label">Done</span></div>
          <div className="board-stat"><span className="num red">{stats.overdue}</span><span className="label">Overdue</span></div>
          <div className="board-stat"><span className="num amber">{stats.blocked}</span><span className="label">Blocked</span></div>
        </div>

        {saveError && (
          <div
            role="alert"
            style={{
              marginBottom: "var(--space-3)", padding: "10px 14px", borderRadius: "var(--r-md)",
              background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 13,
            }}
          >
            {saveError}
          </div>
        )}
        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            Loading projects…
          </div>
        ) : projectsQ.isError ? (
          <LoadError
            title="Couldn't load projects"
            error={projectsQ.error}
            onRetry={() => projectsQ.refetch()}
          />
        ) : projects.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            No projects yet — create one to get started.
          </div>
        ) : view !== "project" ? (() => {
          if (view === "my" && !myStaffId) return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
              Your account isn&apos;t linked to a staff member, so there are no tasks assigned to you.
            </div>
          );

          const flat = projects
            .flatMap((p) => p.tasks.map((t) => ({ p, t })))
            .filter(({ p, t }) => {
              if (view === "my" && t.assignedToId !== myStaffId) return false;
              if (typeFilter !== "all" && p.type[0] !== typeFilter) return false;
              if (assigneeFilter !== "all" && t.assignedToId !== assigneeFilter) return false;
              if (overdueOnly && !(t.overdue || t.status === "overdue")) return false;
              return true;
            });

          if (flat.length === 0) return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
              {view === "my" ? "No tasks assigned to you match the current filters." : "No tasks match the current filters."}
            </div>
          );

          return (
            <div className="proj">
              <table className="tbl">
                <tbody>
                  {flat.map(({ p, t }) => {
                    const isDone = doneTasks[t.id] ?? t.status === "done";
                    const Tag = TAG[t.status].icon;
                    return (
                      <tr key={t.id} className={isDone ? "task-row-done" : ""}>
                        <td style={{ width: 34 }}>
                          <span className={`ss-checkbox${isDone ? " is-checked" : ""}`} onClick={(e) => { e.stopPropagation(); toggleTask(t); }}>
                            <Check />
                          </span>
                        </td>
                        <td>
                          <div className="task-name">
                            <span className="tn">{t.name}</span>
                            <span className="tc">{p.title}{t.ctx ? ` · ${t.ctx}` : ""}</span>
                          </div>
                        </td>
                        {view === "all" && (
                          <td>
                            <span className="assignee">
                              <span className={`ss-avatar ${t.ar} sm`}>{t.ai}</span>
                              <span>{t.an}</span>
                            </span>
                          </td>
                        )}
                        <td className={`td-due ${t.overdue ? "overdue" : ""}`}>{t.due}</td>
                        <td>
                          <span className={`tag ${t.status}`}>
                            <Tag />
                            {TAG[t.status].label}
                          </span>
                        </td>
                        <td style={{ width: 40, textAlign: "center" }}>
                          <span className={`prio ${t.prio}`} title={`${t.prio} priority`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })() : (() => {
          const filteredItems = projects
            .map((p, idx) => ({ p, idx }))
            .filter(({ p }) => {
              if (typeFilter !== "all" && p.type[0] !== typeFilter) return false;
              if (assigneeFilter !== "all" && !p.tasks.some((t) => t.assignedToId === assigneeFilter)) return false;
              if (overdueOnly && !p.tasks.some((t) => t.overdue || t.status === "overdue")) return false;
              return true;
            });

          if (filteredItems.length === 0) return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
              No projects match the current filters.
            </div>
          );

          return filteredItems.map(({ p, idx }) => {
          const ProjIcon = p.icon;
          return (
            <div className={`proj${isCollapsed(p.id) ? " is-collapsed" : ""}`} key={p.id}>
              <div className="proj-head" onClick={() => toggleProject(p.id)}>
                <span className="proj-chev"><ChevronDown /></span>
                <span className={`proj-icon ${p.iconcls}`}><ProjIcon /></span>
                <div className="proj-titlewrap">
                  <div className="proj-titlerow">
                    <span className="proj-title">{p.title}</span>
                    <span className={`tbadge ${p.type[0]}`}>{p.type[1]}</span>
                    <span className={`sbadge ${p.status[0]}`}>{p.status[1]}</span>
                  </div>
                  <div className="proj-sub">
                    <span>{p.scope}</span>
                    {p.alert ? (
                      <><span className="sep">·</span><span className="alert-txt">{p.alert}</span></>
                    ) : null}
                  </div>
                </div>
                <div className="proj-progress">
                  <div className="pp-frac">{p.frac}</div>
                  <div className="ss-progress">
                    <div className={`ss-progress-fill ${p.barcls}`} style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
                <div className="proj-due">{p.due}</div>
              </div>
              <div className="proj-body">
                {p.tasks.length > 0 && (
                  <table className="tbl">
                    <tbody>
                      {p.tasks.map((t) => {
                        const isDone = doneTasks[t.id] ?? t.status === "done";
                        const Tag = TAG[t.status].icon;
                        return (
                          <tr key={t.id} className={isDone ? "task-row-done" : ""}>
                            <td style={{ width: 34 }}>
                              <span className={`ss-checkbox${isDone ? " is-checked" : ""}`} onClick={(e) => { e.stopPropagation(); toggleTask(t); }}>
                                <Check />
                              </span>
                            </td>
                            <td>
                              <div className="task-name">
                                <span className="tn">{t.name}</span>
                                {t.ctx ? <span className="tc">{t.ctx}</span> : null}
                              </div>
                            </td>
                            <td>
                              <span className="assignee">
                                <span className={`ss-avatar ${t.ar} sm`}>{t.ai}</span>
                                <span>{t.an}</span>
                              </span>
                            </td>
                            <td className={`td-due ${t.overdue ? "overdue" : ""}`}>{t.due}</td>
                            <td>
                              <span className={`tag ${t.status}`}>
                                <Tag />
                                {TAG[t.status].label}
                              </span>
                            </td>
                            <td style={{ width: 40, textAlign: "center" }}>
                              <span className={`prio ${t.prio}`} title={`${t.prio} priority`} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div className="add-task" role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); openModal(idx); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openModal(idx); }}>
                  <Plus />Add task to {p.title}
                </div>
              </div>
            </div>
          );
        });})()}

        {view === "project" && (
          <button className="create-proj" type="button" onClick={openProjModal}>
            <FolderPlus />Create new project
          </button>
        )}
      </div>

      {modalOpen && (
        <AddTaskModal form={form} setForm={setForm} projects={projects} staffList={staffList} onClose={closeModal} onSubmit={handleSubmit} />
      )}
      {projModalOpen && (
        <NewProjectModal form={projForm} setForm={setProjForm} onClose={() => setProjModalOpen(false)} onSubmit={handleProjectSubmit} />
      )}
    </div>
  );
}

