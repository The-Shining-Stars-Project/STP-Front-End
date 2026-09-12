"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, AlertCircle, X, Search, Check } from "lucide-react";
import { participantsApi } from "@/lib/api/participants";
import { useParticipants, queryKeys } from "@/lib/api/hooks";
import type { ParticipantSummaryDto } from "@/lib/types/api";

export default function EnrollStudentModal({
  programId,
  programName,
  slug,
  onClose,
}: {
  programId: string;
  programName: string;
  slug: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const participantsQ = useParticipants();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only students who aren't already in this program can be enrolled.
  const enrollable = useMemo(() => {
    const all: ParticipantSummaryDto[] = participantsQ.data ?? [];
    const q = query.trim().toLowerCase();
    return all
      .filter((p) => p.programId !== programId)
      .filter((p) => q === "" || p.fullName.toLowerCase().includes(q));
  }, [participantsQ.data, programId, query]);

  async function enroll(p: ParticipantSummaryDto) {
    setBusyId(p.id);
    setError(null);
    try {
      await participantsApi.update(p.id, { programId });
      // These caches all hold participant lists — refetch them (#34).
      queryClient.invalidateQueries({ queryKey: queryKeys.participants });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: ["program-detail"] });
    } catch {
      setError(`Couldn't enroll ${p.fullName} — check that the backend is running and try again.`);
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
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(480px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "85vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Enroll student</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>Add a registered student to {programName}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-3) var(--space-4) var(--space-2)", flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--fg-tertiary)" }} />
            <input type="text" placeholder="Search students…" value={query} onChange={(e) => setQuery(e.target.value)} style={inputStyle} autoFocus />
          </div>
        </div>

        <div style={{ padding: "var(--space-1) var(--space-4)", overflowY: "auto" }}>
          {participantsQ.isPending ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>Loading students…</div>
          ) : enrollable.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>
              {query.trim()
                ? "No matching students to enroll."
                : <>Every registered student is already in this program. Register new students on the <Link href="/students" style={{ color: "var(--primary)" }}>Students</Link> page.</>}
            </div>
          ) : enrollable.map((p) => {
            const busy = busyId === p.id;
            return (
              <div className="list-row" key={p.id}>
                <span className="ss-avatar sm" style={{ background: `var(--${slug}-fill)`, color: `var(--${slug})`, border: `0.5px solid var(--${slug}-border)` }}>
                  {p.initials}
                </span>
                <div className="grow">
                  <div className="nm">{p.fullName}</div>
                  <div className="sub">{p.programName}</div>
                </div>
                <button
                  className="ss-btn ss-btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => enroll(p)}
                  style={{ minWidth: 96, justifyContent: "center" }}
                >
                  {busy ? "Enrolling…" : <><UserPlus className="ss-btn-icon" />Enroll</>}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ margin: "0 var(--space-4) var(--space-3)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}
        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <Link href="/students" style={{ fontSize: 12, color: "var(--fg-tertiary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Check style={{ width: 12, height: 12 }} />Register new students on the Students page
          </Link>
          <button className="ss-btn" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
