"use client";

import { useState } from "react";
import {
  Plus,
  AlertCircle,
  Check,
  Loader,
  Lock,
  Circle,
  PenLine,
  Trash2,
  X,
  FolderPlus,
  Drama,
  UserPlus,
  Shield,
  Calendar,
  type LucideIcon,
} from "lucide-react";
import type { StaffSummaryDto, ProjectType, TaskRole } from "@/lib/types/api";
import { staffRoleAvatarClass } from "@/lib/staffRoles";

import { describeApiError } from "@/lib/api/client";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useDialogFocus } from "@/lib/useDialogFocus";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskStatus = "done" | "inprogress" | "overdue" | "blocked" | "upcoming" | "draft";
export type Prio = "high" | "med" | "low";

export const TAG: Record<TaskStatus, { icon: LucideIcon; label: string }> = {
  done:       { icon: Check,        label: "Done" },
  inprogress: { icon: Loader,       label: "In progress" },
  overdue:    { icon: AlertCircle,  label: "Overdue" },
  blocked:    { icon: Lock,         label: "Blocked" },
  upcoming:   { icon: Circle,       label: "Upcoming" },
  draft:      { icon: PenLine,      label: "Draft" },
};

/**
 * Job-title roles a task can be for (Rachel, Oct 2026). Teaching staff only, so no Admin.
 * Order is the picker's order; labels are what staff see.
 */
export const TASK_ROLES: { value: TaskRole; label: string; short: string }[] = [
  { value: "Coordinator",             label: "Coordinator",               short: "Coordinator" },
  { value: "SeniorTeachingArtist",    label: "Senior Teaching Artist",    short: "Senior" },
  { value: "TeachingArtist",          label: "Teaching Artist",           short: "Teaching" },
  { value: "AssistantTeachingArtist", label: "Assistant Teaching Artist", short: "Assistant" },
];
export const roleLabel = (r: TaskRole | null | undefined) => TASK_ROLES.find((x) => x.value === r)?.label ?? null;

export type Task = {
  id: string;
  projectId: string;
  role: TaskRole | null;
  /** Who marked it Done and when (display strings); null while open or for untracked history. */
  completedBy: string | null;
  completedOn: string | null;
  completionEstimated: boolean;
  name: string;
  ctx?: string;
  assignedToId: string | null;
  ai: string;
  ar: string;
  an: string;
  due: string;
  /** The raw yyyy-mm-dd, for prefilling the edit form. */
  dueIso: string | null;
  status: TaskStatus;
  overdue?: boolean;
  prio: Prio;
};

export type Project = {
  id: string;
  collapsed: boolean;
  icon: LucideIcon;
  iconcls: string;
  title: string;
  type: [string, string];
  typeRaw: ProjectType;
  status: [string, string];
  scope: string;
  scopeRaw: string;
  frac: string;
  pct: number;
  barcls: string;
  alert: string;
  due: string;
  dueIso: string | null;
  tasks: Task[];
};

// ── Add / Edit Task Modal ─────────────────────────────────────────────────────

export type AddTaskForm = {
  /** Set when the modal edits an existing task; null when adding. */
  editingId: string | null;
  name: string;
  ctx: string;
  projectIdx: number | null;
  /** Opened from a project's own "Add task to …" row (or the only project): no picker. */
  projectLocked: boolean;
  assigneeId: string;
  /** "" = no role. */
  role: TaskRole | "";
  due: string;
  prio: Prio;
  status: "upcoming" | "inprogress" | "blocked" | "draft" | "done";
};

export const EMPTY_TASK_FORM: AddTaskForm = {
  editingId: null, name: "", ctx: "", projectIdx: null, projectLocked: false, assigneeId: "", role: "", due: "", prio: "med", status: "upcoming",
};

/** Shown by the Project field and on the disabled button while no project is chosen. */
const CHOOSE_PROJECT_HINT = "Choose a project to enable Add task";

/** Starting statuses a new task may have; editing also allows Done. */
const NEW_TASK_STATUSES: [AddTaskForm["status"], string][] = [
  ["upcoming", "Upcoming"], ["inprogress", "In progress"], ["blocked", "Blocked"], ["draft", "Draft"],
];
const EDIT_TASK_STATUSES: [AddTaskForm["status"], string][] = [...NEW_TASK_STATUSES, ["done", "Done"]];

/**
 * Two-step delete that lives inside a modal footer: the first click turns into a question,
 * the second confirms. Avoids window.confirm (which blocks the escape key handling) while
 * still giving a "button happy" team a moment to stop.
 */
function DeleteInFooter({ what, onDelete, deleting, disabled }: { what: string; onDelete: () => void; deleting: boolean; disabled: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="ss-btn" onClick={() => setConfirming(true)} disabled={disabled} style={{ marginRight: "auto", color: "var(--danger)" }}>
        <Trash2 className="ss-btn-icon" />Delete
      </button>
    );
  }
  return (
    <span style={{ marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-secondary)" }}>
      <span>Delete {what}? This can&apos;t be undone.</span>
      <button type="button" className="ss-btn" onClick={() => setConfirming(false)} disabled={deleting}>Keep</button>
      <button type="button" className="ss-btn" onClick={onDelete} disabled={deleting} style={{ color: "var(--danger)", borderColor: "var(--danger-border)" }}>
        {deleting ? <Loader className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} aria-hidden="true" /> : <Trash2 className="ss-btn-icon" />}
        {deleting ? "Deleting…" : "Yes, delete"}
      </button>
    </span>
  );
}

/**
 * The modal stays open until the save resolves (the page closes it on success), so a failed
 * save keeps what was typed and shows the error here. Debbie's Oct 13 "Add task does nothing"
 * was the required Project left unchosen behind a disabled button that looked enabled.
 *
 * Oct 2026: the same modal edits an existing task (form.editingId set). Delete is offered only
 * when the page says the user may (DELETE is ManagementWrite).
 */
export function AddTaskModal({
  form,
  setForm,
  projects,
  projectsLoading,
  projectsError,
  onRetryProjects,
  staffList,
  saving,
  error,
  onClose,
  onSubmit,
  onDelete,
  deleting = false,
}: {
  form: AddTaskForm;
  setForm: React.Dispatch<React.SetStateAction<AddTaskForm>>;
  projects: Project[];
  /** Present only when the user may delete this task; shown in edit mode. */
  onDelete?: () => void;
  deleting?: boolean;
  /**
   * The projects query's state. New task can be clicked before the list arrives or after it
   * failed, and an empty list then is not "no projects yet" (a teacher would ask a coordinator
   * to create a project that already exists).
   */
  projectsLoading: boolean;
  projectsError: unknown;
  onRetryProjects: () => void;
  staffList: StaffSummaryDto[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const editing = form.editingId !== null;
  const hasName = form.name.trim().length > 0;
  const hasProject = form.projectIdx !== null;
  const canSubmit = hasName && hasProject && !saving && !deleting;
  const targetProject = form.projectIdx !== null ? projects[form.projectIdx] : null;
  // Closing mid-save would drop the error if the save then failed.
  useEscapeKey(onClose, !saving && !deleting);
  const panelRef = useDialogFocus<HTMLDivElement>();
  // A project picked from the dropdown keeps the dropdown, so the choice can still be changed.
  const lockedProject = form.projectLocked ? targetProject : null;
  const TargetIcon = lockedProject?.icon;
  const disabledReason = saving
    ? undefined
    : !hasProject
      ? CHOOSE_PROJECT_HINT
      : !hasName
        ? "Enter a task name to enable Add task"
        : undefined;

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
    padding: "8px 12px", fontSize: 13, color: "var(--fg)",
    background: "var(--surface)", outline: "none",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? "Edit task" : "Add task"} style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(500px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>
              {editing ? "Edit task" : targetProject ? `Add task to ${targetProject.title}` : "Add task"}
            </h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
              {editing ? (targetProject ? `In ${targetProject.title}` : "Changes save when you click Save") : "Task will appear in the project list"}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" style={{ background: "none", border: "none", cursor: saving ? "not-allowed" : "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Task name <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <input type="text" placeholder="e.g. Order props for Act 2" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} autoFocus />
          </div>

          <div>
            <label htmlFor={lockedProject ? undefined : "add-task-project"} className="ss-label" style={{ display: "block", marginBottom: 6 }}>
              Project <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span>
            </label>
            {lockedProject && TargetIcon ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: "var(--r-md)", border: "0.5px solid var(--border)", background: "var(--bg-secondary)", fontSize: 13, color: "var(--fg)" }}>
                <TargetIcon style={{ width: 13, height: 13, color: "var(--fg-secondary)" }} />
                {lockedProject.title}
              </div>
            ) : (
              <>
                <select id="add-task-project" value={form.projectIdx ?? ""} aria-describedby={hasProject ? undefined : "add-task-project-hint"}
                  onChange={(e) => setForm((f) => ({ ...f, projectIdx: e.target.value === "" ? null : Number(e.target.value) }))} style={inputStyle}>
                  <option value="">Select a project…</option>
                  {projects.map((p, i) => <option key={p.id} value={i}>{p.title}</option>)}
                </select>
                {!hasProject && (projects.length === 0 && projectsError ? (
                  <div id="add-task-project-hint" role="alert" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6, fontSize: 12, color: "var(--danger)" }}>
                    <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      Couldn&apos;t load projects. {describeApiError(projectsError, "Check your connection and try again.")}
                    </span>
                    <button type="button" className="ss-btn" onClick={onRetryProjects}>Retry</button>
                  </div>
                ) : projects.length === 0 && projectsLoading ? (
                  <div id="add-task-project-hint" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "var(--fg-tertiary)" }}>
                    <Loader style={{ width: 13, height: 13, flexShrink: 0, animation: "spin 1s linear infinite" }} aria-hidden="true" />
                    Loading projects…
                  </div>
                ) : (
                  <div id="add-task-project-hint" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "var(--danger)" }}>
                    <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true" />
                    {projects.length === 0
                      ? "No projects yet. A coordinator needs to create one before tasks can be added."
                      : CHOOSE_PROJECT_HINT}
                  </div>
                ))}
              </>
            )}
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Context <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional — e.g. Wardrobe, HR</span></div>
            <input type="text" placeholder="e.g. Wardrobe" value={form.ctx} onChange={(e) => setForm((f) => ({ ...f, ctx: e.target.value }))} style={inputStyle} />
          </div>

          {/* Role (Rachel, Oct 2026): the job title this task is for. With nobody assigned it
              lands in the Grab bag, where any staff member can take it. */}
          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Role <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional — leave Assignee empty to put it in the Grab bag</span></div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }} role="group" aria-label="Role">
              <button type="button" className={`ss-chip${form.role === "" ? " is-active" : ""}`} aria-pressed={form.role === ""} style={{ cursor: "pointer", minHeight: 34 }}
                onClick={() => setForm((f) => ({ ...f, role: "" }))}>
                No role
              </button>
              {TASK_ROLES.map((r) => (
                <button key={r.value} type="button" className={`ss-chip${form.role === r.value ? " is-active" : ""}`} aria-pressed={form.role === r.value} style={{ cursor: "pointer", minHeight: 34 }}
                  onClick={() => setForm((f) => ({ ...f, role: r.value }))}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Assignee <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {staffList.filter((s) => !s.isFormer).map((s) => {
                const selected = form.assigneeId === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => setForm((f) => ({ ...f, assigneeId: f.assigneeId === s.id ? "" : s.id }))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: "var(--r-pill)", border: `0.5px solid ${selected ? "var(--border-hover)" : "var(--border)"}`, background: selected ? "var(--bg-secondary)" : "var(--surface)", color: selected ? "var(--fg)" : "var(--fg-secondary)", cursor: "pointer", fontSize: 13 }}>
                    <span className={`ss-avatar ${staffRoleAvatarClass(s.role)} sm`} style={{ width: 20, height: 20, fontSize: 9, flexShrink: 0 }}>{s.initials}</span>
                    {s.fullName}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Due date <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <input type="date" value={form.due} onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))} style={{ ...inputStyle, width: "55%" }} />
          </div>

          <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap" }}>
            <div>
              <div className="ss-label" style={{ marginBottom: 8 }}>Priority</div>
              <div style={{ display: "flex", gap: 5 }}>
                {(["high", "med", "low"] as Prio[]).map((p) => (
                  <button key={p} type="button" className={`ss-chip${form.prio === p ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, prio: p }))}>
                    <span className={`prio ${p}`} />{p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="ss-label" style={{ marginBottom: 8 }}>Status</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {(editing ? EDIT_TASK_STATUSES : NEW_TASK_STATUSES).map(([s, label]) => (
                  <button key={s} type="button" className={`ss-chip${form.status === s ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, status: s }))}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ margin: "0 var(--space-4) var(--space-3)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          {editing && onDelete && <DeleteInFooter what="this task" onDelete={onDelete} deleting={deleting} disabled={saving} />}
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving || deleting}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={onSubmit} disabled={!canSubmit} title={disabledReason}>
            {saving
              ? <Loader className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} aria-hidden="true" />
              : editing ? <Check className="ss-btn-icon" /> : <Plus className="ss-btn-icon" />}
            {saving ? (editing ? "Saving…" : "Adding…") : editing ? "Save changes" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Project Modal ─────────────────────────────────────────────────────────

export type NewProjectForm = {
  /** Set when editing an existing project; null when creating. */
  editingId: string | null;
  title: string;
  type: ProjectType;
  status: "planning" | "inprogress" | "done";
  scope: string;
  due: string;
};

export const EMPTY_PROJECT_FORM: NewProjectForm = {
  editingId: null, title: "", type: "Production", status: "planning", scope: "", due: "",
};

const PROJECT_STATUSES: [NewProjectForm["status"], string][] = [
  ["planning", "Planning"], ["inprogress", "In progress"], ["done", "Done"],
];

const PROJECT_TYPES: { value: ProjectType; label: string; icon: LucideIcon }[] = [
  { value: "Production", label: "Production", icon: Drama },
  { value: "Staff",      label: "Staff",      icon: UserPlus },
  { value: "Admin",      label: "Admin",      icon: Shield },
  { value: "Event",      label: "Event",      icon: Calendar },
];

/**
 * Same open-until-saved contract as AddTaskModal. Only shown to managers (POST, PUT and
 * DELETE are all ManagementWrite). Edits an existing project when form.editingId is set.
 */
export function NewProjectModal({
  form,
  setForm,
  saving,
  error,
  onClose,
  onSubmit,
  onDelete,
  deleting = false,
  taskCount = 0,
}: {
  form: NewProjectForm;
  setForm: React.Dispatch<React.SetStateAction<NewProjectForm>>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  /** How many tasks the delete would take with it (edit mode). */
  taskCount?: number;
}) {
  const editing = form.editingId !== null;
  const hasTitle = form.title.trim().length > 0;
  const canSubmit = hasTitle && !saving && !deleting;
  useEscapeKey(onClose, !saving && !deleting);
  const panelRef = useDialogFocus<HTMLDivElement>();

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
    padding: "8px 12px", fontSize: 13, color: "var(--fg)",
    background: "var(--surface)", outline: "none",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? "Edit project" : "New project"} style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(500px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>{editing ? "Edit project" : "New project"}</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
              {editing ? "Mark it Done to move it out of the Open view" : "Group related tasks under one initiative"}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" style={{ background: "none", border: "none", cursor: saving ? "not-allowed" : "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Project title <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <input type="text" placeholder="e.g. Winter Showcase 2026" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} autoFocus />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Type</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {PROJECT_TYPES.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" className={`ss-chip${form.type === value ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, type: value }))}>
                  <Icon style={{ width: 12, height: 12 }} />{label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Status</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {PROJECT_STATUSES.map(([s, label]) => (
                <button key={s} type="button" className={`ss-chip${form.status === s ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, status: s }))}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Scope <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional — e.g. All programs, Saturday cohort</span></div>
            <input type="text" placeholder="e.g. All programs" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} style={inputStyle} />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Due date <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <input type="date" value={form.due} onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))} style={{ ...inputStyle, width: "55%" }} />
          </div>
        </div>

        {error && (
          <div role="alert" style={{ margin: "0 var(--space-4) var(--space-3)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          {editing && onDelete && (
            <DeleteInFooter
              what={taskCount > 0 ? `this project and its ${taskCount} task${taskCount === 1 ? "" : "s"}` : "this project"}
              onDelete={onDelete} deleting={deleting} disabled={saving}
            />
          )}
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving || deleting}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={onSubmit} disabled={!canSubmit}
            title={!hasTitle && !saving ? `Enter a project title to enable ${editing ? "Save" : "Create project"}` : undefined}>
            {saving
              ? <Loader className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} aria-hidden="true" />
              : editing ? <Check className="ss-btn-icon" /> : <FolderPlus className="ss-btn-icon" />}
            {saving ? (editing ? "Saving…" : "Creating…") : editing ? "Save changes" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}

