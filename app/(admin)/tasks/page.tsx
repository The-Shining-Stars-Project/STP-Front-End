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
  Pencil,
  Hand,
  ShoppingBag,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import CompletionsReport from "./_completions";
import { repeatFromDto, repeatSummary, repeatToDto } from "@/lib/repeat";
import { tasksApi } from "@/lib/api/tasks";
import { useProjects, useStaff, queryKeys } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import LoadError from "@/app/components/LoadError";
import { describeApiError } from "@/lib/api/client";
import type {
  ProjectDto,
  ProjectTaskDto,
  StaffSummaryDto,
  ProjectType,
  TaskStatus as ApiTaskStatus,
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
  TASK_ROLES,
  roleLabel,
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
  Draft:      "draft",
};

/** Open (default) hides finished work — tasks marked Done and projects marked done. */
type StatusView = "open" | "done" | "all";

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

// Form chip → API value. On create only Upcoming / InProgress / Blocked / Draft are accepted
// (anything else is a 400); Done is reachable through edit.
const STATUS_API_MAP: Record<AddTaskForm["status"], ApiTaskStatus> = {
  upcoming:   "Upcoming",
  inprogress: "InProgress",
  blocked:    "Blocked",
  draft:      "Draft",
  done:       "Done",
};

/** Task status → the edit form's chip. Overdue is derived, so it edits as Upcoming. */
function formStatusOf(status: TaskStatus): AddTaskForm["status"] {
  return status === "overdue" ? "upcoming" : status;
}

/**
 * Deep links from the Calendar and Annual Planning (Oct 2026): /tasks?edit=<taskId> opens that
 * task's editor once the list has loaded; /tasks?add=<yyyy-mm-dd> opens Add task with that due
 * date. Admin pages render client-side only (AuthGuard), so reading the URL in an initializer
 * is safe. The param is read once; the URL isn't rewritten, so a refresh re-opens the same thing.
 */
function readDeepLink(): { edit: string | null; add: string | null } {
  try {
    const q = new URLSearchParams(window.location.search);
    const add = q.get("add");
    return { edit: q.get("edit"), add: add && /^\d{4}-\d{2}-\d{2}$/.test(add) ? add : null };
  } catch {
    return { edit: null, add: null };
  }
}

/** Assignee filter values besides a staff id. */
const ALL_ASSIGNEES = "all";
const UNASSIGNED = "unassigned";

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
    projectId: dto.projectId,
    role: dto.role,
    completedBy: dto.completedByName,
    // completedAt is org-local "yyyy-MM-ddTHH:mm"; only the date is shown.
    completedOn: dto.completedAt ? formatDueDate(dto.completedAt.slice(0, 10)) : null,
    completionEstimated: dto.completionEstimated,
    repeat: repeatFromDto(dto),
    name: dto.name,
    ctx: dto.context ?? undefined,
    assignedToId: dto.assignedToId,
    ai: dto.assignedToInitials ?? "?",
    ar: arole,
    an: dto.assignedToName ?? "Unassigned",
    due: formatDueDate(dto.dueDate),
    dueIso: dto.dueDate,
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
    typeRaw: dto.type,
    status: [dto.status, STATUS_LABEL[dto.status] ?? dto.status],
    scope: dto.scope ?? "All programs",
    scopeRaw: dto.scope ?? "",
    frac: `${done} / ${tasks.length} done`,
    pct: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
    barcls: TYPE_BARCLS[dto.type] ?? "",
    alert: alertParts.join(" · "),
    due: formatDueDate(dto.dueDate),
    dueIso: dto.dueDate,
    tasks,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  // Cached + shared via React Query (#34).
  const queryClient = useQueryClient();
  // canManage mirrors the API's ManagementWrite policy, which POST /api/projects requires.
  const { user, canManage } = useAuth();
  const projectsQ = useProjects();
  const staffQ = useStaff();
  const staffList: StaffSummaryDto[] = staffQ.data ?? [];
  const projects = useMemo(
    () => (projectsQ.data ?? []).map((p) => dtoToProject(p, staffQ.data ?? [])),
    [projectsQ.data, staffQ.data]
  );
  // Everyone who can be filtered on or assigned: current staff only, by name.
  const activeStaff = useMemo(
    () => (staffQ.data ?? []).filter((s) => !s.isFormer).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [staffQ.data]
  );
  const loading = projectsQ.isPending || staffQ.isPending;
  // Keyed by project id; projects start collapsed.
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
  const [doneTasks, setDoneTasks] = useState<Record<string, boolean>>({});
  const [deepLink] = useState(readDeepLink);
  // ?add=<date> opens the Add task modal straight away with the due date filled in.
  const [modalOpen, setModalOpen] = useState(() => deepLink.add !== null);
  const [form, setForm] = useState<AddTaskForm>(() => (deepLink.add ? { ...EMPTY_TASK_FORM, due: deepLink.add } : EMPTY_TASK_FORM));
  // ?edit=<id> has to wait for the projects to arrive; resolved during render below.
  const [pendingEditId, setPendingEditId] = useState<string | null>(deepLink.edit);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [projModalOpen, setProjModalOpen] = useState(false);
  const [projForm, setProjForm] = useState<NewProjectForm>(EMPTY_PROJECT_FORM);
  const [projSaving, setProjSaving] = useState(false);
  const [projError, setProjError] = useState<string | null>(null);
  // Shared by both modals: only one can be open at a time.
  const [deleting, setDeleting] = useState(false);
  // "completed" = the Completed-by report. Open to all staff (Rachel, Oct 27: teammates pick up
  // each other's tasks, so seeing who finished what is fine).
  const [view, setView] = useState<"project" | "my" | "all" | "completed">("project");
  // Grab bag (Rachel, Oct 2026): open tasks with a role and nobody assigned, for anyone to take.
  const [grabBagOnly, setGrabBagOnly] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);
  // Open by default so finished tasks disappear (client, Oct 2026).
  const [statusView, setStatusView] = useState<StatusView>("open");
  const [typeFilter, setTypeFilter] = useState<"all" | "production" | "staff" | "admin" | "event">("all");
  // ALL_ASSIGNEES, UNASSIGNED, or a staff id.
  const [assigneeFilter, setAssigneeFilter] = useState<string>(ALL_ASSIGNEES);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // New task can be clicked before the projects list lands (first load, or a retry from the
  // modal). With exactly one project there is nothing to choose, so pick it once it arrives, as
  // openModal does when the list is already here. Adjusted during render, not in an effect.
  if (modalOpen && form.projectIdx === null && projects.length === 1) {
    setForm((f) => ({ ...f, projectIdx: 0, projectLocked: true }));
  }

  // The ?edit= deep link: open that task's editor once the projects are here. Same
  // adjust-during-render pattern as above. A task that no longer exists simply isn't opened.
  if (pendingEditId !== null && projectsQ.data) {
    const target = projects.flatMap((p) => p.tasks).find((t) => t.id === pendingEditId);
    setPendingEditId(null);
    if (target) {
      setForm({
        editingId: target.id, name: target.name, ctx: target.ctx ?? "",
        projectIdx: projects.findIndex((p) => p.id === target.projectId), projectLocked: true,
        assigneeId: target.assignedToId ?? "", role: target.role ?? "", due: target.dueIso ?? "", prio: target.prio, status: formStatusOf(target.status),
        repeat: target.repeat,
      });
      setModalOpen(true);
    }
  }

  function matchesAssignee(t: Task): boolean {
    if (assigneeFilter === ALL_ASSIGNEES) return true;
    if (assigneeFilter === UNASSIGNED) return t.assignedToId === null;
    return t.assignedToId === assigneeFilter;
  }

  // The optimistic Done override counts, so a just-checked task leaves the Open view at once.
  function isTaskDone(t: Task): boolean { return doneTasks[t.id] ?? t.status === "done"; }
  function matchesStatusView(t: Task): boolean {
    if (statusView === "all") return true;
    return statusView === "done" ? isTaskDone(t) : !isTaskDone(t);
  }
  // A finished project drops out of Open with its tasks; Done shows it (or any project with
  // finished tasks to look back on).
  function projectMatchesStatusView(p: Project): boolean {
    if (statusView === "all") return true;
    const projectDone = p.status[0] === "done";
    return statusView === "done" ? projectDone || p.tasks.some(isTaskDone) : !projectDone;
  }

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
      setSaveError(describeApiError(e, "Couldn't update the task — try again."));
    }
  }

  function openModal(targetProjectIdx: number | null = null) {
    // With a single project there is nothing to choose — pick it so Add task isn't blocked.
    const projectIdx = targetProjectIdx ?? (projects.length === 1 ? 0 : null);
    // Filtering by a person means "their tasks": a new task starts assigned to them.
    const assigneeId = activeStaff.some((s) => s.id === assigneeFilter) ? assigneeFilter : "";
    setForm({ ...EMPTY_TASK_FORM, projectIdx, projectLocked: projectIdx !== null, assigneeId });
    setTaskError(null);
    setModalOpen(true);
  }
  function closeModal() { if (!deleting) setModalOpen(false); }

  // Clicking a task row (Oct 2026). The project is shown but not changeable: moving a task
  // between projects isn't something the API supports yet.
  function openEdit(t: Task) {
    const projectIdx = projects.findIndex((p) => p.id === t.projectId);
    setForm({
      editingId: t.id,
      name: t.name,
      ctx: t.ctx ?? "",
      projectIdx: projectIdx >= 0 ? projectIdx : null,
      projectLocked: true,
      assigneeId: t.assignedToId ?? "",
      role: t.role ?? "",
      due: t.dueIso ?? "",
      prio: t.prio,
      status: formStatusOf(t.status),
      repeat: t.repeat,
    });
    setTaskError(null);
    setModalOpen(true);
  }

  // A grab-bag task: has a role, nobody on it yet, still open.
  const isGrabBag = (t: Task) => t.role !== null && t.assignedToId === null && !isTaskDone(t);

  async function takeTask(t: Task) {
    setTaking(t.id);
    setSaveError(null);
    try {
      await tasksApi.takeTask(t.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } catch (e) {
      // 409s carry the reason: someone else took it, or the login isn't linked to staff.
      setSaveError(describeApiError(e, "Couldn't take that task — try again."));
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } finally {
      setTaking(null);
    }
  }

  // Name cell extras: the role chip, and on finished tasks who checked it off.
  function taskMeta(t: Task) {
    const role = roleLabel(t.role);
    return (
      <>
        {role && <span className="ss-chip" style={{ fontSize: 11, alignSelf: "flex-start", marginTop: 2 }}>{role}</span>}
        {t.repeat.frequency !== "None" && !isTaskDone(t) && (
          <span className="tc"><Repeat style={{ width: 11, height: 11, verticalAlign: -1 }} aria-hidden="true" /> {repeatSummary(t.repeat, t.dueIso)}</span>
        )}
        {isTaskDone(t) && t.completedBy && (
          <span className="tc" title={t.completionEstimated ? "Estimated from the activity log — finished before completion tracking began" : undefined}>
            <Check style={{ width: 11, height: 11, verticalAlign: -1 }} aria-hidden="true" /> {t.completedBy}{t.completedOn ? ` · ${t.completedOn}` : ""}{t.completionEstimated ? " (est.)" : ""}
          </span>
        )}
      </>
    );
  }

  // Assignee cell: a person, or for grab-bag tasks a "Take it" button.
  function assigneeCell(t: Task) {
    if (isGrabBag(t)) {
      return (
        <button type="button" className="ss-btn" disabled={taking === t.id} style={{ minHeight: 34 }}
          title="Assign this task to yourself"
          onClick={(e) => { e.stopPropagation(); takeTask(t); }}
          onKeyDown={(e) => e.stopPropagation()}>
          <Hand className="ss-btn-icon" />{taking === t.id ? "Taking…" : "Take it"}
        </button>
      );
    }
    return (
      <span className="assignee">
        <span className={`ss-avatar ${t.ar} sm`}>{t.ai}</span>
        <span>{t.an}</span>
      </span>
    );
  }

  async function handleDeleteTask() {
    if (!form.editingId || deleting) return;
    setDeleting(true);
    setTaskError(null);
    try {
      await tasksApi.deleteTask(form.editingId);
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } catch (e) {
      setTaskError(describeApiError(e, "Couldn't delete the task — try again."));
    } finally {
      setDeleting(false);
    }
  }

  function openProjModal() {
    setProjForm(EMPTY_PROJECT_FORM);
    setProjError(null);
    setProjModalOpen(true);
  }

  function openEditProject(p: Project) {
    const status = p.status[0];
    setProjForm({
      editingId: p.id,
      title: p.title,
      type: p.typeRaw,
      // Statuses the chips don't know (legacy "blocked") edit as Planning rather than vanish.
      status: status === "inprogress" || status === "done" ? status : "planning",
      scope: p.scopeRaw,
      due: p.dueIso ?? "",
    });
    setProjError(null);
    setProjModalOpen(true);
  }

  // Annual projects (Oct 2026): copy with every date a year later; the copy opens expanded.
  async function handleCopyProject() {
    if (!projForm.editingId) return;
    setProjError(null);
    try {
      const copy = await tasksApi.copyProjectToNextYear(projForm.editingId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      setCollapsedMap((prev) => ({ ...prev, [copy.id]: false }));
      setStatusView("open");
      setProjModalOpen(false);
    } catch (e) {
      setProjError(describeApiError(e, "Couldn't copy the project — try again."));
    }
  }

  async function handleDeleteProject() {
    if (!projForm.editingId || deleting) return;
    setDeleting(true);
    setProjError(null);
    try {
      await tasksApi.deleteProject(projForm.editingId);
      setProjModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } catch (e) {
      setProjError(describeApiError(e, "Couldn't delete the project — try again."));
    } finally {
      setDeleting(false);
    }
  }

  // Both modals stay open until the save resolves: closing first lost what was typed whenever
  // the save failed, and the error landed in a banner that could be scrolled out of view.
  async function handleProjectSubmit() {
    if (projSaving || !projForm.title.trim()) return;
    setProjSaving(true);
    setProjError(null);
    try {
      if (projForm.editingId) {
        await tasksApi.updateProject(projForm.editingId, {
          title: projForm.title.trim(),
          type: projForm.type,
          status: projForm.status,
          // "" clears the scope server-side; a missing due date needs the explicit flag.
          scope: projForm.scope.trim(),
          dueDate: projForm.due || undefined,
          clearDueDate: !projForm.due,
        });
      } else {
        await tasksApi.createProject({
          title: projForm.title.trim(),
          type: projForm.type,
          status: projForm.status,
          scope: projForm.scope.trim() || undefined,
          dueDate: projForm.due || undefined,
        });
      }
      setProjModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } catch (e) {
      setProjError(describeApiError(e, projForm.editingId ? "Couldn't save the project — try again." : "Couldn't create the project — try again."));
    } finally {
      setProjSaving(false);
    }
  }

  async function handleSubmit() {
    if (form.projectIdx === null || taskSaving) return;
    const proj = projects[form.projectIdx];
    if (!proj || !form.name.trim()) return;
    setTaskSaving(true);
    setTaskError(null);
    try {
      if (form.editingId) {
        await tasksApi.updateTask(form.editingId, {
          name: form.name.trim(),
          context: form.ctx.trim(),
          role: form.role || undefined,
          clearRole: !form.role,
          assignedToId: form.assigneeId || undefined,
          clearAssignee: !form.assigneeId,
          priority: PRIO_API_MAP[form.prio] as "High" | "Medium" | "Low",
          dueDate: form.due || undefined,
          clearDueDate: !form.due,
          taskStatus: STATUS_API_MAP[form.status],
          // No due date = no repeat (the picker is disabled then, but a cleared date must stop it).
          ...(form.due ? repeatToDto(form.repeat) : { repeatFrequency: "None" as const }),
        });
      } else {
        await tasksApi.addTask(proj.id, {
          projectId: proj.id,
          name: form.name.trim(),
          context: form.ctx.trim() || undefined,
          role: form.role || undefined,
          assignedToId: form.assigneeId || undefined,
          priority: PRIO_API_MAP[form.prio] as "High" | "Medium" | "Low",
          dueDate: form.due || undefined,
          status: STATUS_API_MAP[form.status],
          ...(form.due ? repeatToDto(form.repeat) : {}),
        });
        setCollapsedMap((prev) => ({ ...prev, [proj.id]: false }));
      }
      closeModal();
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } catch (e) {
      // A failed save must not silently look successful (#35).
      setTaskError(describeApiError(e, "Couldn't save the task — try again."));
    } finally {
      setTaskSaving(false);
    }
  }

  // Shared by both task tables: the whole row opens the editor, the checkbox still toggles Done.
  function rowProps(t: Task) {
    return {
      className: `task-row-editable${isTaskDone(t) ? " task-row-done" : ""}`,
      tabIndex: 0,
      role: "button" as const,
      title: "Open to edit",
      onClick: () => openEdit(t),
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(t); } },
    };
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
            <button className={view === "completed" ? "is-active" : ""} onClick={() => setView("completed")} title="Who completed which tasks, per month">Completed by</button>
          </div>
          {canManage && (
            <button className="ss-btn" type="button" onClick={openProjModal}>
              <FolderPlus className="ss-btn-icon" />New project
            </button>
          )}
          <button className="ss-btn ss-btn-primary" type="button" onClick={() => openModal(null)}>
            <Plus className="ss-btn-icon" />New task
          </button>
        </div>
      </div>

      <div className="adm-content">
        {view === "completed" ? <CompletionsReport /> : (<>
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
          {/* Every current staff member, not just the first three chips that used to fit. */}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-secondary)" }}>
            Assignee
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              style={{
                minHeight: 34, border: `${assigneeFilter === ALL_ASSIGNEES ? "0.5px" : "1px"} solid ${assigneeFilter === ALL_ASSIGNEES ? "var(--border-hover)" : "var(--primary)"}`,
                borderRadius: "var(--r-md)", padding: "6px 10px", fontSize: 13, color: "var(--fg)",
                background: "var(--surface)", outline: "none", maxWidth: 240,
              }}
            >
              <option value={ALL_ASSIGNEES}>All assignees</option>
              <option value={UNASSIGNED}>Unassigned</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </label>
          <span style={{ width: 1, height: 22, background: "var(--border-strong)", margin: "0 4px" }} />
          {/* Open / Done / All (client, Oct 2026): finished tasks and projects leave the default view. */}
          <div className="seg" role="group" aria-label="Show">
            {([["open", "Open"], ["done", "Done"], ["all", "All"]] as [StatusView, string][]).map(([val, label]) => (
              <button key={val} type="button" className={statusView === val ? "is-active" : ""} onClick={() => setStatusView(val)}>{label}</button>
            ))}
          </div>
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
          {/* Grab bag (Rachel, Oct 2026): open tasks with a role and nobody assigned. */}
          <button type="button" className={`ss-chip${grabBagOnly ? " is-active" : ""}`} aria-pressed={grabBagOnly} style={{ cursor: "pointer", minHeight: 34 }}
            title={`Open tasks for a role (${TASK_ROLES.map((r) => r.short).join(", ")}) that nobody has taken yet`}
            onClick={() => setGrabBagOnly((v) => !v)}>
            <ShoppingBag style={{ width: 12, height: 12 }} aria-hidden="true" />Grab bag
            {grabBagOnly && <Check style={{ width: 12, height: 12 }} aria-hidden="true" />}
          </button>
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
            {canManage
              ? "No projects yet — create one to get started."
              : "No projects yet. Tasks live under a project, and a coordinator can create one."}
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
              if (!matchesAssignee(t)) return false;
              if (!matchesStatusView(t)) return false;
              if (overdueOnly && !(t.overdue || t.status === "overdue")) return false;
              if (grabBagOnly && !isGrabBag(t)) return false;
              return true;
            });

          if (flat.length === 0) return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
              {view === "my" ? "No tasks assigned to you match the current filters." : "No tasks match the current filters."}
              {statusView === "open" && " Finished tasks are under Done."}
            </div>
          );

          return (
            <div className="proj">
              <table className="tbl">
                <tbody>
                  {flat.map(({ p, t }) => {
                    const isDone = isTaskDone(t);
                    const Tag = TAG[t.status].icon;
                    return (
                      <tr key={t.id} {...rowProps(t)}>
                        <td style={{ width: 34 }}>
                          <span className={`ss-checkbox${isDone ? " is-checked" : ""}`} role="checkbox" aria-checked={isDone} aria-label="Done" tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); toggleTask(t); }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleTask(t); } }}>
                            <Check />
                          </span>
                        </td>
                        <td>
                          <div className="task-name">
                            <span className="tn">{t.name}</span>
                            <span className="tc">{p.title}{t.ctx ? ` · ${t.ctx}` : ""}</span>
                            {taskMeta(t)}
                          </div>
                        </td>
                        {(view === "all" || isGrabBag(t)) && (
                          <td>{assigneeCell(t)}</td>
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
              if (!projectMatchesStatusView(p)) return false;
              if (assigneeFilter !== ALL_ASSIGNEES && !p.tasks.some(matchesAssignee)) return false;
              if (overdueOnly && !p.tasks.some((t) => t.overdue || t.status === "overdue")) return false;
              if (grabBagOnly && !p.tasks.some(isGrabBag)) return false;
              return true;
            });

          if (filteredItems.length === 0) return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
              No projects match the current filters.{statusView === "open" && " Finished projects are under Done."}
            </div>
          );

          return filteredItems.map(({ p, idx }) => {
          const ProjIcon = p.icon;
          // A person (or Unassigned) filter narrows the rows too, not just which projects show.
          // Under Open, a project's finished tasks are hidden with it; a done project under Done
          // shows everything it had.
          const rows = p.tasks.filter((t) => matchesAssignee(t)
            && (statusView === "done" && p.status[0] === "done" ? true : matchesStatusView(t))
            && (!grabBagOnly || isGrabBag(t)));
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
                    {canManage && (
                      <button type="button" className="ss-btn" aria-label={`Edit project ${p.title}`} title="Edit project"
                        style={{ minHeight: 34, padding: "0 8px" }}
                        onClick={(e) => { e.stopPropagation(); openEditProject(p); }}>
                        <Pencil className="ss-btn-icon" />
                      </button>
                    )}
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
                {rows.length > 0 && (
                  <table className="tbl">
                    <tbody>
                      {rows.map((t) => {
                        const isDone = isTaskDone(t);
                        const Tag = TAG[t.status].icon;
                        return (
                          <tr key={t.id} {...rowProps(t)}>
                            <td style={{ width: 34 }}>
                              <span className={`ss-checkbox${isDone ? " is-checked" : ""}`} role="checkbox" aria-checked={isDone} aria-label="Done" tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); toggleTask(t); }}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleTask(t); } }}>
                                <Check />
                              </span>
                            </td>
                            <td>
                              <div className="task-name">
                                <span className="tn">{t.name}</span>
                                {t.ctx ? <span className="tc">{t.ctx}</span> : null}
                                {taskMeta(t)}
                              </div>
                            </td>
                            <td>{assigneeCell(t)}</td>
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

        {view === "project" && canManage && (
          <button className="create-proj" type="button" onClick={openProjModal}>
            <FolderPlus />Create new project
          </button>
        )}
        </>)}
      </div>

      {modalOpen && (
        <AddTaskModal form={form} setForm={setForm} projects={projects}
          projectsLoading={projectsQ.isPending}
          projectsError={projectsQ.isError ? projectsQ.error : null}
          onRetryProjects={() => { void projectsQ.refetch(); }}
          staffList={staffList}
          saving={taskSaving} error={taskError} onClose={closeModal} onSubmit={handleSubmit}
          onDelete={canManage ? handleDeleteTask : undefined} deleting={deleting} />
      )}
      {projModalOpen && canManage && (
        <NewProjectModal form={projForm} setForm={setProjForm}
          saving={projSaving} error={projError} onClose={() => { if (!deleting) setProjModalOpen(false); }} onSubmit={handleProjectSubmit}
          onDelete={handleDeleteProject} deleting={deleting}
          onCopyToNextYear={handleCopyProject}
          taskCount={projects.find((p) => p.id === projForm.editingId)?.tasks.length ?? 0} />
      )}
    </div>
  );
}

