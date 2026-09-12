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
  assigneeId: string;
  due: string;
  prio: Prio;
  status: "upcoming" | "inprogress" | "blocked";
};

export const EMPTY_TASK_FORM: AddTaskForm = {
  name: "", ctx: "", projectIdx: null, assigneeId: "", due: "", prio: "med", status: "upcoming",
};

export function AddTaskModal({
  form,
  setForm,
  projects,
  staffList,
  onClose,
  onSubmit,
}: {
  form: AddTaskForm;
  setForm: React.Dispatch<React.SetStateAction<AddTaskForm>>;
  projects: Project[];
  staffList: StaffSummaryDto[];
  onClose: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = form.name.trim().length > 0 && form.projectIdx !== null;
  const targetProject = form.projectIdx !== null ? projects[form.projectIdx] : null;
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();
  const TargetIcon = targetProject?.icon;

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
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Task name <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <input type="text" placeholder="e.g. Order props for Act 2" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} autoFocus />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Project <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            {targetProject && TargetIcon ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: "var(--r-md)", border: "0.5px solid var(--border)", background: "var(--bg-secondary)", fontSize: 13, color: "var(--fg)" }}>
                <TargetIcon style={{ width: 13, height: 13, color: "var(--fg-secondary)" }} />
                {targetProject.title}
              </div>
            ) : (
              <select value={form.projectIdx ?? ""} onChange={(e) => setForm((f) => ({ ...f, projectIdx: e.target.value === "" ? null : Number(e.target.value) }))} style={inputStyle}>
                <option value="">Select a project…</option>
                {projects.map((p, i) => <option key={p.id} value={i}>{p.title}</option>)}
              </select>
            )}
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Context <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional — e.g. Wardrobe, HR</span></div>
            <input type="text" placeholder="e.g. Wardrobe" value={form.ctx} onChange={(e) => setForm((f) => ({ ...f, ctx: e.target.value }))} style={inputStyle} />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Assignee <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {staffList.map((s) => {
                const selected = form.assigneeId === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => setForm((f) => ({ ...f, assigneeId: f.assigneeId === s.id ? "" : s.id }))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: "var(--r-pill)", border: `0.5px solid ${selected ? "var(--border-hover)" : "var(--border)"}`, background: selected ? "var(--bg-secondary)" : "var(--surface)", color: selected ? "var(--fg)" : "var(--fg-secondary)", cursor: "pointer", fontSize: 13 }}>
                    <span className={`ss-avatar ${s.role.toLowerCase()} sm`} style={{ width: 20, height: 20, fontSize: 9, flexShrink: 0 }}>{s.initials}</span>
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

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={onSubmit} disabled={!canSubmit}>
            <Plus className="ss-btn-icon" />Add task
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

export function NewProjectModal({
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  form: NewProjectForm;
  setForm: React.Dispatch<React.SetStateAction<NewProjectForm>>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = form.title.trim().length > 0;
  useEscapeKey(onClose);
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
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
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

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={onSubmit} disabled={!canSubmit}>
            <FolderPlus className="ss-btn-icon" />Create project
          </button>
        </div>
      </div>
    </div>
  );
}

