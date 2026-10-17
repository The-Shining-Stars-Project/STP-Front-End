"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, X, Search, Check, CheckCircle2, Plus, ArrowRightLeft } from "lucide-react";
import { participantsApi } from "@/lib/api/participants";
import { describeApiError } from "@/lib/api/client";
import { useParticipants, usePrograms, queryKeys } from "@/lib/api/hooks";
import { programTint } from "@/lib/programColor";
import { starDisplayName } from "@/lib/starName";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useDialogFocus } from "@/lib/useDialogFocus";
import LoadError from "@/app/components/LoadError";
import type { ParticipantStatus, ParticipantSummaryDto } from "@/lib/types/api";

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  Active: "Active", Prospective: "Prospective", Attention: "Needs attention", Former: "Former",
  AuthPending: "Auth pending", Inquiry: "Inquiry", NotInterested: "Not interested",
};

/** A program dot that always sits next to the program's name — colour is never the only signal. */
function ProgramDot({ colorHex }: { colorHex: string | undefined }) {
  return <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: programTint(colorHex).accent, flexShrink: 0, display: "inline-block" }} />;
}

/**
 * "Enroll star" on a program page.
 *
 * A star can be in two programs: a main one and a second one (dual enrolment). This modal used
 * to list every star whose MAIN program wasn't this one, then send { programId } — which moved
 * them, so enrolling a Pathways star into PT silently dropped Pathways (Oct 2026). Now stars
 * already here either way are left out, and every other star gets two explicit actions: add this
 * as their second program, or move their main program here (confirmed, naming the program they
 * leave).
 */
export default function EnrollStudentModal({
  programId,
  programName,
  onClose,
}: {
  programId: string;
  programName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const participantsQ = useParticipants();
  const programsQ = usePrograms();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmMoveId, setConfirmMoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const panelRef = useDialogFocus<HTMLDivElement>();
  // Escape backs out of an open "Move here" confirmation first, then closes.
  useEscapeKey(() => (confirmMoveId ? setConfirmMoveId(null) : onClose()), busyId === null);

  const colorById = useMemo(
    () => new Map((programsQ.data ?? []).map((p) => [p.id, p.colorHex])),
    [programsQ.data]
  );

  // Stars already in this program — as their main OR their second program — aren't offered.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (participantsQ.data ?? [])
      .filter((p) => p.programId !== programId && p.secondaryProgramId !== programId)
      .filter((p) => q === "" || p.fullName.toLowerCase().includes(q) || (p.preferredName ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [participantsQ.data, programId, query]);

  async function enroll(p: ParticipantSummaryDto, kind: "second" | "move") {
    setBusyId(p.id);
    setError(null);
    setNotice(null);
    try {
      if (kind === "second") await participantsApi.addSecondProgram(p.id, programId);
      else await participantsApi.moveMainProgram(p.id, programId);
      setConfirmMoveId(null);
      setNotice(
        kind === "second"
          ? `${p.fullName} is now also in ${programName} as their second program. Their main program is still ${p.programName}.`
          : `Moved ${p.fullName} to ${programName}. They are no longer in ${p.programName}.`
      );
      // These caches all hold participant lists or enrolment counts — refetch them (#34). Awaited
      // so the row stays busy until the refreshed list drops the star.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.participants }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programs }),
        queryClient.invalidateQueries({ queryKey: ["program-detail"] }),
      ]);
    } catch (err) {
      setError(describeApiError(
        err,
        kind === "second"
          ? `Couldn't add ${p.fullName} to ${programName}. Try again.`
          : `Couldn't move ${p.fullName} to ${programName}. Try again.`
      ));
    } finally {
      setBusyId(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
    padding: "8px 12px 8px 32px", fontSize: 13, color: "var(--fg)",
    background: "var(--surface)", outline: "none",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="enroll-star-title" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(560px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "85vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 id="enroll-star-title" style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Enroll star</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
              Add a registered star to {programName} as their second program, or move their main program here.
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", minWidth: 34, minHeight: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-sm)", flexShrink: 0 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-3) var(--space-4) var(--space-2)", flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--fg-tertiary)" }} />
            <input type="text" placeholder="Search stars…" aria-label="Search stars" value={query} onChange={(e) => setQuery(e.target.value)} style={inputStyle} autoFocus />
          </div>
        </div>

        <div style={{ padding: "var(--space-1) var(--space-4)", overflowY: "auto" }}>
          {participantsQ.isPending ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>Loading stars…</div>
          ) : participantsQ.isError ? (
            <div style={{ padding: "12px 0" }}>
              <LoadError title="Couldn't load stars" error={participantsQ.error} onRetry={() => participantsQ.refetch()} />
            </div>
          ) : candidates.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>
              {query.trim()
                ? "No matching stars outside this program."
                : <>Every star you can see is already in {programName}. Add new stars on the <Link href="/students" style={{ color: "var(--primary)" }}>Stars</Link> page.</>}
            </div>
          ) : candidates.map((p) => {
            const busy = busyId === p.id;
            const confirming = confirmMoveId === p.id;
            // One second program per star: a different one already set blocks "Add as second program".
            const hasOtherSecond = p.secondaryProgramId !== null;
            const noteId = `enroll-second-note-${p.id}`;
            const tint = programTint(colorById.get(p.programId));
            return (
              <div className="list-row" key={p.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
                  <span className="ss-avatar sm" style={{ background: tint.fill, color: tint.text, border: `0.5px solid ${tint.border}` }}>
                    {p.initials}
                  </span>
                  <div className="grow">
                    <div className="nm">{starDisplayName(p.fullName, p.preferredName)}</div>
                    <div className="sub" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <ProgramDot colorHex={colorById.get(p.programId)} />Main: {p.programName}
                      </span>
                      {p.secondaryProgramId && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          · <ProgramDot colorHex={colorById.get(p.secondaryProgramId)} />Second: {p.secondaryProgramName ?? "another program"}
                        </span>
                      )}
                      <span>· {STATUS_LABEL[p.status] ?? p.status}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 40 }}>
                  <button
                    className="ss-btn ss-btn-primary"
                    type="button"
                    disabled={busy || hasOtherSecond}
                    aria-describedby={hasOtherSecond ? noteId : undefined}
                    onClick={() => enroll(p, "second")}
                  >
                    <Plus className="ss-btn-icon" />
                    {busy && !confirming ? "Saving…" : "Add as second program"}
                  </button>
                  <button
                    className="ss-btn"
                    type="button"
                    disabled={busy}
                    aria-expanded={confirming}
                    onClick={() => setConfirmMoveId(confirming ? null : p.id)}
                  >
                    <ArrowRightLeft className="ss-btn-icon" />
                    Move here
                  </button>
                </div>
                {hasOtherSecond && (
                  <div id={noteId} style={{ paddingLeft: 40, fontSize: 12, color: "var(--fg-tertiary)" }}>
                    Already has a second program ({p.secondaryProgramName ?? "another program"}). A star can be in two programs at most — remove that one on their profile first, or move their main program here.
                  </div>
                )}

                {confirming && (
                  <div
                    role="group"
                    aria-label={`Confirm moving ${p.fullName}`}
                    style={{ marginLeft: 40, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--warning-fill)", color: "var(--warning-text)", fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <span>
                      Move {p.fullName}&apos;s main program from <strong>{p.programName}</strong> to <strong>{programName}</strong>? They will leave {p.programName}
                      {p.secondaryProgramName ? ` (their second program, ${p.secondaryProgramName}, stays)` : ""}.
                      {!hasOtherSecond && " To keep them in both, use Add as second program instead."}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="ss-btn ss-btn-primary" type="button" disabled={busy} onClick={() => enroll(p, "move")}>
                        {busy ? "Moving…" : `Move to ${programName}`}
                      </button>
                      <button className="ss-btn" type="button" disabled={busy} onClick={() => setConfirmMoveId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {notice && (
          <div role="status" style={{ margin: "var(--space-2) var(--space-4) 0", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--success-fill)", color: "var(--success-text)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <CheckCircle2 style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" style={{ margin: "var(--space-2) var(--space-4) 0", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}
        <div style={{ padding: "var(--space-3) var(--space-4)", marginTop: "var(--space-2)", borderTop: "0.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>
          <Link href="/students" style={{ fontSize: 12, color: "var(--fg-tertiary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Check style={{ width: 12, height: 12 }} />Add new stars on the Stars page
          </Link>
          <button className="ss-btn" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
