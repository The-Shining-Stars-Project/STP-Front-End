"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarRange, CalendarDays, Pencil, X, Check, ListChecks, Plus } from "lucide-react";
import { yearCalendarApi } from "@/lib/api/yearCalendar";
import { describeApiError } from "@/lib/api/client";
import { useProjects } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import { localDateKey, parseLocalDate } from "@/lib/format";
import type { YearCalendarDto, KeyArtsDateDto, CalendarThemeDto, UpsertCalendarThemeDto, ThemeArc, ProjectTaskDto } from "@/lib/types/api";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Legend arcs — Green = Foundational Reset, Gold = Spring Show, Rose = Nutcracker.
const ARC: Record<ThemeArc, { label: string; color: string }> = {
  FoundationalReset: { label: "Foundational Reset", color: "#2e9e5b" },
  SpringShow:        { label: "Spring Show",        color: "#e0a021" },
  Nutcracker:        { label: "Nutcracker",         color: "#c2456b" },
};
const ARC_KEYS = Object.keys(ARC) as ThemeArc[];

// Shown to users as "Annual Planning" (renamed Oct 2026); the route and API keep "year-calendar".
export default function YearCalendarPage() {
  // Theme edits are ManagementWrite; hide the pencil from everyone else rather than let it 403.
  const { canManage } = useAuth();
  const [data, setData] = useState<YearCalendarDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMonth, setEditMonth] = useState<number | null>(null);

  useEffect(() => {
    yearCalendarApi.getCalendar()
      .then((d) => { setData(d); setError(null); })
      .catch((e: unknown) => setError(describeApiError(e, "Check your connection and try again.")))
      .finally(() => setLoading(false));
  }, []);

  const datesByMonth = useMemo(() => {
    const m = new Map<number, KeyArtsDateDto[]>();
    data?.keyArtsDates.forEach((k) => { (m.get(k.month) ?? m.set(k.month, []).get(k.month)!).push(k); });
    return m;
  }, [data]);

  const themesByMonth = useMemo(() => {
    const m = new Map<number, CalendarThemeDto>();
    data?.themes.forEach((t) => m.set(t.month, t));
    return m;
  }, [data]);

  // Tasks linked to Annual Planning (Oct 2026): each card lists the open tasks due in that month
  // of the planning year ahead — this year for months still to come, next year for months already
  // past — and "+ Task" opens the Tasks page with that month's 1st as the due date.
  const projectsQ = useProjects();
  const todayKey = localDateKey();
  const todayMonth = Number(todayKey.slice(5, 7));
  const todayYear = Number(todayKey.slice(0, 4));
  const planningYearOf = (month: number) => (month >= todayMonth ? todayYear : todayYear + 1);
  const tasksByMonth = useMemo(() => {
    const m = new Map<number, (ProjectTaskDto & { projectTitle: string })[]>();
    for (const p of projectsQ.data ?? [])
      for (const t of p.tasks) {
        if (!t.dueDate || t.taskStatus === "Done") continue;
        const month = Number(t.dueDate.slice(5, 7));
        if (Number(t.dueDate.slice(0, 4)) !== planningYearOf(month)) continue;
        (m.get(month) ?? m.set(month, []).get(month)!).push({ ...t, projectTitle: p.title });
      }
    for (const list of m.values()) list.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    return m;
    // planningYearOf is derived from todayKey, which is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsQ.data, todayKey]);

  function onThemeSaved(saved: CalendarThemeDto) {
    setData((prev) => prev ? { ...prev, themes: [...prev.themes.filter((t) => t.month !== saved.month), saved].sort((a, b) => a.month - b.month) } : prev);
    setEditMonth(null);
  }

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles"><h1>Annual Planning</h1></div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {ARC_KEYS.map((a) => (
            <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-meta)", color: "var(--fg-secondary)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: ARC[a].color }} />{ARC[a].label}
            </span>
          ))}
        </div>
      </div>

      <div className="adm-content">
        <div className="info-note" style={{ marginBottom: "var(--space-3)" }}>
          <CalendarRange />
          <span>The annual programming plan — each month&apos;s theme, featured games, production phase, and the key arts dates to plan around. Staff reference; managers edit.</span>
        </div>

        {error ? (
          <div role="alert" style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Couldn&apos;t load Annual Planning. {error}</div>
        ) : loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--space-4)" }}>
            {MONTHS.map((name, i) => {
              const month = i + 1;
              const t = themesByMonth.get(month);
              const arc = t?.legendArc ? ARC[t.legendArc] : null;
              const accent = arc?.color ?? "var(--border-strong)";
              const dates = datesByMonth.get(month) ?? [];
              return (
                <div key={month} style={{ border: "0.5px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface)", borderTop: `2.5px solid ${accent}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: "var(--fs-label)", letterSpacing: "var(--ls-label)", textTransform: "uppercase", color: "var(--fg-tertiary)" }}>{name}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {arc && (
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: "var(--r-pill)", color: `color-mix(in srgb, ${arc.color} 60%, var(--fg))`, background: `color-mix(in srgb, ${arc.color} 14%, var(--surface))`, border: `0.5px solid color-mix(in srgb, ${arc.color} 35%, var(--border))`, whiteSpace: "nowrap" }}>{arc.label}</span>
                          )}
                          {canManage && (
                            <button type="button" title={`Edit ${name} theme`} aria-label={`Edit ${name} theme`} onClick={() => setEditMonth(month)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 34, minHeight: 34, margin: "-10px -8px" }}>
                              <Pencil style={{ width: 13, height: 13 }} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", marginTop: 2 }}>{t?.themeTitle ?? "—"}</div>
                      {t?.themeSubtitle && <div style={{ fontSize: "var(--fs-meta)", color: "var(--fg-secondary)", marginTop: 1 }}>{t.themeSubtitle}</div>}
                    </div>

                    {t?.productionPhase && (
                      <div style={{ fontSize: "var(--fs-meta)", color: `color-mix(in srgb, ${accent} 55%, var(--fg))`, fontWeight: "var(--w-medium)" }}>{t.productionPhase}</div>
                    )}

                    {dates.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div className="ss-label" style={{ color: "var(--fg-tertiary)" }}>Key arts dates</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {dates.map((d) => (
                            <span key={d.id} title={d.programmingTieIn ?? undefined}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: "var(--r-pill)", background: "var(--bg-tertiary)", color: "var(--fg-secondary)" }}>
                              <span style={{ color: "var(--fg-tertiary)", fontVariantNumeric: "tabular-nums" }}>{d.dateText}</span>{d.observance}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {t?.featuredGamesText && (
                      <div>
                        <div className="ss-label" style={{ color: "var(--fg-tertiary)", marginBottom: 2 }}>Featured programming</div>
                        <div style={{ fontSize: "var(--fs-meta)", color: "var(--fg-secondary)", lineHeight: "var(--lh-body)" }}>{t.featuredGamesText}</div>
                      </div>
                    )}

                    {(() => {
                      const year = planningYearOf(month);
                      const tasks = tasksByMonth.get(month) ?? [];
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div className="ss-label" style={{ color: "var(--fg-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
                            <ListChecks style={{ width: 12, height: 12 }} aria-hidden="true" />Tasks due · {name} {year}
                          </div>
                          {tasks.length === 0 ? (
                            <div style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>{projectsQ.isPending ? "Loading…" : "None open"}</div>
                          ) : tasks.map((task) => (
                            <Link key={task.id} href={`/tasks?edit=${task.id}`} title={`${task.projectTitle}${task.assignedToName ? ` · ${task.assignedToName}` : ""} — open in Tasks`}
                              style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: "var(--fs-meta)", color: task.isOverdue ? "var(--danger-text)" : "var(--fg-secondary)", textDecoration: "none" }}>
                              <span style={{ color: "var(--fg-tertiary)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{parseLocalDate(task.dueDate!).getDate()}</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name}</span>
                            </Link>
                          ))}
                          <Link href={`/tasks?add=${year}-${String(month).padStart(2, "0")}-01`} className="ss-btn" style={{ alignSelf: "flex-start", textDecoration: "none", marginTop: 2 }} title={`New task due in ${name} ${year}`}>
                            <Plus className="ss-btn-icon" />Task for {name}
                          </Link>
                        </div>
                      );
                    })()}

                    {t?.programmingNotes && (
                      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)", lineHeight: "var(--lh-body)", borderTop: "0.5px solid var(--border)", paddingTop: "var(--space-2)" }}>
                        <CalendarDays style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
                        <span>{t.programmingNotes}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canManage && editMonth !== null && (
        <ThemeEditor month={editMonth} theme={themesByMonth.get(editMonth) ?? null} onClose={() => setEditMonth(null)} onSaved={onThemeSaved} />
      )}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "0.5px solid var(--border-hover)",
  borderRadius: "var(--r-md)", padding: "8px 10px", fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none",
};

function ThemeEditor({ month, theme, onClose, onSaved }: { month: number; theme: CalendarThemeDto | null; onClose: () => void; onSaved: (t: CalendarThemeDto) => void }) {
  const [form, setForm] = useState<UpsertCalendarThemeDto>({
    month,
    themeTitle: theme?.themeTitle ?? "",
    themeSubtitle: theme?.themeSubtitle ?? "",
    keyArtsDatesText: theme?.keyArtsDatesText ?? "",
    featuredGamesText: theme?.featuredGamesText ?? "",
    alternativeOptionsText: theme?.alternativeOptionsText ?? "",
    productionPhase: theme?.productionPhase ?? "",
    programmingNotes: theme?.programmingNotes ?? "",
    legendArc: theme?.legendArc ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof UpsertCalendarThemeDto>(k: K, v: UpsertCalendarThemeDto[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.themeTitle.trim()) return;
    setSaving(true); setError(null);
    try {
      const saved = await yearCalendarApi.upsertTheme({ ...form, themeTitle: form.themeTitle.trim() });
      onSaved(saved);
    } catch (e) {
      setError(describeApiError(e, "Couldn't save this month's theme. Try again."));
      setSaving(false);
    }
  }

  const field = (label: string, k: keyof UpsertCalendarThemeDto, rows = 1) => (
    <div>
      <div className="ss-label" style={{ marginBottom: 4 }}>{label}</div>
      {rows > 1 ? (
        <textarea rows={rows} value={(form[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} style={{ ...fieldStyle, resize: "vertical", lineHeight: "var(--lh-body)" }} />
      ) : (
        <input value={(form[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} style={fieldStyle} />
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
     >
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(560px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "92vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", margin: 0 }}>Edit {MONTHS[month - 1]}</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
        </div>
        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)", overflowY: "auto" }}>
          <div>
            <div className="ss-label" style={{ marginBottom: 4 }}>Theme title <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <input value={form.themeTitle} onChange={(e) => set("themeTitle", e.target.value)} style={fieldStyle} autoFocus />
          </div>
          {field("Subtitle", "themeSubtitle")}
          <div>
            <div className="ss-label" style={{ marginBottom: 4 }}>Production arc</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className={`ss-chip${form.legendArc == null ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => set("legendArc", null)}>None</button>
              {ARC_KEYS.map((a) => (
                <button key={a} type="button" className={`ss-chip${form.legendArc === a ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => set("legendArc", a)}>{ARC[a].label}</button>
              ))}
            </div>
          </div>
          {field("Production phase", "productionPhase")}
          {field("Featured programming / games", "featuredGamesText", 2)}
          {field("Alternative options", "alternativeOptionsText", 2)}
          {field("Key arts dates (summary)", "keyArtsDatesText", 2)}
          {field("Programming notes", "programmingNotes", 2)}
          {error && <div style={{ fontSize: "var(--fs-meta)", color: "var(--danger-text)" }}>{error}</div>}
        </div>
        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={save} disabled={saving || !form.themeTitle.trim()}>
            <Check className="ss-btn-icon" />{saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
