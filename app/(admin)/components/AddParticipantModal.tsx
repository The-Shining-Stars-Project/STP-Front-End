"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, AlertCircle, AlertTriangle, X } from "lucide-react";
import { participantsApi } from "@/lib/api/participants";
import { describeApiError } from "@/lib/api/client";
import { queryKeys, useMyPrograms, useParticipants, usePrograms } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useDialogFocus } from "@/lib/useDialogFocus";
import LoadError from "@/app/components/LoadError";
import TShirtSizeInput from "./TShirtSizeInput";
import type {
  ProgramSummaryDto,
  CreateParticipantDto,
  ParticipantDetailDto,
  ParticipantStatus,
} from "@/lib/types/api";
import ProgramPills from "./ProgramPills";
import { EmergencyContactsField, cleanContacts } from "./EmergencyContactsField";

type AddParticipantForm = {
  nm: string;
  preferredName: string;
  dob: string;
  /** yyyy-MM-dd; blank means "today" (the server default). */
  startDate: string;
  programId: string;
  status: "active" | "prospective" | "authpending" | "inquiry";
  sc: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  referralSource: string;
  tShirtSize: string;
  authExpiry: string;
  // Full intake — the same set the profile editor (_profile.tsx) offers, so a star can be
  // entered completely in one pass instead of "add, then open, then edit" (client ask, Sep 2026).
  ippExpiry: string;
  allergies: string;
  anaphylactic: boolean;
  areasOfConcern: string;
  scEmail: string;
  scPhone: string;
  remind: string;
  intakeDocs: boolean;
  diploma: "" | "yes" | "no";
  secondaryProgramId: string;
  intakeNotes: string;
  emergencyContacts: string[];
  // Self-Determination Program. "" = not answered.
  sdp: "" | "yes" | "no";
  sdpFms: string;
  sdpFacilitator: string;
  sdpFacilitatorEmail: string;
  sdpStartDate: string;
};

const EMPTY_FORM: AddParticipantForm = {
  nm: "", preferredName: "", dob: "", startDate: "", programId: "", status: "prospective", sc: "",
  guardianName: "", guardianPhone: "", guardianEmail: "", referralSource: "", tShirtSize: "", authExpiry: "",
  ippExpiry: "", allergies: "", anaphylactic: false, areasOfConcern: "", scEmail: "", scPhone: "", remind: "",
  intakeDocs: false, diploma: "", secondaryProgramId: "", intakeNotes: "", emergencyContacts: [""],
  sdp: "", sdpFms: "", sdpFacilitator: "", sdpFacilitatorEmail: "", sdpStartDate: "",
};

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  Active: "Active", Prospective: "Prospective", Attention: "Needs attention", Former: "Former",
  AuthPending: "Auth pending", Inquiry: "Inquiry", NotInterested: "Not interested",
};

/** Name key for the duplicate check: trimmed, single-spaced, case-insensitive. */
function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

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
  onCreated,
}: {
  /**
   * Every program. Admins choose from all of them; other managers only from their own (see below).
   * Callers pass `data ?? []`, so empty can also mean "still loading" or "failed"; the modal then
   * reads the programs query itself rather than claim there are no programs.
   */
  programs: ProgramSummaryDto[];
  onClose: () => void;
  defaultProgramId?: string;
  /**
   * Called with the new star after a successful create, just before the modal closes (onClose
   * still runs). The caller should show where the star went: the modal's default status is
   * Prospective while lists open on Active, so a silent close made new stars look lost (Oct 2026).
   */
  onCreated?: (created: ParticipantDetailDto) => void;
}) {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const myProgramsQ = useMyPrograms();
  // Same cache as the Stars page's list. Only consulted when the `programs` prop is empty.
  const allProgramsQ = usePrograms();
  // Cached list, for the duplicate-name check below.
  const participantsQ = useParticipants();
  const [form, setForm] = useState<AddParticipantForm>({ ...EMPTY_FORM, programId: defaultProgramId ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The name the duplicate warning was shown for; a second click on "Add anyway" confirms it.
  const [dupWarnedFor, setDupWarnedFor] = useState<string | null>(null);
  const panelRef = useDialogFocus<HTMLDivElement>();
  useEscapeKey(onClose, !saving);

  // Program choices. The API refuses (403) a star in a program the caller isn't assigned to, and
  // only admins are in every program — so everyone else picks from /programs/mine.
  // For admins, undefined = the list hasn't loaded (yet, or at all), which is not "no programs".
  const adminPrograms: ProgramSummaryDto[] | undefined = programs.length > 0 ? programs : allProgramsQ.data;
  const choices: ProgramSummaryDto[] = isAdmin ? (adminPrograms ?? []) : (myProgramsQ.data ?? []);
  const choicesReady = isAdmin ? adminPrograms !== undefined : myProgramsQ.isSuccess;
  const choiceIds = new Set(choices.map((p) => p.id));
  // A default the caller can't write to is dropped rather than left selected but invisible,
  // and a manager with exactly one program gets it picked for them.
  let programId = choicesReady && form.programId && !choiceIds.has(form.programId) ? "" : form.programId;
  if (!programId && choices.length === 1) programId = choices[0].id;
  const secondaryProgramId =
    form.secondaryProgramId && form.secondaryProgramId !== programId && (!choicesReady || choiceIds.has(form.secondaryProgramId))
      ? form.secondaryProgramId
      : "";

  // Duplicate check against the stars this user can see (soft-deleted ones aren't listed).
  const key = nameKey(form.nm);
  const duplicates = useMemo(
    () => (key ? (participantsQ.data ?? []).filter((p) => nameKey(p.fullName) === key) : []),
    [participantsQ.data, key]
  );
  const dupWarning = duplicates.length > 0 && dupWarnedFor === key;

  const canSubmit = form.nm.trim().length > 0 && programId !== "" && !saving;
  const submitHint = saving ? null : !form.nm.trim() ? "Enter the star's full name." : !programId ? "Choose a program." : null;

  async function handleSubmit() {
    // First click on a name that already exists only shows the warning; the second adds.
    if (duplicates.length > 0 && dupWarnedFor !== key) {
      setDupWarnedFor(key);
      setError(null);
      return;
    }
    const statusMap: Record<string, ParticipantStatus> = { active: "Active", prospective: "Prospective", authpending: "AuthPending", inquiry: "Inquiry" };
    const dto: CreateParticipantDto = {
      fullName: form.nm.trim(),
      preferredName: form.preferredName.trim() || undefined,
      initials: toInitials(form.nm),
      programId,
      status: statusMap[form.status] ?? "Prospective",
      dateOfBirth: form.dob || undefined,
      startDate: form.startDate || undefined,
      serviceCoordinator: form.sc.trim() || undefined,
      guardianName: form.guardianName.trim() || undefined,
      guardianPhone: form.guardianPhone.trim() || undefined,
      guardianEmail: form.guardianEmail.trim() || undefined,
      referralSource: form.referralSource.trim() || undefined,
      tShirtSize: form.tShirtSize || undefined,
      authorizationExpiry: form.authExpiry || undefined,
      ippExpiry: form.ippExpiry || undefined,
      allergies: form.allergies.trim() || undefined,
      allergyAnaphylactic: form.anaphylactic,
      areasOfConcern: form.areasOfConcern.trim() || undefined,
      serviceCoordinatorEmail: form.scEmail.trim() || undefined,
      serviceCoordinatorPhone: form.scPhone.trim() || undefined,
      contactInRemind: form.remind.trim() || undefined,
      intakeDocsSubmitted: form.intakeDocs,
      hasHighSchoolDiploma: form.diploma === "" ? undefined : form.diploma === "yes",
      secondaryProgramId: secondaryProgramId || undefined,
      intakeNotes: form.intakeNotes.trim() || undefined,
      emergencyContacts: cleanContacts(form.emergencyContacts),
      isSdpClient: form.sdp === "" ? undefined : form.sdp === "yes",
      sdpFmsName: form.sdp === "yes" ? form.sdpFms.trim() || undefined : undefined,
      sdpIndependentFacilitator: form.sdp === "yes" ? form.sdpFacilitator.trim() || undefined : undefined,
      sdpIndependentFacilitatorEmail: form.sdp === "yes" ? form.sdpFacilitatorEmail.trim() || undefined : undefined,
      sdpStartDate: form.sdp === "yes" ? form.sdpStartDate || undefined : undefined,
    };

    setSaving(true);
    setError(null);
    try {
      const created = await participantsApi.create(dto);
      // These caches all hold participant lists — refetch them (#34).
      queryClient.invalidateQueries({ queryKey: queryKeys.participants });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: ["program-detail"] });
      onCreated?.(created);
      onClose();
    } catch (err) {
      // The server's own message when it has one (a validation limit, a scope refusal). A 403
      // from the policy has no body, and used to read "check that the backend is running",
      // which invited retries.
      setError(describeApiError(err, "Could not save the star. Try again, and tell an admin if it keeps failing."));
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
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="add-star-title" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(560px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 id="add-star-title" style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Add star</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", minWidth: 34, minHeight: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 2 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>Full name <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
              <input type="text" placeholder="e.g. Jordan Rivera" value={form.nm} onChange={(e) => setForm((f) => ({ ...f, nm: e.target.value }))} style={inputStyle} autoFocus />
            </div>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>Preferred name</div>
              <input type="text" placeholder="e.g. JJ" value={form.preferredName} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, preferredName: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>Date of birth <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
              <input type="date" value={form.dob} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>Start date <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Defaults to today</span></div>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Program <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            {!isAdmin && myProgramsQ.isPending ? (
              <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>Loading your programs…</div>
            ) : !isAdmin && myProgramsQ.isError ? (
              <LoadError title="Couldn't load your programs" error={myProgramsQ.error} onRetry={() => myProgramsQ.refetch()} />
            ) : isAdmin && !adminPrograms && allProgramsQ.isError ? (
              <LoadError title="Couldn't load programs" error={allProgramsQ.error} onRetry={() => allProgramsQ.refetch()} />
            ) : isAdmin && !adminPrograms ? (
              <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>Loading programs…</div>
            ) : choices.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--fg-secondary)" }}>
                {isAdmin
                  ? "No programs yet — create one on the Programs page first."
                  : "You aren't assigned to a program yet, so you can't add a star. An admin can add you from a program's Manage staff button."}
              </div>
            ) : (
              <ProgramPills
                programs={choices}
                value={programId || null}
                onChange={(id) => setForm((f) => ({ ...f, programId: id ?? "", secondaryProgramId: f.secondaryProgramId === id ? "" : f.secondaryProgramId }))}
              />
            )}
          </div>

          {/* A second program only makes sense when there is another program to choose. */}
          {choices.length > 1 && (
            <div>
              <div className="ss-label" style={{ marginBottom: 8 }}>Also enrolled in <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional — second program</span></div>
              <ProgramPills
                programs={choices}
                value={secondaryProgramId || null}
                onChange={(id) => setForm((f) => ({ ...f, secondaryProgramId: id ?? "" }))}
                allLabel="None"
                exclude={programId ? [programId] : []}
              />
            </div>
          )}

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Status</div>
            <div style={{ display: "flex", gap: 6 }}>
              {([["inquiry", "Inquiry"], ["prospective", "Prospective"], ["active", "Active"], ["authpending", "Auth pending"]] as const).map(([s, label]) => (
                <button key={s} type="button" className={`ss-chip${form.status === s ? " is-active" : ""}`} aria-pressed={form.status === s} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, status: s }))}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Service coordinator</div>
            <input type="text" placeholder="e.g. R. Alvarez" value={form.sc} onChange={(e) => setForm((f) => ({ ...f, sc: e.target.value }))} style={inputStyle} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>SC email</div>
              <input type="email" placeholder="name@vmrc.net" value={form.scEmail} onChange={(e) => setForm((f) => ({ ...f, scEmail: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>SC phone</div>
              <input type="tel" placeholder="(209) 555-0100" value={form.scPhone} onChange={(e) => setForm((f) => ({ ...f, scPhone: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          {/* Self-Determination Program */}
          <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: "var(--space-3)" }}>
            <div className="ss-label" style={{ marginBottom: 8 }}>Is this an SDP client?</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className={`ss-chip${form.sdp === "yes" ? " is-active" : ""}`} aria-pressed={form.sdp === "yes"} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, sdp: "yes" }))}>Yes</button>
              <button type="button" className={`ss-chip${form.sdp === "no" ? " is-active" : ""}`} aria-pressed={form.sdp === "no"} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, sdp: "no" }))}>No</button>
            </div>
          </div>

          {form.sdp === "yes" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="ss-label" style={{ marginBottom: 6 }}>FMS</div>
                  <input type="text" placeholder="Financial Management Service" value={form.sdpFms} onChange={(e) => setForm((f) => ({ ...f, sdpFms: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="ss-label" style={{ marginBottom: 6 }}>Independent Facilitator</div>
                  <input type="text" placeholder="Name" value={form.sdpFacilitator} onChange={(e) => setForm((f) => ({ ...f, sdpFacilitator: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <div className="ss-label" style={{ marginBottom: 6 }}>Independent Facilitator email</div>
                <input type="email" placeholder="name@email.com" value={form.sdpFacilitatorEmail} onChange={(e) => setForm((f) => ({ ...f, sdpFacilitatorEmail: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div className="ss-label" style={{ marginBottom: 6 }}>SDP start date <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Always the first of the month</span></div>
                <input type="date" value={form.sdpStartDate} onChange={(e) => setForm((f) => ({ ...f, sdpStartDate: e.target.value }))} style={{ ...inputStyle, width: "55%" }} />
              </div>
            </>
          )}

          <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: "var(--space-3)" }}>
            <div className="ss-label" style={{ marginBottom: 6 }}>Guardian name</div>
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
            <div className="ss-label" style={{ marginBottom: 6 }}>Emergency contacts <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Up to 5 — name and phone together</span></div>
            <EmergencyContactsField value={form.emergencyContacts} onChange={(next) => setForm((f) => ({ ...f, emergencyContacts: next }))} inputStyle={inputStyle} />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Referral source <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <input type="text" placeholder="e.g. VMRC, word of mouth" value={form.referralSource} onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))} style={inputStyle} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>T-shirt size</div>
              <TShirtSizeInput value={form.tShirtSize} onChange={(v) => setForm((f) => ({ ...f, tShirtSize: v }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>POS authorization expires</div>
              <input type="date" value={form.authExpiry} onChange={(e) => setForm((f) => ({ ...f, authExpiry: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>IPP expires</div>
              <input type="date" value={form.ippExpiry} onChange={(e) => setForm((f) => ({ ...f, ippExpiry: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          {/* Health & intake — previously only reachable from the profile's Edit mode. */}
          <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: "var(--space-3)" }}>
            <div className="ss-label" style={{ marginBottom: 6 }}>Allergies <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <input type="text" placeholder="e.g. Wheat & gluten" value={form.allergies} onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))} style={inputStyle} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-secondary)", cursor: "pointer", marginTop: 6 }}>
              <input type="checkbox" checked={form.anaphylactic} onChange={(e) => setForm((f) => ({ ...f, anaphylactic: e.target.checked }))} />
              Anaphylactic
            </label>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Areas of concern <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <input type="text" placeholder="e.g. Sensitive - fire alarm" value={form.areasOfConcern} onChange={(e) => setForm((f) => ({ ...f, areasOfConcern: e.target.value }))} style={inputStyle} />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Contact in Remind</div>
            <input type="text" placeholder="Who's set up, and when" value={form.remind} onChange={(e) => setForm((f) => ({ ...f, remind: e.target.value }))} style={inputStyle} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 8 }}>Intake docs submitted</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className={`ss-chip${form.intakeDocs ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, intakeDocs: true }))}>Yes</button>
                <button type="button" className={`ss-chip${!form.intakeDocs ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, intakeDocs: false }))}>No</button>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>High school diploma</div>
              <select value={form.diploma} onChange={(e) => setForm((f) => ({ ...f, diploma: e.target.value as AddParticipantForm["diploma"] }))} style={inputStyle}>
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Intake notes <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <textarea rows={5} placeholder="Anything worth remembering from intake…" value={form.intakeNotes} onChange={(e) => setForm((f) => ({ ...f, intakeNotes: e.target.value }))} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        </div>

        {dupWarning && (
          <div role="alert" style={{ margin: "var(--space-2) var(--space-4) 0", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--warning-fill)", color: "var(--warning-text)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            <span>
              A star named <strong>{duplicates[0].fullName}</strong> already exists (
              {duplicates.map((d) => `${STATUS_LABEL[d.status] ?? d.status}, ${d.programName}`).join("; ")}
              ). Add anyway?
            </span>
          </div>
        )}
        {error && (
          <div role="alert" style={{ margin: "var(--space-2) var(--space-4) 0", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}
        <div style={{ padding: "var(--space-3) var(--space-4)", marginTop: "var(--space-2)", borderTop: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          {/* Says why the button is disabled instead of leaving it to look broken. */}
          {submitHint && <span style={{ fontSize: 12, color: "var(--fg-tertiary)", marginRight: "auto" }}>{submitHint}</span>}
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={handleSubmit} disabled={!canSubmit}>
            <UserPlus className="ss-btn-icon" />
            {saving ? "Saving…" : dupWarning ? "Add anyway" : "Add star"}
          </button>
        </div>
      </div>
    </div>
  );
}
