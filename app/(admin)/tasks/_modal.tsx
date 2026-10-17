"use client";

import {
  Plus,
  AlertCircle,
  Check,
  Loader,
  Lock,
  Circle,
  X,
  FolderPlus,
  Drama,
  UserPlus,
  Shield,
  Calendar,
  type LucideIcon,
} from "lucide-react";
import type { StaffSummaryDto, ProjectType } from "@/lib/types/api";
import { staffRoleAvatarClass } from "@/lib/staffRoles";

import { describeApiError } from "@/lib/api/client";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useDialogFocus } from "@/lib/useDialogFocus";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskStatus = "done" | "inprogress" | "overdue" | "blocked" | "upcoming";
export type Prio = "high" | "med" | "low";

export const TAG: Record<TaskStatus, { icon: LucideIcon; label: string }> = {
  done:       { icon: Check,        label: "Done" },
  inprogress: { icon: Loader,       label: "In progress" },
  overdue:    { icon: AlertCircle,  label: "Overdue" },
  blocked:    { icon: Lock,         label: "Blocked" },
  upcoming:   { icon: Circle,       label: "Upcoming" },
};

export type Task = {
  id: string;
  name: string;
  ctx?: string;
  assignedToId: string | null;
  ai: string;
  ar: string;
  an: string;
  due: string;
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
  status: [string, string];
  scope: string;
  frac: string;
  pct: number;
  barcls: string;
  alert: string;
  due: string;
  tasks: Task[];
};

// ── Add Task Modal ────────────────────────────────────────────────────────────

export type AddTaskForm = {
  name: string;
  ctx: string;
  projectIdx: number | null;
  /** Opened from a project's own "Add task to …" row (or the only project): no picker. */
  projectLocked: boolean;
  assigneeId: string;
  due: string;
  prio: Prio;
  status: "upcoming" | "inprogress" | "blocked";
};

export const EMPTY_TASK_FORM: AddTaskForm = {
  name: "", ctx: "", projectIdx: null, projectLocked: false, assigneeId: "", due: "", prio: "med", status: "upcoming",
};

/** Shown by the Project field and on the disabled button while no project is chosen. */
const CHOOSE_PROJECT_HINT = "Choose a project to enable Add task";

/**
 * The modal stays open until the save resolves (the page closes it on success), so a failed
 * save keeps what was typed and shows the error here. Debbie's Oct 13 "Add task does nothing"
 * was the required Project left unchosen behind a disabled button that looked enabled.
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
}: {
  form: AddTaskForm;
  setForm: React.Dispatch<React.SetStateAction<AddTaskForm>>;
  projects: Project[];
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
  const hasName = form.name.trim().length > 0;
  const hasProject = form.projectIdx !== null;
  const canSubmit = hasName && hasProject && !saving;
  const targetProject = form.projectIdx !== null ? projects[form.projectIdx] : null;
  // Closing mid-save would drop the error if the save then failed.
  useEscapeKey(onClose, !saving);
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
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Add task" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(500px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>
              {targetProject ? `Add task to ${targetProject.title}` : "Add task"}
            </h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>Task will appear in the project list</div>
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
              <div style={{ display: "flex", gap: 5 }}>
                {([["upcoming", "Upcoming"], ["inprogress", "In progress"], ["blocked", "Blocked"]] as [AddTaskForm["status"], string][]).map(([s, label]) => (
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

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={onSubmit} disabled={!canSubmit} title={disabledReason}>
            {saving
              ? <Loader className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} aria-hidden="true" />
              : <Plus className="ss-btn-icon" />}
            {saving ? "Adding…" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Project Modal ─────────────────────────────────────────────────────────

export type NewProjectForm = {
  title: string;
  type: ProjectType;
  status: "planning" | "inprogress";
  scope: string;
  due: string;
};

export const EMPTY_PROJECT_FORM: NewProjectForm = {
  title: "", type: "Production", status: "planning", scope: "", due: "",
};

const PROJECT_TYPES: { value: ProjectType; label: string; icon: LucideIcon }[] = [
  { value: "Production", label: "Production", icon: Drama },
  { value: "Staff",      label: "Staff",      icon: UserPlus },
  { value: "Admin",      label: "Admin",      icon: Shield },
  { value: "Event",      label: "Event",      icon: Calendar },
];

/** Same open-until-saved contract as AddTaskModal. Only shown to managers (POST is ManagementWrite). */
export function NewProjectModal({
  form,
  setForm,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  form: NewProjectForm;
  setForm: React.Dispatch<React.SetStateAction<NewProjectForm>>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const hasTitle = form.title.trim().length > 0;
  const canSubmit = hasTitle && !saving;
  useEscapeKey(onClose, !saving);
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
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="New project" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(500px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>New project</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>Group related tasks under one initiative</div>
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
            <div style={{ display: "flex", gap: 5 }}>
              {([["planning", "Planning"], ["inprogress", "In progress"]] as [NewProjectForm["status"], string][]).map(([s, label]) => (
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

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={onSubmit} disabled={!canSubmit}
            title={!hasTitle && !saving ? "Enter a project title to enable Create project" : undefined}>
            {saving
              ? <Loader className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} aria-hidden="true" />
              : <FolderPlus className="ss-btn-icon" />}
            {saving ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}

