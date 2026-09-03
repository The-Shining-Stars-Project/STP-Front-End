"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, AlertCircle, X } from "lucide-react";
import { participantsApi } from "@/lib/api/participants";
import { queryKeys } from "@/lib/api/hooks";
import type {
  ProgramSummaryDto,
  CreateParticipantDto,
  ParticipantStatus,
} from "@/lib/types/api";
import { programPillStyle, programTint } from "@/lib/programColor";

type AddParticipantForm = {
  nm: string;
  dob: string;
  programId: string;
  status: "active" | "prospective" | "authpending" | "inquiry";
  sc: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  referralSource: string;
  tShirtSize: string;
  authExpiry: string;
};

const EMPTY_FORM: AddParticipantForm = {
  nm: "", dob: "", programId: "", status: "prospective", sc: "",
  guardianName: "", guardianPhone: "", guardianEmail: "", referralSource: "", tShirtSize: "", authExpiry: "",
};

const T_SHIRT_SIZES = ["YS", "YM", "YL", "S", "M", "L", "XL", "2XL"];

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AddParticipantModal({
  programs,
  onClose,
  defaultProgramId,
}: {
  programs: ProgramSummaryDto[];
  onClose: () => void;
  defaultProgramId?: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddParticipantForm>({ ...EMPTY_FORM, programId: defaultProgramId ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = form.nm.trim().length > 0 && form.programId !== "" && !saving;

  async function handleSubmit() {
    const statusMap: Record<string, ParticipantStatus> = { active: "Active", prospective: "Prospective", authpending: "AuthPending", inquiry: "Inquiry" };
    const dto: CreateParticipantDto = {
      fullName: form.nm.trim(),
      initials: toInitials(form.nm),
      programId: form.programId,
      status: statusMap[form.status] ?? "Prospective",
      dateOfBirth: form.dob || undefined,
      serviceCoordinator: form.sc.trim() || undefined,
      guardianName: form.guardianName.trim() || undefined,
      guardianPhone: form.guardianPhone.trim() || undefined,
      guardianEmail: form.guardianEmail.trim() || undefined,
      referralSource: form.referralSource.trim() || undefined,
      tShirtSize: form.tShirtSize || undefined,
      authorizationExpiry: form.authExpiry || undefined,
    };

    setSaving(true);
    try {
      await participantsApi.create(dto);
      // These caches all hold participant lists — refetch them (#34).
      queryClient.invalidateQueries({ queryKey: queryKeys.participants });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: ["program-detail"] });
      onClose();
    } catch {
      setError("Could not save star — check that the backend is running and try again.");
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(480px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Add star</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>New star will appear in the roster</div>
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
            <div className="ss-label" style={{ marginBottom: 6 }}>Date of birth <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <input type="date" value={form.dob} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} style={{ ...inputStyle, width: "55%" }} />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Program <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {programs.map((p) => {
                const selected = form.programId === p.id;
                return (
                  <button key={p.id} type="button" aria-pressed={selected} onClick={() => setForm((f) => ({ ...f, programId: p.id }))}
                    style={programPillStyle(p.colorHex, selected)}>
                    <span className="ss-dot" style={{ background: programTint(p.colorHex).accent }} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Status</div>
            <div style={{ display: "flex", gap: 6 }}>
              {([["inquiry", "Inquiry"], ["prospective", "Prospective"], ["active", "Active"], ["authpending", "Auth pending"]] as const).map(([s, label]) => (
                <button key={s} type="button" className={`ss-chip${form.status === s ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, status: s }))}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Service coordinator <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <input type="text" placeholder="e.g. R. Alvarez" value={form.sc} onChange={(e) => setForm((f) => ({ ...f, sc: e.target.value }))} style={inputStyle} />
          </div>

          <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: "var(--space-3)" }}>
            <div className="ss-label" style={{ marginBottom: 6 }}>Guardian name <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <input type="text" placeholder="e.g. Maria Rivera" value={form.guardianName} onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))} style={inputStyle} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>Guardian phone</div>
              <input type="tel" placeholder="(209) 555-0100" value={form.guardianPhone} onChange={(e) => setForm((f) => ({ ...f, guardianPhone: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>Guardian email</div>
              <input type="email" placeholder="name@email.com" value={form.guardianEmail} onChange={(e) => setForm((f) => ({ ...f, guardianEmail: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Referral source <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <input type="text" placeholder="e.g. VMRC, word of mouth" value={form.referralSource} onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))} style={inputStyle} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>T-shirt size</div>
              <select value={form.tShirtSize} onChange={(e) => setForm((f) => ({ ...f, tShirtSize: e.target.value }))} style={inputStyle}>
                <option value="">Not set</option>
                {T_SHIRT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>Authorization expires</div>
              <input type="date" value={form.authExpiry} onChange={(e) => setForm((f) => ({ ...f, authExpiry: e.target.value }))} style={inputStyle} />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ margin: "0 var(--space-4)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}
        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={handleSubmit} disabled={!canSubmit}>
            <UserPlus className="ss-btn-icon" />
            {saving ? "Saving…" : "Add star"}
          </button>
        </div>
      </div>
    </div>
  );
}
