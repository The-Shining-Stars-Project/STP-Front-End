"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users2, Check, Copy, AlertTriangle } from "lucide-react";
import { rosterApi } from "@/lib/api/roster";
import { describeApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useMyPrograms, useReferenceLists, useStaff } from "@/lib/api/hooks";
import { isTeachingRole } from "@/lib/staffRoles";
import { programTint } from "@/lib/programColor";
import StarStatusFilter, { DEFAULT_STAR_STATUS_FILTER, starStatusMatches, type StarStatusFilterValue } from "../components/StarStatusFilter";
import type {
  ProgramSummaryDto,
  RosterEntryDto,
  SiteDto,
  StarGroupDto,
  StaffSummaryDto,
} from "@/lib/types/api";

const QUARTERS = [1, 2, 3, 4];
/** localStorage: terms ("Q4 2026") already copied forward from this browser. */
const COPIED_TERMS_KEY = "roster.copiedTerms";

// Stable fallbacks, so a list that hasn't loaded yet doesn't change identity every render.
const NO_STAFF: StaffSummaryDto[] = [];
const NO_PROGRAMS: ProgramSummaryDto[] = [];

const selectStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
  padding: "5px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)",
  outline: "none", width: "100%", maxWidth: 180,
};

// Text-style button inside a banner; still a 34px tap target.
const linkButton: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", minHeight: 34 };

/**
 * The option that keeps a row's current assignee readable when the picker no longer offers
 * them — a former staff member, or a coordinator/admin assigned before the picker was limited
 * to teaching staff (Oct 2026).
 */
function currentAssigneeLabel(id: string, name: string | null, staff: StaffSummaryDto[]): string {
  const member = staff.find((s) => s.id === id);
  if (!member) return `${name ?? "Former staff"} (former)`;
  return member.isFormer ? `${member.fullName} (former)` : `${member.fullName} (not a teacher)`;
}

/**
 * Saves for one row run one after another. Two quick edits on a row with nothing saved yet
 * both used to INSERT, and the second failed on the unique index (409). `isLatest` tells a
 * reply whether a newer edit is queued behind it, so an older reply never puts back a value
 * the user has since changed.
 */
function useSaveQueue() {
  const chains = useRef(new Map<string, { tail: Promise<void>; seq: number }>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const enqueue = useCallback((key: string, task: (isLatest: () => boolean) => Promise<void>) => {
    const prev = chains.current.get(key);
    const seq = (prev?.seq ?? 0) + 1;
    const isLatest = () => chains.current.get(key)?.seq === seq;
    const tail = (prev?.tail ?? Promise.resolve()).then(() => task(isLatest)).catch((err) => console.error("Roster save failed:", err));
    chains.current.set(key, { tail, seq });
    setPending((s) => new Set(s).add(key));
    void tail.then(() => {
      if (!isLatest()) return;
      chains.current.delete(key);
      setPending((s) => { const next = new Set(s); next.delete(key); return next; });
    });
  }, []);
  return { enqueue, pending };
}

export default function RosterPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const term = `Q${quarter} ${year}`;

  const { canManage } = useAuth();
  const [entries, setEntries] = useState<RosterEntryDto[]>([]);
  // Cached + shared via React Query (#34).
  const lists = useReferenceLists().data;
  const sites: SiteDto[] = lists?.sites ?? [];
  const groups: StarGroupDto[] = lists?.starGroups ?? [];
  const staff = useStaff().data ?? NO_STAFF;
  const programs = useMyPrograms().data ?? NO_PROGRAMS;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const { enqueue, pending } = useSaveQueue();
  // A failed save keeps the table on screen and says so here (it used to replace the whole
  // table with "Couldn't load the roster").
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  // Stamped with the term it answers, so it never describes a quarter that is no longer on screen.
  const [copyResult, setCopyResult] = useState<{ term: string; text: string; error: boolean } | null>(null);
  // Terms already copied forward from this browser. Rows still unplaced afterwards had no
  // earlier quarter to copy from, so offering the button again would only report "nothing to
  // copy" — remembered across visits, or it came back on every page load.
  const [copiedTerms, setCopiedTerms] = useState<ReadonlySet<string>>(() => {
    try {
      const raw = localStorage.getItem(COPIED_TERMS_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const [statusFilter, setStatusFilter] = useState<StarStatusFilterValue>(DEFAULT_STAR_STATUS_FILTER);

  // The picker offers current teaching staff only (Teacher, Teacher Assistant). Anyone else
  // stays visible only where they are already the assignment, so an old roster still reads
  // correctly without offering them for new ones.
  const pickableStaff = useMemo(() => staff.filter((m) => !m.isFormer && isTeachingRole(m.role)), [staff]);
  const colorByProgram = useMemo(() => new Map(programs.map((p) => [p.id, p.colorHex])), [programs]);

  // Reference lists + staff load once.
  // Roster reloads on term change, and after a copy-forward.
  useEffect(() => {
    let active = true;
    rosterApi.get(year, quarter)
      .then((e) => { if (active) { setEntries(e); setLoadError(null); } })
      .catch((err) => { if (active) setLoadError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year, quarter, reload]);

  // Term changes flip the loading flag here, not inside the effect, so the effect only
  // starts the request (react-hooks/set-state-in-effect).
  function changeTerm(nextYear: number, nextQuarter: number) {
    setLoading(true);
    setSaveError(null);
    setYear(nextYear);
    setQuarter(nextQuarter);
  }

  // A dual-enrolled Star has one row per program (each with its own placement), so rows
  // are identified by participant + program, not participant alone.
  const rowKey = (e: { participantId: string; programId: string }) => `${e.participantId}:${e.programId}`;
  const sameRow = (a: RosterEntryDto, b: RosterEntryDto) => rowKey(a) === rowKey(b) && a.year === b.year && a.quarter === b.quarter;

  function save(entry: RosterEntryDto, patch: Partial<RosterEntryDto>) {
    if (!canManage) return;
    const merged = { ...entry, ...patch };
    setEntries((prev) => prev.map((e) => (sameRow(e, entry) ? merged : e)));
    setSaveError(null);
    enqueue(rowKey(entry), async (isLatest) => {
      try {
        const saved = await rosterApi.upsert({
          participantId: entry.participantId,
          programId: entry.programId,
          year: entry.year, quarter: entry.quarter,
          siteIds: merged.siteIds,
          starGroupId: merged.starGroupId,
          assignedStaffId: merged.assignedStaffId,
          countedInRatio: merged.countedInRatio,
          notes: merged.notes,
        });
        if (isLatest()) setEntries((prev) => prev.map((e) => (sameRow(e, saved) ? saved : e)));
      } catch (err) {
        // Roll back what this edit changed (unless a later edit has changed it again) and say
        // so — a silently kept optimistic value is how "assigned staff doesn't populate"
        // happened (the save had never landed).
        setEntries((prev) => prev.map((e) => {
          if (!sameRow(e, entry)) return e;
          const reverted: Record<string, unknown> = { ...e };
          for (const k of Object.keys(patch) as (keyof RosterEntryDto)[]) if (e[k] === merged[k]) reverted[k] = entry[k];
          return reverted as unknown as RosterEntryDto;
        }));
        setSaveError(`Couldn't save ${entry.participantName}'s ${entry.programName} row: ${describeApiError(err, "the change was not saved. Try again.")}`);
      }
    });
  }

  async function copyForward(unplaced: number) {
    const target = { year, quarter, term, unplaced };
    setCopying(true);
    try {
      const { copied } = await rosterApi.copyForward(target.year, target.quarter);
      // The copy can also refill pipeline stars who had an earlier row, so this is approximate.
      const left = Math.max(0, target.unplaced - copied);
      setCopyResult({
        term: target.term,
        error: false,
        text: copied === 0
          ? "Nothing to copy: none of the unplaced stars has an assignment in an earlier quarter."
          : `Copied ${copied} assignment${copied === 1 ? "" : "s"} from earlier quarters.`
            + (left > 0 ? ` ${left} star${left === 1 ? "" : "s"} had no earlier quarter to copy from; set ${left === 1 ? "it" : "them"} here.` : ""),
      });
      setCopiedTerms((prev) => {
        const next = new Set(prev).add(target.term);
        try { localStorage.setItem(COPIED_TERMS_KEY, JSON.stringify([...next])); } catch { /* private mode: per visit only */ }
        return next;
      });
      setReload((n) => n + 1);
    } catch (err) {
      setCopyResult({ term: target.term, error: true, text: describeApiError(err, "Couldn't copy the assignments. Try again.") });
    } finally {
      setCopying(false);
    }
  }
  const copyMessage = copyResult?.term === term ? copyResult : null;

  // Group by program (stable dimension) so rows don't jump while a site is being assigned.
  const visible = useMemo(() => entries.filter((e) => starStatusMatches(e.status, statusFilter)), [entries, statusFilter]);

  const byProgram = useMemo(() => {
    const map = new Map<string, { id: string; name: string; rows: RosterEntryDto[] }>();
    for (const e of visible) {
      if (!map.has(e.programId)) map.set(e.programId, { id: e.programId, name: e.programName || "No program", rows: [] });
      map.get(e.programId)!.rows.push(e);
    }
    for (const g of map.values()) g.rows.sort((a, b) => a.participantName.localeCompare(b.participantName));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [visible]);

  const assigned = visible.filter((e) => e.starGroupId && e.siteIds.length > 0).length;
  // Rows with nothing saved for this term: every row in the first days of a new quarter (Oct 1
  // 2026 blanked every Assigned staff). Copy-forward fills these gaps only and never overwrites a
  // placed row, so it stays on offer after a coordinator has set some rows by hand; gating it on
  // an EMPTY term hid it for good after one save. Counted over every row, not just the status
  // Counted over the stars a coordinator places (Active, Needs Attention, Auth Pending — the
  // default filter), not pipeline or former stars, who are never placed and would keep the
  // banner up forever. Offered for this quarter and later ones only, so browsing history never
  // invites rewriting it.
  const unplacedCount = useMemo(
    () => entries.filter((e) => e.assignmentId === null && starStatusMatches(e.status, DEFAULT_STAR_STATUS_FILTER)).length,
    [entries]);
  const placeableCount = useMemo(
    () => entries.filter((e) => starStatusMatches(e.status, DEFAULT_STAR_STATUS_FILTER)).length,
    [entries]);
  const thisQuarter = Math.floor(now.getMonth() / 3) + 1;
  const isPastTerm = year < now.getFullYear() || (year === now.getFullYear() && quarter < thisQuarter);
  const offerCopy = canManage && !loading && !loadError && unplacedCount > 0 && !isPastTerm && !copiedTerms.has(term);

  // A Star can attend more than one site in a term (client ask, Sep 2026). Click a chip to
  // add or remove it; the first listed is the primary site everything single-site shows.
  function toggleSite(entry: RosterEntryDto, siteId: string) {
    const has = entry.siteIds.includes(siteId);
    const siteIds = has ? entry.siteIds.filter((id) => id !== siteId) : [...entry.siteIds, siteId];
    const siteNames = siteIds.map((id) => sites.find((s) => s.id === id)?.name ?? "").filter(Boolean);
    save(entry, { siteIds, siteNames, siteId: siteIds[0] ?? null, siteName: siteNames[0] ?? null });
  }
  const counted = visible.filter((e) => e.countedInRatio).length;

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Roster &amp; Assignments</h1>
        </div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <StarStatusFilter value={statusFilter} onChange={setStatusFilter} />
          {QUARTERS.map((qn) => (
            <button key={qn} type="button" className={`ss-chip${quarter === qn ? " is-active" : ""}`} aria-pressed={quarter === qn} style={{ cursor: "pointer" }} onClick={() => changeTerm(year, qn)}>
              Q{qn}
            </button>
          ))}
          <input
            type="number"
            value={year}
            onChange={(e) => changeTerm(Number(e.target.value) || year, quarter)}
            style={{ ...selectStyle, width: 80, maxWidth: 80, padding: "6px 8px" }}
            aria-label="Year"
          />
        </div>
      </div>

      <div className="adm-content">
        <div className="info-note" style={{ marginBottom: "var(--space-2)" }}>
          <Users2 />
          <span>
            Each star&apos;s Group, Site, and assigned staff for <strong>{term}</strong>. Every quarter keeps its own
            assignments and history is preserved, so a new quarter starts empty
            {canManage
              ? <> until you copy assignments forward from earlier quarters or set them here. Changes save automatically.</>
              : <> until a coordinator copies assignments forward or sets them. Only coordinators and admins can change assignments.</>}
          </span>
        </div>

        {offerCopy && (
          <div className="ss-alert is-info" style={{ marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
            <Copy />
            <span className="ss-alert-text">
              <strong>
                {unplacedCount === placeableCount
                  ? <>No assignments yet for {term}.</>
                  : <>{unplacedCount} of {placeableCount} stars {unplacedCount === 1 ? "has" : "have"} nothing set for {term} yet.</>}
              </strong>{" "}
              Copy each unplaced star&apos;s group, sites, assigned staff, 1:6 and notes from their most recent earlier
              quarter. Rows already set for {term} are not changed.
            </span>
            <button type="button" className="ss-btn" onClick={() => copyForward(unplacedCount)} disabled={copying}>
              {copying ? "Copying…" : `Fill ${unplacedCount} unplaced star${unplacedCount === 1 ? "" : "s"} from their most recent earlier quarter`}
            </button>
          </div>
        )}
        {copyMessage && (
          <div className={`ss-alert ${copyMessage.error ? "is-danger" : "is-info"}`} role={copyMessage.error ? "alert" : "status"} style={{ marginBottom: "var(--space-2)" }}>
            {copyMessage.error ? <AlertTriangle /> : <Check />}
            <span className="ss-alert-text">{copyMessage.text}</span>
            <button type="button" className="ss-alert-action" style={linkButton} onClick={() => setCopyResult(null)}>Dismiss</button>
          </div>
        )}
        {saveError && (
          <div className="ss-alert is-danger" role="alert" style={{ marginBottom: "var(--space-2)" }}>
            <AlertTriangle />
            <span className="ss-alert-text">{saveError}</span>
            <button type="button" className="ss-alert-action" style={linkButton} onClick={() => setSaveError(null)}>Dismiss</button>
          </div>
        )}

        <div className="board-stats">
          <div className="board-stat"><span className="num">{entries.length}</span><span className="label">Stars</span></div>
          <div className="board-stat"><span className="num green">{assigned}</span><span className="label">Fully Assigned</span></div>
          <div className="board-stat"><span className="num">{counted}</span><span className="label">Counted 1:6</span></div>
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading roster…</div>
        ) : loadError ? (
          <div role="alert" style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            Couldn&apos;t load the roster: {describeApiError(loadError, "check your connection and try again.")}
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>No stars yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            {byProgram.map((prog) => (
              <div key={prog.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-2)" }}>
                  <span className="ss-dot" style={{ background: programTint(colorByProgram.get(prog.id)).accent }} />
                  <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", margin: 0 }}>{prog.name}</h3>
                  <span style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>{prog.rows.length}</span>
                </div>

                <div style={{ overflowX: "auto", border: "0.5px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                    <thead>
                      <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                        {["Star", "Group", "Site", "Assigned staff", "1:6", "Notes"].map((h) => (
                          <th key={h} className="ss-label" style={{ textAlign: "left", padding: "8px 12px", color: "var(--fg-tertiary)", fontWeight: "var(--w-regular)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {prog.rows.map((e) => (
                        <tr key={rowKey(e)} style={{ borderBottom: "0.5px solid var(--border)" }}>
                          <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <span className="ss-avatar teacher sm">{e.participantInitials}</span>
                              <span style={{ fontSize: "var(--fs-body)" }}>{e.participantName}</span>
                              {e.isSecondaryEnrollment && (
                                <span className="ss-meta" style={{ color: "var(--fg-tertiary)" }} title="Dual enrollment — this is the Star's second program">also enrolled</span>
                              )}
                              {pending.has(rowKey(e)) && <Check style={{ width: 12, height: 12, color: "var(--success)" }} />}
                            </span>
                          </td>
                          <td style={{ padding: "6px 12px" }}>
                            <select style={selectStyle} disabled={!canManage} value={e.starGroupId ?? ""} onChange={(ev) => save(e, { starGroupId: ev.target.value || null })}>
                              <option value="">—</option>
                              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "6px 12px" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }} title="Click to add or remove a site. The first is the primary.">
                              {sites.map((s) => {
                                const on = e.siteIds.includes(s.id);
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className={`ss-chip${on ? " is-active" : ""}`}
                                    aria-pressed={on}
                                    onClick={() => toggleSite(e, s.id)}
                                    disabled={!canManage}
                                    style={{ cursor: canManage ? "pointer" : "default", fontSize: 11, padding: "2px 8px" }}
                                  >
                                    {s.name}
                                  </button>
                                );
                              })}
                              {sites.length === 0 && <span style={{ color: "var(--fg-tertiary)", fontSize: 12 }}>No sites yet</span>}
                            </div>
                          </td>
                          <td style={{ padding: "6px 12px" }}>
                            <select style={selectStyle} disabled={!canManage} value={e.assignedStaffId ?? ""} onChange={(ev) => save(e, { assignedStaffId: ev.target.value || null, assignedStaffName: staff.find((m) => m.id === ev.target.value)?.fullName ?? null })}
                              aria-label={`Assigned staff for ${e.participantName}`}
                              title="Lists teachers and teacher assistants from the Onboarding page — someone with only a login needs a staff record to appear here.">
                              <option value="">Unassigned</option>
                              {pickableStaff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                              {e.assignedStaffId && !pickableStaff.some((s) => s.id === e.assignedStaffId) && (
                                <option value={e.assignedStaffId}>{currentAssigneeLabel(e.assignedStaffId, e.assignedStaffName, staff)}</option>
                              )}
                            </select>
                          </td>
                          <td style={{ padding: "6px 12px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={e.countedInRatio}
                              disabled={!canManage}
                              onChange={(ev) => save(e, { countedInRatio: ev.target.checked })}
                              style={{ cursor: canManage ? "pointer" : "default", accentColor: "var(--primary)" }}
                              title="Counted toward the 1:6 staffing ratio"
                            />
                          </td>
                          <td style={{ padding: "6px 12px" }}>
                            {/* Keyed on the saved value so a rollback, or notes arriving from a
                                copy-forward, replace what the uncontrolled box shows. Read-only for
                                teachers: they could type here, but the edit was never saved. */}
                            <input
                              key={`notes:${e.notes ?? ""}`}
                              type="text"
                              defaultValue={e.notes ?? ""}
                              placeholder="—"
                              disabled={!canManage}
                              title={e.notes ?? undefined}
                              aria-label={`Notes for ${e.participantName}`}
                              onBlur={(ev) => { const v = ev.target.value.trim() || null; if (v !== (e.notes ?? null)) save(e, { notes: v }); }}
                              style={{ ...selectStyle, maxWidth: 220 }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
