"use client";

import { useEffect, useMemo, useState } from "react";
import { Users2, Check } from "lucide-react";
import { rosterApi } from "@/lib/api/roster";
import { useReferenceLists, useStaff } from "@/lib/api/hooks";
import type {
  RosterEntryDto,
  SiteDto,
  StarGroupDto,
  StaffSummaryDto,
} from "@/lib/types/api";

const QUARTERS = [1, 2, 3, 4];

const selectStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
  padding: "5px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)",
  outline: "none", width: "100%", maxWidth: 180,
};

export default function RosterPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);

  const [entries, setEntries] = useState<RosterEntryDto[]>([]);
  // Cached + shared via React Query (#34).
  const lists = useReferenceLists().data;
  const sites: SiteDto[] = lists?.sites ?? [];
  const groups: StarGroupDto[] = lists?.starGroups ?? [];
  const staff: StaffSummaryDto[] = useStaff().data ?? [];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Reference lists + staff load once.
  // Roster reloads on term change.
  useEffect(() => {
    let active = true;
    rosterApi.get(year, quarter)
      .then((e) => { if (active) { setEntries(e); setError(false); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year, quarter]);

  // Term changes flip the loading flag here, not inside the effect, so the effect only
  // starts the request (react-hooks/set-state-in-effect).
  function changeTerm(nextYear: number, nextQuarter: number) {
    setLoading(true);
    setYear(nextYear);
    setQuarter(nextQuarter);
  }

  function save(entry: RosterEntryDto, patch: Partial<RosterEntryDto>) {
    const merged = { ...entry, ...patch };
    setEntries((prev) => prev.map((e) => (e.participantId === entry.participantId ? merged : e)));
    setSavingId(entry.participantId);
    rosterApi
      .upsert({
        participantId: entry.participantId,
        year, quarter,
        siteIds: merged.siteIds,
        starGroupId: merged.starGroupId,
        assignedStaffId: merged.assignedStaffId,
        countedInRatio: merged.countedInRatio,
        notes: merged.notes,
      })
      .then((saved) => setEntries((prev) => prev.map((e) => (e.participantId === saved.participantId ? saved : e))))
      .catch(() => { /* keep optimistic value */ })
      .finally(() => setSavingId((cur) => (cur === entry.participantId ? null : cur)));
  }

  // Group by program (stable dimension) so rows don't jump while a site is being assigned.
  const byProgram = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; rows: RosterEntryDto[] }>();
    for (const e of entries) {
      if (!map.has(e.programId)) map.set(e.programId, { name: e.programName || "No program", slug: e.programSlug, rows: [] });
      map.get(e.programId)!.rows.push(e);
    }
    for (const g of map.values()) g.rows.sort((a, b) => a.participantName.localeCompare(b.participantName));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const assigned = entries.filter((e) => e.starGroupId && e.siteIds.length > 0).length;

  // A Star can attend more than one site in a term (client ask, Sep 2026). Click a chip to
  // add or remove it; the first listed is the primary site everything single-site shows.
  function toggleSite(entry: RosterEntryDto, siteId: string) {
    const has = entry.siteIds.includes(siteId);
    const siteIds = has ? entry.siteIds.filter((id) => id !== siteId) : [...entry.siteIds, siteId];
    const siteNames = siteIds.map((id) => sites.find((s) => s.id === id)?.name ?? "").filter(Boolean);
    save(entry, { siteIds, siteNames, siteId: siteIds[0] ?? null, siteName: siteNames[0] ?? null });
  }
  const counted = entries.filter((e) => e.countedInRatio).length;

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Roster &amp; Assignments</h1>
        </div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {QUARTERS.map((qn) => (
            <button key={qn} type="button" className={`ss-chip${quarter === qn ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => changeTerm(year, qn)}>
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
            Each star&apos;s Group, Site, and assigned staff for <strong>Q{quarter} {year}</strong>. Term-scoped —
            picking a new quarter starts a fresh snapshot; history is preserved. Changes save automatically.
          </span>
        </div>

        <div className="board-stats">
          <div className="board-stat"><span className="num">{entries.length}</span><span className="label">Stars</span></div>
          <div className="board-stat"><span className="num green">{assigned}</span><span className="label">Fully Assigned</span></div>
          <div className="board-stat"><span className="num">{counted}</span><span className="label">Counted 1:6</span></div>
        </div>

        {error ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            Couldn&apos;t load the roster. Check that the API is running and try again.
          </div>
        ) : loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading roster…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>No stars yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            {byProgram.map((prog) => (
              <div key={prog.name}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-2)" }}>
                  <span className={`ss-dot ${prog.slug}`} />
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
                        <tr key={e.participantId} style={{ borderBottom: "0.5px solid var(--border)" }}>
                          <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <span className="ss-avatar teacher sm">{e.participantInitials}</span>
                              <span style={{ fontSize: "var(--fs-body)" }}>{e.participantName}</span>
                              {savingId === e.participantId && <Check style={{ width: 12, height: 12, color: "var(--success)" }} />}
                            </span>
                          </td>
                          <td style={{ padding: "6px 12px" }}>
                            <select style={selectStyle} value={e.starGroupId ?? ""} onChange={(ev) => save(e, { starGroupId: ev.target.value || null })}>
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
                                    style={{ cursor: "pointer", fontSize: 11, padding: "2px 8px" }}
                                  >
                                    {s.name}
                                  </button>
                                );
                              })}
                              {sites.length === 0 && <span style={{ color: "var(--fg-tertiary)", fontSize: 12 }}>No sites yet</span>}
                            </div>
                          </td>
                          <td style={{ padding: "6px 12px" }}>
                            <select style={selectStyle} value={e.assignedStaffId ?? ""} onChange={(ev) => save(e, { assignedStaffId: ev.target.value || null })}>
                              <option value="">Unassigned</option>
                              {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "6px 12px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={e.countedInRatio}
                              onChange={(ev) => save(e, { countedInRatio: ev.target.checked })}
                              style={{ cursor: "pointer", accentColor: "var(--primary)" }}
                              title="Counted toward the 1:6 staffing ratio"
                            />
                          </td>
                          <td style={{ padding: "6px 12px" }}>
                            <input
                              type="text"
                              defaultValue={e.notes ?? ""}
                              placeholder="—"
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
