"use client";

"use client";

import { useState } from "react";
import { STAFF_ROLES, staffRoleLabel } from "@/lib/staffRoles";
import { sizeOptions } from "@/lib/tshirtSizes";
import {
  UserPlus,
  Check,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  ProgramSummaryDto,
  StaffRole,
  StaffSummaryDto,
  UpdateStaffDto,
} from "@/lib/types/api";

import { useDialogFocus } from "@/lib/useDialogFocus";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { programPillStyle, programTint } from "@/lib/programColor";

// ── Checklist Template ────────────────────────────────────────────────────────

export type TemplateItem = { id: string; label: string; renewalMonths: number | null; templateId: string | null };
export type TemplateSection = { name: string; items: TemplateItem[] };

export const DEFAULT_TEMPLATE: TemplateSection[] = [
  {
    name: "HR & Compliance",
    items: [
      { id: "t1", label: "W-4 / I-9 completed", renewalMonths: null, templateId: null },
      { id: "t2", label: "Background check cleared", renewalMonths: null, templateId: null },
      { id: "t3", label: "Emergency contact form submitted", renewalMonths: null, templateId: null },
    ],
  },
  {
    name: "Training",
    items: [
      { id: "t4", label: "Program overview training", renewalMonths: null, templateId: null },
      { id: "t5", label: "Child safety & mandated reporter training", renewalMonths: null, templateId: null },
      { id: "t6", label: "First aid / CPR certification", renewalMonths: 24, templateId: null },
    ],
  },
  {
    name: "Program Requirements",
    items: [
      { id: "t7", label: "Liability waiver signed", renewalMonths: null, templateId: null },
      { id: "t8", label: "Code of conduct acknowledged", renewalMonths: null, templateId: null },
      { id: "t9", label: "Media release policy reviewed", renewalMonths: null, templateId: null },
    ],
  },
  {
    name: "Access & Setup",
    items: [
      { id: "t10", label: "Staff email account created", renewalMonths: null, templateId: null },
      { id: "t11", label: "Program schedule provided", renewalMonths: null, templateId: null },
      { id: "t12", label: "Star roster access granted", renewalMonths: null, templateId: null },
    ],
  },
];

export function EditChecklistModal({
  template,
  onClose,
  onSave,
}: {
  template: TemplateSection[];
  onClose: () => void;
  onSave: (t: TemplateSection[]) => void;
}) {
  const [draft, setDraft] = useState<TemplateSection[]>(() =>
    template.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }))
  );
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();

  // Called from event handlers only — ids must stay unique across modal reopens.
  function uid() { return crypto.randomUUID(); }

  function updateSectionName(si: number, name: string) {
    setDraft((d) => d.map((s, i) => i === si ? { ...s, name } : s));
  }
  function deleteSection(si: number) {
    setDraft((d) => d.filter((_, i) => i !== si));
  }
  function addSection() {
    setDraft((d) => [...d, { name: "", items: [] }]);
  }
  function updateItemLabel(si: number, ii: number, label: string) {
    setDraft((d) => d.map((s, i) =>
      i !== si ? s : { ...s, items: s.items.map((it, j) => j === ii ? { ...it, label } : it) }
    ));
  }
  function updateItemRenewal(si: number, ii: number, renewalMonths: number | null) {
    setDraft((d) => d.map((s, i) =>
      i !== si ? s : { ...s, items: s.items.map((it, j) => j === ii ? { ...it, renewalMonths } : it) }
    ));
  }
  function deleteItem(si: number, ii: number) {
    setDraft((d) => d.map((s, i) =>
      i !== si ? s : { ...s, items: s.items.filter((_, j) => j !== ii) }
    ));
  }
  function addItem(si: number) {
    setDraft((d) => d.map((s, i) =>
      i !== si ? s : { ...s, items: [...s.items, { id: uid(), label: "", renewalMonths: null, templateId: null }] }
    ));
  }

  const totalItems = draft.reduce((n, s) => n + s.items.length, 0);

  const secInputStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    borderBottom: "0.5px solid var(--border-hover)",
    borderRadius: 0,
    padding: "2px 0",
    fontSize: 11,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--fg-secondary)",
    background: "transparent",
    outline: "none",
  };
  const itemInputStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    padding: "2px 0",
    fontSize: 13,
    color: "var(--fg)",
    background: "transparent",
    outline: "none",
  };
  const iconBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 3,
    borderRadius: "var(--r-sm)",
    color: "var(--fg-tertiary)",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Edit checklist template" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(540px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>

        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Edit checklist template</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
              {draft.length} section{draft.length !== 1 ? "s" : ""} · {totalItems} item{totalItems !== 1 ? "s" : ""} · Changes apply to new staff members
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* scrollable body */}
        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          {draft.map((sec, si) => (
            <div key={si} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* section header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <input
                  value={sec.name}
                  onChange={(e) => updateSectionName(si, e.target.value)}
                  placeholder="Section name"
                  style={secInputStyle}
                />
                <button
                  type="button"
                  onClick={() => deleteSection(si)}
                  title="Delete section"
                  style={{ ...iconBtnStyle, color: "var(--danger)" }}
                >
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>

              {/* items */}
              {sec.items.map((item, ii) => (
                <div
                  key={item.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "0.5px solid var(--border)" }}
                >
                  <span
                    className="ss-checkbox"
                    style={{ cursor: "default", flexShrink: 0, opacity: 0.4 }}
                  />
                  <input
                    value={item.label}
                    onChange={(e) => updateItemLabel(si, ii, e.target.value)}
                    placeholder="Checklist item"
                    style={itemInputStyle}
                  />
                  {/* Renewal interval: completing the item stamps its expiry this far out
                      (TB 4 years, CPR and harassment training 2). */}
                  <select
                    value={item.renewalMonths ?? ""}
                    onChange={(e) => updateItemRenewal(si, ii, e.target.value ? Number(e.target.value) : null)}
                    title="Renews every…"
                    aria-label={`Renewal interval for ${item.label || "item"}`}
                    style={{ fontSize: 11, padding: "2px 4px", border: "0.5px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface)", color: item.renewalMonths ? "var(--fg)" : "var(--fg-tertiary)" }}
                  >
                    <option value="">One-time</option>
                    {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y * 12}>Renews every {y} yr{y > 1 ? "s" : ""}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => deleteItem(si, ii)}
                    title="Remove item"
                    style={iconBtnStyle}
                  >
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              ))}

              {/* add item */}
              <button
                type="button"
                onClick={() => addItem(si)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  color: "var(--primary)",
                  padding: "6px 0",
                  fontWeight: 500,
                }}
              >
                <Plus style={{ width: 12, height: 12 }} />
                Add item
              </button>
            </div>
          ))}

          {/* add section */}
          <button
            type="button"
            onClick={addSection}
            className="btn-dashed"
            style={{ marginTop: 0 }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add section
          </button>
        </div>

        {/* footer */}
        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button
            className="ss-btn ss-btn-primary"
            type="button"
            onClick={() => { onSave(draft); onClose(); }}
          >
            <Check className="ss-btn-icon" />
            Save template
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Staff Modal ───────────────────────────────────────────────────────────

export type AddStaffForm = {
  nm: string;
  role: StaffRole | "";
  programIds: string[];
  startDate: string;
  tShirtSize: string;
};

export const EMPTY_STAFF_FORM: AddStaffForm = { nm: "", role: "", programIds: [], startDate: "", tShirtSize: "" };

export function AddStaffModal({
  programs,
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  programs: ProgramSummaryDto[];
  form: AddStaffForm;
  setForm: React.Dispatch<React.SetStateAction<AddStaffForm>>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = form.nm.trim().length > 0 && form.role !== "" && form.programIds.length > 0;
  const allSelected = form.programIds.length === programs.length && programs.length > 0;
  useEscapeKey(onClose);
  const addPanelRef = useDialogFocus<HTMLDivElement>();

  function toggleAll() {
    setForm((f) => ({ ...f, programIds: allSelected ? [] : programs.map((p) => p.id) }));
  }

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
      <div ref={addPanelRef} role="dialog" aria-modal="true" aria-label="Add staff member" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(480px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Add staff member</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>New member will be added to the onboarding queue</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Full name <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <input type="text" placeholder="e.g. Jordan Rivera" value={form.nm} onChange={(e) => setForm((f) => ({ ...f, nm: e.target.value }))} style={inputStyle} autoFocus />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Role <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <div style={{ display: "flex", gap: 6 }}>
              {STAFF_ROLES.map((r) => (
                <button key={r} type="button" className={`ss-chip${form.role === r ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, role: r }))}>
                  {staffRoleLabel(r)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Programs <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className={`ss-chip${allSelected ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={toggleAll}>
                All programs
              </button>
              {programs.map((p) => {
                const checked = form.programIds.includes(p.id);
                return (
                  <label key={p.id} style={{ ...programPillStyle(p.colorHex, checked), padding: "5px 11px", userSelect: "none" }}>
                    <input type="checkbox" style={{ display: "none" }} checked={checked}
                      onChange={(e) => setForm((f) => ({ ...f, programIds: e.target.checked ? [...f.programIds, p.id] : f.programIds.filter((x) => x !== p.id) }))} />
                    <span className="ss-dot" style={{ background: programTint(p.colorHex).accent }} />
                    {p.name}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Start date <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Leave blank to use today</span></div>
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} style={{ ...inputStyle, width: "60%" }} />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>T-shirt size <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <select value={form.tShirtSize} onChange={(e) => setForm((f) => ({ ...f, tShirtSize: e.target.value }))} style={{ ...inputStyle, width: "40%" }}>
              <option value="">Not set</option>
              {sizeOptions(form.tShirtSize).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={onSubmit} disabled={!canSubmit}>
            <UserPlus className="ss-btn-icon" />Add staff member
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Edit Staff Modal ──────────────────────────────────────────────────────────
// Corrections after the fact (client, Sep 17 2026): a misspelled surname, a role change, a
// wrong start date. Former members are editable too — Rachel had two "Scott Davis" records and
// no way to tell them apart when linking a login, so a name can be qualified here.

export function EditStaffModal({
  member,
  programs,
  onClose,
  onSave,
}: {
  member: StaffSummaryDto;
  programs: ProgramSummaryDto[];
  onClose: () => void;
  onSave: (dto: UpdateStaffDto) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(member.fullName);
  const [programIds, setProgramIds] = useState<string[]>(member.programIds ?? []);
  const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const [initials, setInitials] = useState(member.initials);
  const [role, setRole] = useState<StaffRole>(member.role);
  const [startDate, setStartDate] = useState(member.startDate);
  const [tShirtSize, setTShirtSize] = useState(member.tShirtSize ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();

  // Only block an ACTIVE member being stripped of every program (their login would see nothing).
  // A record that already has none, or a former member, can still have its name or role fixed.
  const programsChanged = !sameIds(programIds, member.programIds ?? []);
  const programsBlocked = programsChanged && programIds.length === 0 && !member.isFormer;
  const trimmedName = fullName.trim();
  const trimmedInitials = initials.trim();
  const dto: UpdateStaffDto = {
    ...(trimmedName !== member.fullName ? { fullName: trimmedName } : {}),
    ...(trimmedInitials !== member.initials ? { initials: trimmedInitials } : {}),
    ...(role !== member.role ? { role } : {}),
    ...(startDate && startDate !== member.startDate ? { startDate } : {}),
    ...(tShirtSize !== (member.tShirtSize ?? "") ? { tShirtSize } : {}),
    ...(programsChanged ? { programIds } : {}),
  };
  const dirty = Object.keys(dto).length > 0;
  const canSave = dirty && trimmedName.length > 0 && trimmedInitials.length > 0 && trimmedInitials.length <= 10 && !programsBlocked && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(dto);
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't save the changes — try again.");
      setSaving(false);
    }
  }

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
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Edit staff member" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(480px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Edit staff member</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
              {member.isFormer ? "Former staff member — their checklist history stays as it is." : "Programs decide which stars, classes and rosters their login can see."}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 12 }}>
            <div>
              <label className="ss-label" htmlFor="es-name" style={{ display: "block", marginBottom: 6 }}>Full name <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></label>
              <input id="es-name" type="text" value={fullName} maxLength={200} onChange={(e) => setFullName(e.target.value)} style={inputStyle} autoFocus />
            </div>
            <div>
              <label className="ss-label" htmlFor="es-initials" style={{ display: "block", marginBottom: 6 }}>Initials</label>
              <input id="es-initials" type="text" value={initials} maxLength={10} onChange={(e) => setInitials(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Role</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STAFF_ROLES.map((r) => (
                <button key={r} type="button" className={`ss-chip${role === r ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setRole(r)}>
                  {staffRoleLabel(r)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Programs <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {programs.map((p) => {
                const checked = programIds.includes(p.id);
                return (
                  <label key={p.id} style={{ ...programPillStyle(p.colorHex, checked), padding: "5px 11px", userSelect: "none", cursor: "pointer" }}>
                    <input type="checkbox" style={{ display: "none" }} checked={checked}
                      onChange={(e) => setProgramIds((ids) => e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id))} />
                    <span className="ss-dot" style={{ background: programTint(p.colorHex).accent }} />
                    {p.name}
                  </label>
                );
              })}
            </div>
            {programsBlocked && <div style={{ marginTop: 4, fontSize: 11, color: "var(--danger)" }}>Pick at least one program, or their login sees nothing.</div>}
            {!programsBlocked && programIds.length === 0 && !member.isFormer && (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--warning-text, var(--warning))" }}>No programs yet — their login sees no stars, classes or rosters until one is ticked.</div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="ss-label" htmlFor="es-start" style={{ display: "block", marginBottom: 6 }}>Start date</label>
              <input id="es-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label className="ss-label" htmlFor="es-shirt" style={{ display: "block", marginBottom: 6 }}>T-shirt size</label>
              <select id="es-shirt" value={tShirtSize} onChange={(e) => setTShirtSize(e.target.value)} style={inputStyle}>
                <option value="">Not set</option>
                {sizeOptions(tShirtSize).map((sz) => <option key={sz} value={sz}>{sz}</option>)}
              </select>
            </div>
          </div>

          {error && <div role="alert" style={{ fontSize: 13, color: "var(--danger)" }}>{error}</div>}
        </div>

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={submit} disabled={!canSave}>
            <Check className="ss-btn-icon" />{saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
