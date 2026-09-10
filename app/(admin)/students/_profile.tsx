"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseLocalDate } from "@/lib/format";
import { nextPathwaysReportDue } from "@/lib/pathwaysReports";
import {
  ArrowLeft,
  Pencil,
  Check,
  Trash2,
  Loader2,
  CalendarDays,
  User as UserIcon,
  GraduationCap,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  MinusCircle,
  ShieldAlert,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { participantsApi } from "@/lib/api/participants";
import { usePrograms } from "@/lib/api/hooks";
import ArtsProfileWidget from "./_arts_profile";
import TrackerWidget from "./_tracker";
import DocumentsWidget from "./_documents";
import type {
  ParticipantDetailDto,
  ProgramSummaryDto,
  UpdateParticipantDto,
  ParticipantStatus,
} from "@/lib/types/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUSES: ParticipantStatus[] = ["Active", "Inquiry", "Prospective", "AuthPending", "Attention", "Former", "NotInterested"];

const STATUS_BADGE: Record<ParticipantStatus, { cls: string; icon: LucideIcon; label: string }> = {
  Active:      { cls: "is-active",      icon: CheckCircle2, label: "Active" },
  Prospective: { cls: "is-prospective", icon: Clock,        label: "Prospective" },
  Attention:   { cls: "is-attention",   icon: AlertCircle,  label: "Needs attention" },
  Former:      { cls: "is-former",      icon: MinusCircle,  label: "Former" },
  AuthPending: { cls: "is-authpending", icon: ShieldAlert,  label: "Auth pending" },
  Inquiry:     { cls: "is-inquiry",     icon: Clock,        label: "Inquiry" },
  NotInterested: { cls: "is-notinterested", icon: MinusCircle, label: "Not interested" },
};

const T_SHIRT_SIZES = ["YS", "YM", "YL", "S", "M", "L", "XL", "2XL"];

/** Days until the yyyy-MM-dd date; negative = already past. Null when unset. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((parseLocalDate(iso).getTime() - Date.now()) / 86_400_000);
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(s: string): string {
  if (!s) return "—";
  return parseLocalDate(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
  padding: "8px 12px", fontSize: 13, color: "var(--fg)",
  background: "var(--surface)", outline: "none",
};

type Form = {
  fullName: string; status: ParticipantStatus; programId: string; birthYear: string; sc: string;
  guardianName: string; guardianPhone: string; guardianEmail: string;
  referralSource: string; tShirtSize: string; authExpiry: string; intakeNotes: string;
  ippExpiry: string; dob: string; allergies: string; anaphylactic: boolean;
  areasOfConcern: string; scEmail: string; scPhone: string; remind: string;
  intakeDocs: boolean; diploma: "" | "yes" | "no"; secondaryProgramId: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ParticipantProfile({ id }: { id: string }) {
  const router = useRouter();

  const [detail, setDetail] = useState<ParticipantDetailDto | null>(null);
  // Cached + shared via React Query (#34).
  const programs: ProgramSummaryDto[] = usePrograms().data ?? [];
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>({
    fullName: "", status: "Active", programId: "", birthYear: "", sc: "",
    guardianName: "", guardianPhone: "", guardianEmail: "", referralSource: "", tShirtSize: "", authExpiry: "", intakeNotes: "",
    ippExpiry: "", dob: "", allergies: "", anaphylactic: false,
    areasOfConcern: "", scEmail: "", scPhone: "", remind: "", intakeDocs: false, diploma: "", secondaryProgramId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    participantsApi.getById(id)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        setForm(formFrom(d));
      })
      .catch(() => { if (active) setMissing(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  function formFrom(d: ParticipantDetailDto): Form {
    return {
      fullName: d.fullName,
      status: d.status,
      programId: d.programId,
      birthYear: d.birthYear != null ? String(d.birthYear) : "",
      sc: d.serviceCoordinator ?? "",
      guardianName: d.guardianName ?? "",
      guardianPhone: d.guardianPhone ?? "",
      guardianEmail: d.guardianEmail ?? "",
      referralSource: d.referralSource ?? "",
      tShirtSize: d.tShirtSize ?? "",
      authExpiry: d.authorizationExpiry ?? "",
      intakeNotes: d.intakeNotes ?? "",
      ippExpiry: d.ippExpiry ?? "",
      dob: d.dateOfBirth ?? "",
      allergies: d.allergies ?? "",
      anaphylactic: d.allergyAnaphylactic,
      areasOfConcern: d.areasOfConcern ?? "",
      scEmail: d.serviceCoordinatorEmail ?? "",
      scPhone: d.serviceCoordinatorPhone ?? "",
      remind: d.contactInRemind ?? "",
      intakeDocs: d.intakeDocsSubmitted,
      diploma: d.hasHighSchoolDiploma === null ? "" : d.hasHighSchoolDiploma ? "yes" : "no",
      secondaryProgramId: d.secondaryProgramId ?? "",
    };
  }

  function startEdit() { if (detail) setForm(formFrom(detail)); setError(null); setEditing(true); }
  function cancelEdit() { if (detail) setForm(formFrom(detail)); setError(null); setEditing(false); }

  const canSave = form.fullName.trim().length > 0 && form.programId !== "";

  async function save() {
    if (!detail || !canSave) return;
    setSaving(true);
    setError(null);
    const dto: UpdateParticipantDto = {
      fullName: form.fullName.trim(),
      initials: toInitials(form.fullName),
      programId: form.programId,
      status: form.status,
      birthYear: form.birthYear ? parseInt(form.birthYear, 10) : undefined,
      serviceCoordinator: form.sc.trim(),
      guardianName: form.guardianName.trim(),
      guardianPhone: form.guardianPhone.trim(),
      guardianEmail: form.guardianEmail.trim(),
      referralSource: form.referralSource.trim(),
      tShirtSize: form.tShirtSize,
      intakeNotes: form.intakeNotes.trim(),
      authorizationExpiry: form.authExpiry || undefined,
      clearAuthorizationExpiry: !form.authExpiry,
      ippExpiry: form.ippExpiry || undefined,
      clearIppExpiry: !form.ippExpiry,
      dateOfBirth: form.dob || undefined,
      allergies: form.allergies.trim(),
      allergyAnaphylactic: form.anaphylactic,
      areasOfConcern: form.areasOfConcern.trim(),
      serviceCoordinatorEmail: form.scEmail.trim(),
      serviceCoordinatorPhone: form.scPhone.trim(),
      contactInRemind: form.remind.trim(),
      intakeDocsSubmitted: form.intakeDocs,
      hasHighSchoolDiploma: form.diploma === "" ? undefined : form.diploma === "yes",
      secondaryProgramId: form.secondaryProgramId || undefined,
      clearSecondaryProgram: !form.secondaryProgramId,
    };
    try {
      const updated = await participantsApi.update(id, dto);
      setDetail(updated);
      setForm(formFrom(updated));
      setEditing(false);
    } catch {
      setError("Could not save changes — make sure the backend is running and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await participantsApi.remove(id);
      router.push("/students");
    } catch {
      setDeleting(false);
      setDeleteOpen(false);
      setError("Could not delete this star — try again.");
    }
  }

  // ── Loading / missing states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="adm-main">
        <div className="adm-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh", color: "var(--fg-tertiary)" }}>
          <Loader2 style={{ width: 22, height: 22, animation: "spin 1s linear infinite" }} />        </div>
      </div>
    );
  }

  if (missing || !detail) {
    return (
      <div className="adm-main">
        <div className="adm-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 10, textAlign: "center" }}>
          <AlertCircle style={{ width: 26, height: 26, color: "var(--fg-tertiary)" }} />
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Star not found</h2>
          <p style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>This star may have been removed.</p>
          <Link href="/students" className="ss-btn"><ArrowLeft className="ss-btn-icon" />Back to stars</Link>
        </div>
      </div>
    );
  }

  const slug = detail.programSlug;
  const badge = STATUS_BADGE[detail.status];
  const BadgeIcon = badge.icon;
  const reportDue = nextPathwaysReportDue(detail.startDate, slug);

  // ── View / edit fields ──────────────────────────────────────────────────────
  // Expiry within a month shows amber; past-due shows red — matches the client's
  // "notify a month in advance" rule (in-app only).
  const authExpiryView = (iso: string | null) => {
    if (!iso) return "—";
    const days = daysUntil(iso);
    const label = fmtDate(iso);
    if (days !== null && days < 0)
      return <span className="ss-date-expired"><AlertTriangle />Expired {label}</span>;
    if (days !== null && days <= 31)
      return <span className="ss-date-expiring"><AlertTriangle />{label} · in {days} day{days === 1 ? "" : "s"}</span>;
    return label;
  };

  const field = (label: string, view: React.ReactNode, edit: React.ReactNode) => (
    <div>
      <div className="ss-label" style={{ marginBottom: 6 }}>{label}</div>
      {editing ? edit : <div style={{ fontSize: 14, color: "var(--fg)" }}>{view}</div>}
    </div>
  );

  return (
    <>

      <div className="adm-main">
        <div className="adm-topbar">
          <div className="titles">
            <Link href="/students" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--fg-tertiary)", textDecoration: "none", marginBottom: 2 }}>
              <ArrowLeft style={{ width: 13, height: 13 }} />Stars
            </Link>
            <h1>{detail.fullName}</h1>
          </div>
          <div className="right" style={{ display: "flex", gap: 8 }}>
            {editing ? (
              <>
                <button className="ss-btn" type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>
                <button className="ss-btn ss-btn-primary" type="button" onClick={save} disabled={!canSave || saving}>
                  {saving ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Check className="ss-btn-icon" />}
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </>
            ) : (
              <>
                <button className="ss-btn" type="button" onClick={() => setDeleteOpen(true)} style={{ color: "var(--danger)" }}>
                  <Trash2 className="ss-btn-icon" />Delete
                </button>
                <button className="ss-btn ss-btn-primary" type="button" onClick={startEdit}>
                  <Pencil className="ss-btn-icon" />Edit profile
                </button>
              </>
            )}
          </div>
        </div>

        <div className="adm-content" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 760 }}>
          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 13 }}>
              <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />{error}
            </div>
          )}

          {/* identity header */}
          <div className="widget">
            <div className="widget-body" style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span className="ss-avatar" style={{ width: 52, height: 52, fontSize: 17, background: `var(--${slug}-fill)`, color: `var(--${slug})`, border: `0.5px solid var(--${slug}-border)`, flexShrink: 0 }}>
                {detail.initials}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 500 }}>{detail.fullName}</div>
                <div style={{ fontSize: 13, color: "var(--fg-secondary)", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span className={`ss-dot ${slug}`} />{detail.programName}
                </div>
              </div>
              <span className={`ss-badge ${badge.cls}`} style={{ flexShrink: 0 }}>
                <BadgeIcon />{badge.label}
              </span>
            </div>
          </div>

          {/* details */}
          <div className="widget">
            <div className="widget-head">
              <UserIcon className="ico" style={{ color: "var(--primary)" }} />
              <h3>Star details</h3>
            </div>
            <div className="widget-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              {field(
                "Full name",
                detail.fullName,
                <input type="text" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "Status",
                <span className={`ss-badge ${badge.cls}`}><BadgeIcon />{badge.label}</span>,
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {STATUSES.map((s) => (
                    <button key={s} type="button" className={`ss-chip${form.status === s ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, status: s }))}>
                      {STATUS_BADGE[s].label}
                    </button>
                  ))}
                </div>
              )}

              {field(
                "Program",
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className={`ss-dot ${slug}`} />{detail.programName}</span>,
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {programs.map((p) => {
                    const sel = form.programId === p.id;
                    return (
                      <button key={p.id} type="button" onClick={() => setForm((f) => ({ ...f, programId: p.id }))}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: "var(--r-pill)", cursor: "pointer", fontSize: 13,
                          border: `0.5px solid ${sel ? `var(--${p.slug}-border)` : "var(--border)"}`,
                          background: sel ? `var(--${p.slug}-fill)` : "var(--surface)",
                          color: sel ? `var(--${p.slug})` : "var(--fg-secondary)" }}>
                        <span className={`ss-dot ${p.slug}`} />{p.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {field(
                "Date of birth",
                detail.dateOfBirth ? fmtDate(detail.dateOfBirth) : detail.birthYear ? `b. ${detail.birthYear}` : "—",
                <input type="date" value={form.dob} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "Also enrolled in",
                detail.secondaryProgramName
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className={`ss-dot ${detail.secondaryProgramSlug}`} />{detail.secondaryProgramName}</span>
                  : "—",
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" className={`ss-chip${form.secondaryProgramId === "" ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, secondaryProgramId: "" }))}>None</button>
                  {programs.filter((p) => p.id !== form.programId).map((p) => {
                    const sel = form.secondaryProgramId === p.id;
                    return (
                      <button key={p.id} type="button" onClick={() => setForm((f) => ({ ...f, secondaryProgramId: sel ? "" : p.id }))}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: "var(--r-pill)", cursor: "pointer", fontSize: 13,
                          border: `0.5px solid ${sel ? `var(--${p.slug}-border)` : "var(--border)"}`,
                          background: sel ? `var(--${p.slug}-fill)` : "var(--surface)",
                          color: sel ? `var(--${p.slug})` : "var(--fg-secondary)" }}>
                        <span className={`ss-dot ${p.slug}`} />{p.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {field(
                "Service coordinator",
                detail.serviceCoordinator || "—",
                <input type="text" value={form.sc} placeholder="e.g. R. Alvarez" onChange={(e) => setForm((f) => ({ ...f, sc: e.target.value }))} style={inputStyle} />
              )}

              {/* read-only facts */}
              <div>
                <div className="ss-label" style={{ marginBottom: 6 }}>Start date</div>
                <div style={{ fontSize: 14, color: "var(--fg)", display: "flex", alignItems: "center", gap: 6 }}>
                  <CalendarDays style={{ width: 14, height: 14, color: "var(--fg-tertiary)" }} />{fmtDate(detail.startDate)}
                </div>
              </div>

              <div>
                <div className="ss-label" style={{ marginBottom: 6 }}>Attendance</div>
                <div style={{ fontSize: 14, color: "var(--fg)", display: "flex", alignItems: "center", gap: 6 }}>
                  <GraduationCap style={{ width: 14, height: 14, color: "var(--fg-tertiary)" }} />{detail.attendancePct}%
                </div>
              </div>

              {reportDue && (
                <div>
                  <div className="ss-label" style={{ marginBottom: 6 }}>Next Pathways report</div>
                  <div style={{ fontSize: 14, color: "var(--fg)", display: "flex", alignItems: "center", gap: 6 }}>
                    <CalendarDays style={{ width: 14, height: 14, color: "var(--fg-tertiary)" }} />
                    {reportDue.daysUntil <= 31 ? (
                      <span className="ss-date-expiring"><AlertTriangle />{reportDue.label} · {fmtDate(reportDue.due)} · in {reportDue.daysUntil} day{reportDue.daysUntil === 1 ? "" : "s"}</span>
                    ) : (
                      <span>{reportDue.label} · {fmtDate(reportDue.due)}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* intake information */}
          <div className="widget">
            <div className="widget-head">
              <FileText className="ico" style={{ color: "var(--primary)" }} />
              <h3>Intake information</h3>
            </div>
            <div className="widget-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              {field(
                "Guardian name",
                detail.guardianName || "—",
                <input type="text" value={form.guardianName} placeholder="e.g. Maria Rivera" onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "Guardian phone",
                detail.guardianPhone || "—",
                <input type="tel" value={form.guardianPhone} placeholder="(209) 555-0100" onChange={(e) => setForm((f) => ({ ...f, guardianPhone: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "Guardian email",
                detail.guardianEmail || "—",
                <input type="email" value={form.guardianEmail} placeholder="name@email.com" onChange={(e) => setForm((f) => ({ ...f, guardianEmail: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "Referral source",
                detail.referralSource || "—",
                <input type="text" value={form.referralSource} placeholder="e.g. VMRC, word of mouth" onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "T-shirt size",
                detail.tShirtSize || "—",
                <select value={form.tShirtSize} onChange={(e) => setForm((f) => ({ ...f, tShirtSize: e.target.value }))} style={{ ...inputStyle, width: "60%" }}>
                  <option value="">Not set</option>
                  {T_SHIRT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}

              {field(
                "POS / Authorization expires",
                authExpiryView(detail.authorizationExpiry),
                <input type="date" value={form.authExpiry} onChange={(e) => setForm((f) => ({ ...f, authExpiry: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "IPP expires",
                authExpiryView(detail.ippExpiry),
                <input type="date" value={form.ippExpiry} onChange={(e) => setForm((f) => ({ ...f, ippExpiry: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "Allergies",
                detail.allergies ? <span>{detail.allergies}{detail.allergyAnaphylactic && <span className="ss-badge is-attention" style={{ marginLeft: 6 }}><AlertTriangle />Anaphylactic</span>}</span> : "—",
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input type="text" value={form.allergies} placeholder="e.g. Wheat & gluten" onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))} style={inputStyle} />
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={form.anaphylactic} onChange={(e) => setForm((f) => ({ ...f, anaphylactic: e.target.checked }))} />
                    Anaphylactic
                  </label>
                </div>
              )}

              {field(
                "Areas of concern",
                detail.areasOfConcern || "—",
                <input type="text" value={form.areasOfConcern} placeholder="e.g. Sensitive - fire alarm" onChange={(e) => setForm((f) => ({ ...f, areasOfConcern: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "SC email",
                detail.serviceCoordinatorEmail || "—",
                <input type="email" value={form.scEmail} placeholder="name@vmrc.net" onChange={(e) => setForm((f) => ({ ...f, scEmail: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "SC phone",
                detail.serviceCoordinatorPhone || "—",
                <input type="tel" value={form.scPhone} placeholder="(209) 555-0100" onChange={(e) => setForm((f) => ({ ...f, scPhone: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "Contact in Remind",
                detail.contactInRemind || "—",
                <input type="text" value={form.remind} placeholder="Who's set up, and when" onChange={(e) => setForm((f) => ({ ...f, remind: e.target.value }))} style={inputStyle} />
              )}

              {field(
                "Intake docs submitted",
                detail.intakeDocsSubmitted ? <span className="ss-badge is-active"><CheckCircle2 />Yes</span> : <span className="ss-badge is-attention"><AlertCircle />No</span>,
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className={`ss-chip${form.intakeDocs ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, intakeDocs: true }))}>Yes</button>
                  <button type="button" className={`ss-chip${!form.intakeDocs ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, intakeDocs: false }))}>No</button>
                </div>
              )}

              {field(
                "High school diploma",
                detail.hasHighSchoolDiploma === null ? "—" : detail.hasHighSchoolDiploma ? "Yes" : "No",
                <select value={form.diploma} onChange={(e) => setForm((f) => ({ ...f, diploma: e.target.value as Form["diploma"] }))} style={{ ...inputStyle, width: "60%" }}>
                  <option value="">Not recorded</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              )}

              <div style={{ gridColumn: "1 / -1" }}>
                {field(
                  "Intake notes",
                  detail.intakeNotes || "—",
                  <textarea value={form.intakeNotes} rows={3} placeholder="Anything worth remembering from intake…" onChange={(e) => setForm((f) => ({ ...f, intakeNotes: e.target.value }))} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
                )}
              </div>
            </div>
          </div>

          {/* arts profile (Student Frame) */}
          <ArtsProfileWidget participantId={id} />

          {/* weekly tracker (monthly data + month-end levels) — framework follows enrollment */}
          <TrackerWidget
            participantId={id}
            tracks={[...new Set(
              [detail.programSlug, detail.secondaryProgramSlug]
                .filter((s): s is string => !!s)
                .map((s) => (s === "pathways" ? "Pathways" : "PartTime") as import("@/lib/types/api").ProgramTrack)
            )]}
          />

          {/* documents — intake paperwork with attached scans */}
          <DocumentsWidget key={id} participantId={id} initial={detail.documents} />
        </div>
      </div>

      {/* delete confirm */}
      {deleteOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
        >
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(400px, 100%)", border: "0.5px solid var(--border-hover)" }}>
            <div style={{ padding: "var(--space-4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ display: "inline-flex", width: 32, height: 32, borderRadius: "50%", background: "var(--danger-fill, #fce8e8)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Trash2 style={{ width: 16, height: 16, color: "var(--danger)" }} />
                </span>
                <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Delete star?</h3>
              </div>
              <p style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.5, margin: 0 }}>
                <strong>{detail.fullName}</strong> will be permanently removed, along with their attendance records. This can&apos;t be undone.
              </p>
            </div>
            <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ss-btn" type="button" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</button>
              <button className="ss-btn" type="button" onClick={doDelete} disabled={deleting} style={{ background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" }}>
                {deleting ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 className="ss-btn-icon" />}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
