"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight, MapPin, Clock, X, Pencil, Trash2, Check, Loader2, Info, AlertCircle, ListChecks, CalendarRange, ExternalLink } from "lucide-react";
import { parseLocalDate, localDateKey } from "@/lib/format";
import { linkify } from "@/lib/linkify";
import { calendarApi } from "@/lib/api/calendar";
import { yearCalendarApi } from "@/lib/api/yearCalendar";
import { ApiError, describeApiError } from "@/lib/api/client";
import { usePrograms, useReferenceLists, useProjects } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import { programPillStyle, programTint } from "@/lib/programColor";
import type { CalendarEventDto, ProgramSummaryDto, CreateCalendarEventDto, SiteDto, ProjectTaskDto, ResolvedKeyArtsDateDto, CalendarThemeDto } from "@/lib/types/api";
import ProgramPills from "../components/ProgramPills";

// ── Calendar math ─────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Cell = { d: number; slot: "prev" | "curr" | "next" };

function buildCells(year: number, month: number): Cell[] {
  const dim  = new Date(year, month, 0).getDate();       // days in current month
  const fwd  = new Date(year, month - 1, 1).getDay();    // 0=Sun leading offset
  const pdim = new Date(year, month - 1, 0).getDate();   // days in prev month
  const cells: Cell[] = [];

  for (let i = fwd - 1; i >= 0; i--) cells.push({ d: pdim - i, slot: "prev" });
  for (let d = 1; d <= dim; d++) cells.push({ d, slot: "curr" });
  let nd = 1;
  while (cells.length % 7 !== 0) cells.push({ d: nd++, slot: "next" });

  return cells;
}

/** yyyy-MM-dd for a local calendar date. */
function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function isoOfDate(d: Date): string { return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()); }

/** The seven days (Sunday first) of the week containing `anchorIso`. */
function weekOf(anchorIso: string): { iso: string; date: Date }[] {
  const a = parseLocalDate(anchorIso);
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate() - a.getDay(), 12);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
    return { iso: isoOfDate(d), date: d };
  });
}

/** "y-m" key for the month after (year, month). */
function nextMonthKey(year: number, month: number): string {
  return month === 12 ? `${year + 1}-1` : `${year}-${month + 1}`;
}

// ── Program filter ────────────────────────────────────────────────────────────

/** Filter key for events with no program (org-wide / staff events). */
const ORG_WIDE = "none";
const HIDDEN_PROGRAMS_KEY = "calendar.hiddenPrograms";

const filterKeyOf = (e: CalendarEventDto) => e.programId ?? ORG_WIDE;

/**
 * The programs this browser has switched OFF. Storing the hidden set (not the shown one) means
 * a program created later shows by default. Per browser only; storage can be blocked, in which
 * case the filter still works for the visit.
 */
function loadHiddenPrograms(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HIDDEN_PROGRAMS_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveHiddenPrograms(hidden: Set<string>) {
  try { window.localStorage.setItem(HIDDEN_PROGRAMS_KEY, JSON.stringify([...hidden])); } catch { /* storage blocked */ }
}

// ── Layers: tasks and Annual Planning (Oct 2026) ──────────────────────────────
//
// Rachel wants the CRM calendar to work like Google Calendar — events and tasks in one place —
// so tasks with a due date and the Annual Planning key arts dates can be shown alongside events.
// Both are on by default and remembered per browser, like the program filter.

type Layers = { tasks: boolean; tasksMine: boolean; annual: boolean };
const LAYERS_KEY = "calendar.layers";
const DEFAULT_LAYERS: Layers = { tasks: true, tasksMine: false, annual: true };

function loadLayers(): Layers {
  try {
    const raw = window.localStorage.getItem(LAYERS_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object") {
      const o = v as Partial<Record<keyof Layers, unknown>>;
      return {
        tasks: typeof o.tasks === "boolean" ? o.tasks : DEFAULT_LAYERS.tasks,
        tasksMine: typeof o.tasksMine === "boolean" ? o.tasksMine : DEFAULT_LAYERS.tasksMine,
        annual: typeof o.annual === "boolean" ? o.annual : DEFAULT_LAYERS.annual,
      };
    }
  } catch { /* storage blocked */ }
  return DEFAULT_LAYERS;
}
function saveLayers(l: Layers) {
  try { window.localStorage.setItem(LAYERS_KEY, JSON.stringify(l)); } catch { /* storage blocked */ }
}

/** A task due on a day, with its project's title for context. */
type DueTask = ProjectTaskDto & { projectTitle: string };

/** Something on a day that isn't an event. */
type Extra = { kind: "task"; task: DueTask } | { kind: "keydate"; date: ResolvedKeyArtsDateDto };

function shortDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Add Event Modal ───────────────────────────────────────────────────────────

type EventForm = { title: string; date: string; programId: string; location: string; timeRange: string; details: string; siteIds: string[] };
const EMPTY_FORM: EventForm = { title: "", date: "", programId: "", location: "", timeRange: "", details: "", siteIds: [] };

function formFrom(e: CalendarEventDto): EventForm {
  return {
    title: e.title, date: e.date, programId: e.programId ?? "",
    location: e.location ?? "", timeRange: e.timeRange ?? "", details: e.meta ?? "", siteIds: [...e.siteIds],
  };
}

/**
 * One modal for both adding and editing an event. Edit mode carries a Remove button (two
 * clicks: the first turns it into a confirmation). Sites are chips from the Sites list —
 * an event can be for several locations — and Details takes free text where any link
 * (a Zoom URL, a Google Doc) becomes clickable on the calendar.
 */
function EventModal({
  programs,
  sites,
  defaultDate,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  programs: ProgramSummaryDto[];
  sites: SiteDto[];
  defaultDate: string;
  /** The event being edited; null for a new one. */
  existing: CalendarEventDto | null;
  onClose: () => void;
  onSaved: (e: CalendarEventDto) => void;
  onDeleted: (id: string) => void;
}) {
  const editing = existing !== null;
  const [form, setForm] = useState<EventForm>(existing ? formFrom(existing) : { ...EMPTY_FORM, date: defaultDate });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canSubmit = form.title.trim().length > 0 && form.date !== "" && !saving && !deleting;

  function toggleSite(id: string) {
    setForm((f) => ({ ...f, siteIds: f.siteIds.includes(id) ? f.siteIds.filter((x) => x !== id) : [...f.siteIds, id] }));
  }

  async function handleDelete() {
    if (!existing) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    setError(null);
    try {
      await calendarApi.remove(existing.id);
      onDeleted(existing.id);
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? err.detail : "Could not remove the event — try again.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
    padding: "8px 12px", fontSize: 13, color: "var(--fg)",
    background: "var(--surface)", outline: "none",
  };

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const dto: CreateCalendarEventDto = {
      title: form.title.trim(),
      date: form.date,
      programId: form.programId || undefined,
      location: form.location.trim() || undefined,
      timeRange: form.timeRange.trim() || undefined,
      meta: form.details.trim() || undefined,
      siteIds: form.siteIds,
    };
    try {
      const saved = existing ? await calendarApi.update(existing.id, dto) : await calendarApi.create(dto);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? err.detail : "Could not save event — make sure the backend is running.");
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
    >
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(440px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>{editing ? "Edit event" : "Add event"}</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>{editing ? "Changes show on the calendar right away" : "Event will appear on the calendar"}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Title <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <input type="text" placeholder="e.g. MJC Session" value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              style={inputStyle} autoFocus />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Date <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <input type="date" value={form.date}
              onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
              style={{ ...inputStyle, width: "60%" }} />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Program <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <ProgramPills programs={programs} value={form.programId || null} onChange={(id) => setForm((f) => ({ ...f, programId: id ?? "" }))} allLabel="None" />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Sites <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Pick every location this is for</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sites.map((st) => {
                const on = form.siteIds.includes(st.id);
                return (
                  <button key={st.id} type="button" className={`ss-chip${on ? " is-active" : ""}`} aria-pressed={on} style={{ cursor: "pointer" }} onClick={() => toggleSite(st.id)}>
                    {st.name}{on && <Check style={{ width: 12, height: 12 }} />}
                  </button>
                );
              })}
              {sites.length === 0 && <span style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>No sites set up yet — add them under Settings.</span>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div>
              <div className="ss-label" style={{ marginBottom: 6 }}>Time <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
              <input type="text" placeholder="9:00 – 11:30 AM" value={form.timeRange}
                onChange={(e) => setForm(f => ({ ...f, timeRange: e.target.value }))}
                style={inputStyle} />
            </div>
            <div>
              <div className="ss-label" style={{ marginBottom: 6 }}>Location <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
              <input type="text" placeholder="Room B / FH 152" value={form.location}
                onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                style={inputStyle} />
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Details / link <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional — links become clickable</span></div>
            <textarea rows={3} placeholder="Zoom link, what to bring, who to contact…" value={form.details}
              onChange={(e) => setForm(f => ({ ...f, details: e.target.value }))}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        </div>

        {error && (
          <div style={{ margin: "0 var(--space-4)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {editing && (
            <button className="ss-btn" type="button" onClick={handleDelete} disabled={deleting || saving}
              style={confirmDelete ? { background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" } : { color: "var(--danger)" }}>
              {deleting ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 className="ss-btn-icon" />}
              {deleting ? "Removing…" : confirmDelete ? "Confirm remove" : "Remove"}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving || deleting}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {editing ? <Check className="ss-btn-icon" /> : <Plus className="ss-btn-icon" />}
            {saving ? "Saving…" : editing ? "Save changes" : "Add event"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  // Lazy init so server/client rendering agrees on the initial value. The viewer's LOCAL day.
  const [today] = useState<{ iso: string; year: number; month: number; day: number }>(() => {
    const iso = localDateKey();
    const [year, month, day] = iso.split("-").map(Number);
    return { iso, year, month, day };
  });

  const [viewYear,  setViewYear]  = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);
  // Week view: the week containing weekAnchor. Events for every month the week touches are
  // loaded, so a week straddling a month boundary shows both halves.
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [weekAnchor, setWeekAnchor] = useState<string>(() => isoOf(today.year, today.month, today.day));
  const [events,    setEvents]    = useState<CalendarEventDto[]>([]);
  // Cached + shared via React Query (#34).
  const programs: ProgramSummaryDto[] = usePrograms().data ?? [];
  const sites: SiteDto[] = useReferenceLists().data?.sites ?? [];
  const { user, canManage } = useAuth();
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventDto | null>(null);
  // Admin pages render client-side only (AuthGuard), so reading storage in the initializer is safe.
  const [hiddenPrograms, setHiddenPrograms] = useState<Set<string>>(loadHiddenPrograms);
  const [layers, setLayers] = useState<Layers>(loadLayers);
  function updateLayers(patch: Partial<Layers>) {
    const next = { ...layers, ...patch };
    setLayers(next);
    saveLayers(next);
  }

  // Tasks layer: the projects query is shared with the Tasks page, so this is usually cached.
  const projectsQ = useProjects();
  const myStaffId = user?.staffMemberId ?? null;
  const dueTasks = useMemo<DueTask[]>(() => {
    if (!layers.tasks) return [];
    return (projectsQ.data ?? []).flatMap((p) => p.tasks
      .filter((t) => t.dueDate && t.taskStatus !== "Done" && (!layers.tasksMine || t.assignedToId === myStaffId))
      .map((t) => ({ ...t, projectTitle: p.title })));
  }, [projectsQ.data, layers.tasks, layers.tasksMine, myStaffId]);

  // Annual Planning layer: themes once, key dates per year in view (a week can straddle two).
  const [themes, setThemes] = useState<CalendarThemeDto[] | null>(null);
  const [keyDatesByYear, setKeyDatesByYear] = useState<Record<number, ResolvedKeyArtsDateDto[]>>({});

  const weekDays = useMemo(() => weekOf(weekAnchor), [weekAnchor]);
  const yearsInView = useMemo(
    () => [...new Set(viewMode === "week" ? weekDays.map((d) => d.date.getFullYear()) : [viewYear])].join(","),
    [viewMode, weekDays, viewYear],
  );
  useEffect(() => {
    if (!layers.annual) return;
    let active = true;
    if (themes === null) {
      yearCalendarApi.getCalendar()
        .then((d) => { if (active) setThemes(d.themes); })
        .catch(() => { /* the banner just stays off; events still load */ });
    }
    for (const y of yearsInView.split(",").map(Number)) {
      if (keyDatesByYear[y]) continue;
      yearCalendarApi.getResolvedKeyArtsDates(y)
        .then((list) => { if (active) setKeyDatesByYear((prev) => ({ ...prev, [y]: list })); })
        .catch(() => { /* same: a missing layer, not a broken calendar */ });
    }
    return () => { active = false; };
    // keyDatesByYear/themes are caches checked inside; re-running on their change would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.annual, yearsInView]);

  const isCurrentMonth = viewYear === today.year && viewMonth === today.month;

  // Which months' events are needed: the viewed month, or every month the viewed week touches.
  // The current month also loads NEXT month so "Upcoming" still has items late in the month;
  // the grid only renders the viewed month's cells, so those never leak into it.
  const monthsKey = useMemo(() => {
    const pairs = viewMode === "month"
      ? [`${viewYear}-${viewMonth}`, ...(isCurrentMonth ? [nextMonthKey(viewYear, viewMonth)] : [])]
      : [...new Set(weekDays.map((d) => `${d.date.getFullYear()}-${d.date.getMonth() + 1}`))];
    return pairs.join(",");
  }, [viewMode, viewYear, viewMonth, weekDays, isCurrentMonth]);

  // Reload events whenever the months in view change (or Retry is pressed). A failed month no
  // longer reads as an empty calendar: what did load is shown, plus an error line.
  useEffect(() => {
    let active = true;
    setLoading(true);
    const pairs = monthsKey.split(",").map((k) => { const [y, m] = k.split("-").map(Number); return { y, m }; });
    Promise.allSettled(pairs.map((p) => calendarApi.getEvents(p.m, p.y)))
      .then((results) => {
        if (!active) return;
        setEvents(results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
        const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
        setLoadError(failed ? describeApiError(failed.reason, "Some events couldn't be loaded.") : null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [monthsKey, reloadTick]);

  const programById = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);

  // Colours come from each program's colorHex, not slug CSS: a slug like "pathways:-manteca"
  // gets no generated rule, so its events and dots rendered colourless. Org-wide events (and
  // any program not in the list) keep the neutral staff style.
  function programOf(e: CalendarEventDto): ProgramSummaryDto | undefined {
    return e.programId ? programById.get(e.programId) : undefined;
  }
  function evtStyle(e: CalendarEventDto): React.CSSProperties | undefined {
    const p = programOf(e);
    if (!p) return undefined;
    const t = programTint(p.colorHex);
    return { background: t.fill, color: t.text };
  }
  const evtClass = (e: CalendarEventDto) => (programOf(e) ? "evt" : "evt staff");
  function eventDot(e: CalendarEventDto, style?: React.CSSProperties) {
    const p = programOf(e);
    return (
      <span aria-hidden="true" className={p ? "ss-dot" : "ss-dot staff"}
        style={{ ...(p ? { background: programTint(p.colorHex).accent } : {}), ...style }} />
    );
  }
  // Spelled out next to the colour so the program is never told by colour alone.
  const programLabel = (e: CalendarEventDto) => e.programName ?? "Org-wide";

  // ── Program filter ──
  function updateHidden(next: Set<string>) {
    setHiddenPrograms(next);
    saveHiddenPrograms(next);
  }
  function toggleProgram(key: string) {
    const next = new Set(hiddenPrograms);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    updateHidden(next);
  }
  const allShown = !hiddenPrograms.has(ORG_WIDE) && programs.every((p) => !hiddenPrograms.has(p.id));

  // Grid, week view, detail panel and Upcoming all read from the filtered list.
  const visibleEvents = useMemo(
    () => events.filter((e) => !hiddenPrograms.has(filterKeyOf(e))),
    [events, hiddenPrograms],
  );

  // Group events by date (yyyy-MM-dd) — week view can hold two months at once.
  const eventsByDate = useMemo(() => {
    return visibleEvents.reduce((acc, e) => {
      (acc[e.date] = acc[e.date] ?? []).push(e);
      return acc;
    }, {} as Record<string, CalendarEventDto[]>);
  }, [visibleEvents]);

  // Tasks and key arts dates by day. A date range sits on its start day (the chip says how far
  // it runs); month-long and unreadable ("Varies") dates go in the banner instead.
  const extrasByDate = useMemo(() => {
    const acc: Record<string, Extra[]> = {};
    for (const t of dueTasks) (acc[t.dueDate!] = acc[t.dueDate!] ?? []).push({ kind: "task", task: t });
    if (layers.annual) {
      for (const list of Object.values(keyDatesByYear))
        for (const d of list)
          if (d.start && !d.isMonthLong) (acc[d.start] = acc[d.start] ?? []).push({ kind: "keydate", date: d });
    }
    return acc;
  }, [dueTasks, keyDatesByYear, layers.annual]);

  // The banner for the viewed month: its theme plus the observances that span it.
  const monthTheme = layers.annual ? themes?.find((t) => t.month === viewMonth) ?? null : null;
  const monthLongDates = useMemo(
    () => (layers.annual ? (keyDatesByYear[viewYear] ?? []).filter((d) => d.month === viewMonth && (d.isMonthLong || !d.start)) : []),
    [layers.annual, keyDatesByYear, viewYear, viewMonth],
  );

  function keyDateLabel(d: ResolvedKeyArtsDateDto): string {
    return d.start && d.end && d.end !== d.start ? `${d.observance} (through ${shortDate(d.end)})` : d.observance;
  }
  function extraChip(x: Extra) {
    if (x.kind === "task") {
      const t = x.task;
      return (
        <Link key={`t-${t.id}`} href={`/tasks?edit=${t.id}`} className={`evt task${t.isOverdue ? " is-overdue" : ""}`}
          title={`Task: ${t.name} · ${t.projectTitle}${t.assignedToName ? ` · ${t.assignedToName}` : ""}`}
          onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none" }}>
          ☐ {t.name}
        </Link>
      );
    }
    return (
      <span key={`k-${x.date.id}`} className="evt keydate" title={`${keyDateLabel(x.date)}${x.date.programmingTieIn ? ` · ${x.date.programmingTieIn}` : ""}`}>
        {keyDateLabel(x.date)}
      </span>
    );
  }

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth]);

  function shiftWeek(days: number) {
    const a = parseLocalDate(weekAnchor);
    const next = new Date(a.getFullYear(), a.getMonth(), a.getDate() + days, 12);
    setWeekAnchor(isoOfDate(next));
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth() + 1);
    setSelectedDate(null);
  }

  function prevMonth() {
    if (viewMode === "week") { shiftWeek(-7); return; }
    setSelectedDate(null);
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMode === "week") { shiftWeek(7); return; }
    setSelectedDate(null);
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function goToToday() {
    setViewYear(today.year);
    setViewMonth(today.month);
    setWeekAnchor(isoOf(today.year, today.month, today.day));
    setSelectedDate(null);
  }

  function switchMode(mode: "month" | "week") {
    if (mode === viewMode) return;
    if (mode === "week") {
      // Start on the selected day, else today when it is in view, else the 1st.
      setWeekAnchor(selectedDate ?? (isCurrentMonth ? isoOf(today.year, today.month, today.day) : isoOf(viewYear, viewMonth, 1)));
    } else {
      const a = parseLocalDate(weekAnchor);
      setViewYear(a.getFullYear());
      setViewMonth(a.getMonth() + 1);
    }
    setViewMode(mode);
  }

  const todayIso = today.iso;
  const weekHasToday = weekDays.some((d) => d.iso === todayIso);

  // Detail panel: the selected day; else today when it is in view; else (week view) the
  // first day of the week.
  const detailDate: string | null = selectedDate
    ?? (viewMode === "month"
      ? (isCurrentMonth ? todayIso : null)
      : (weekHasToday ? todayIso : weekDays[0].iso));
  const detailEvents = detailDate ? (eventsByDate[detailDate] ?? []) : [];
  const detailExtras = detailDate ? (extrasByDate[detailDate] ?? []) : [];

  const detailLabel = detailDate
    ? parseLocalDate(detailDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : `${MONTH_NAMES[viewMonth - 1]} ${viewYear}`;

  const weekLabel = (() => {
    const a = weekDays[0].date, b = weekDays[6].date;
    const left = a.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const right = b.toLocaleDateString("en-US", a.getMonth() === b.getMonth() ? { day: "numeric" } : { month: "short", day: "numeric" });
    return `${left} – ${right}, ${b.getFullYear()}`;
  })();

  // The side list, excluding the detail day so nothing shows twice. On the current month it is
  // "Upcoming": today or later (next month included), never the month's first five — on
  // Oct 16 that used to list Oct 3–9. Other months list that month; week view, that week.
  const showUpcoming = viewMode === "month" && isCurrentMonth;
  const otherEvents = useMemo(() => {
    const inView = viewMode === "week"
      ? visibleEvents.filter((e) => weekDays.some((d) => d.iso === e.date))
      : showUpcoming
        ? visibleEvents.filter((e) => e.date >= todayIso)
        : visibleEvents.filter((e) => { const d = parseLocalDate(e.date); return d.getMonth() + 1 === viewMonth && d.getFullYear() === viewYear; });
    return inView
      .filter(e => detailDate === null || e.date !== detailDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [visibleEvents, detailDate, viewMode, viewMonth, viewYear, weekDays, showUpcoming, todayIso]);

  const defaultDate = detailDate ?? isoOf(viewYear, viewMonth, 1);

  return (
    <>
      <style>{`
        .cal-cell { cursor: pointer; }
        .cal-cell.is-other { cursor: default; }
        .cal-cell.is-selected { outline: 1.5px solid var(--primary, #378add); outline-offset: -1.5px; background: var(--bg); }
      `}</style>

      <div className="adm-main">
        <div className="adm-topbar">
          <div className="titles">
            <h1>Calendar</h1>
          </div>
          <div className="right">
            <div className="seg">
              <button type="button" className={viewMode === "month" ? "is-active" : ""} onClick={() => switchMode("month")}>Month</button>
              <button type="button" className={viewMode === "week" ? "is-active" : ""} onClick={() => switchMode("week")}>Week</button>
            </div>
            {canManage && <button className="ss-btn ss-btn-primary" type="button" onClick={() => setAddOpen(true)}>
              <Plus className="ss-btn-icon" />
              Add event
            </button>}
          </div>
        </div>

        <div className="adm-content">
          {/* Program filter: multi-select toggles (they used to be a static legend styled to
              look selected). The choice is remembered per browser. */}
          <div className="row tight" role="group" aria-label="Show events for" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={`ss-chip${allShown ? " is-active" : ""}`} aria-pressed={allShown}
              style={{ minHeight: 34 }} onClick={() => updateHidden(new Set())}>
              All
              {allShown && <Check style={{ width: 12, height: 12 }} aria-hidden="true" />}
            </button>
            {programs.map((p) => {
              const on = !hiddenPrograms.has(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => toggleProgram(p.id)}
                  style={{ ...programPillStyle(p.colorHex, on), minHeight: 34 }}>
                  <span aria-hidden="true" className="ss-dot" style={{ background: programTint(p.colorHex).accent }} />
                  {p.name}
                  {on && <Check style={{ width: 12, height: 12 }} aria-hidden="true" />}
                </button>
              );
            })}
            {programs.length > 0 && (
              <span aria-hidden="true" style={{ width: 1, height: 22, background: "var(--border-strong)", margin: "0 4px" }} />
            )}
            {(() => {
              const on = !hiddenPrograms.has(ORG_WIDE);
              return (
                <button type="button" aria-pressed={on} onClick={() => toggleProgram(ORG_WIDE)}
                  title="Events not tied to a program" style={{ ...programPillStyle(null, on), minHeight: 34 }}>
                  <span aria-hidden="true" className="ss-dot staff" />
                  Org-wide
                  {on && <Check style={{ width: 12, height: 12 }} aria-hidden="true" />}
                </button>
              );
            })()}
            <span aria-hidden="true" style={{ width: 1, height: 22, background: "var(--border-strong)", margin: "0 4px" }} />
            {/* Layers (Oct 2026): tasks due and Annual Planning dates, alongside events. */}
            <button type="button" className={`ss-chip${layers.tasks ? " is-active" : ""}`} aria-pressed={layers.tasks} style={{ minHeight: 34 }}
              title="Tasks with a due date (finished ones hidden)" onClick={() => updateLayers({ tasks: !layers.tasks })}>
              <ListChecks style={{ width: 12, height: 12 }} aria-hidden="true" />Tasks
              {layers.tasks && <Check style={{ width: 12, height: 12 }} aria-hidden="true" />}
            </button>
            {layers.tasks && (
              <button type="button" className={`ss-chip${layers.tasksMine ? " is-active" : ""}`} aria-pressed={layers.tasksMine} style={{ minHeight: 34 }}
                title={myStaffId ? "Only tasks assigned to you" : "Your account isn't linked to a staff member, so no tasks are 'yours' yet"}
                disabled={!myStaffId} onClick={() => updateLayers({ tasksMine: !layers.tasksMine })}>
                Mine only
                {layers.tasksMine && <Check style={{ width: 12, height: 12 }} aria-hidden="true" />}
              </button>
            )}
            <button type="button" className={`ss-chip${layers.annual ? " is-active" : ""}`} aria-pressed={layers.annual} style={{ minHeight: 34 }}
              title="Each month's theme and key arts dates from Annual Planning" onClick={() => updateLayers({ annual: !layers.annual })}>
              <CalendarRange style={{ width: 12, height: 12 }} aria-hidden="true" />Annual Planning
              {layers.annual && <Check style={{ width: 12, height: 12 }} aria-hidden="true" />}
            </button>
          </div>

          {layers.annual && viewMode === "month" && (monthTheme || monthLongDates.length > 0) && (
            <div className="cal-theme-banner" role="note">
              <CalendarRange style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />
              {monthTheme && (
                <span>
                  <span className="theme">{monthTheme.themeTitle}</span>
                  {monthTheme.themeSubtitle && <span> — {monthTheme.themeSubtitle}</span>}
                  {monthTheme.productionPhase && <span> · {monthTheme.productionPhase}</span>}
                </span>
              )}
              {monthLongDates.map((d) => (
                <span key={d.id} className="ss-chip" title={d.programmingTieIn ?? undefined}>
                  <span style={{ color: "var(--fg-tertiary)" }}>{d.dateText}</span>&nbsp;{d.observance}
                </span>
              ))}
              <Link href="/year-calendar" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, color: "var(--fg-secondary)" }}>
                Annual Planning<ExternalLink style={{ width: 11, height: 11 }} aria-hidden="true" />
              </Link>
            </div>
          )}

          {loadError && (
            <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: "var(--space-3)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 13 }}>
              <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />
              <span style={{ flex: 1 }}>Events may be missing: {loadError}</span>
              <button type="button" className="ss-btn" disabled={loading} onClick={() => setReloadTick((t) => t + 1)}>
                Retry
              </button>
            </div>
          )}

          <div className="cal-layout">
            {/* ── Grid ─────────────────────────────────────────────────── */}
            <div className="cal-area">
              <div className="cal-nav">
                <span className="arrow" onClick={prevMonth}><ChevronLeft /></span>
                <span className="arrow" onClick={nextMonth}><ChevronRight /></span>
                <span className="month">{viewMode === "week" ? weekLabel : `${MONTH_NAMES[viewMonth - 1]} ${viewYear}`}</span>
                <button className="ss-btn" type="button" onClick={goToToday}
                  style={{ marginLeft: 8, height: 32, minHeight: 32, padding: "0 14px" }}>
                  Today
                </button>
              </div>

              {viewMode === "week" ? (
                <div className="cal-grid">
                  <div className="cal-dow">
                    {weekDays.map((d) => (
                      <div key={d.iso}>{DOW[d.date.getDay()]} {d.date.getDate()}</div>
                    ))}
                  </div>
                  <div className="cal-weeks" style={{ opacity: loading ? 0.4 : 1, transition: "opacity 200ms" }}>
                    {weekDays.map((d) => {
                      const isToday = d.iso === todayIso;
                      const isSelected = d.iso === selectedDate;
                      const evs = eventsByDate[d.iso] ?? [];
                      const extras = extrasByDate[d.iso] ?? [];
                      return (
                        <div
                          key={d.iso}
                          className={`cal-cell${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
                          style={{ minHeight: 220 }}
                          onClick={() => setSelectedDate(d.iso === selectedDate ? null : d.iso)}
                        >
                          <span className="dnum">{d.date.getDate()}</span>
                          {evs.map((e) => (
                            <span key={e.id} className={evtClass(e)} title={`${e.title} · ${programLabel(e)}`} style={{ ...evtStyle(e), whiteSpace: "normal" }}>
                              {e.timeRange ? `${e.timeRange} · ` : ""}{e.title}
                            </span>
                          ))}
                          {extras.map(extraChip)}
                          {evs.length === 0 && extras.length === 0 && <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>—</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
              <div className="cal-grid">
                <div className="cal-dow">
                  {DOW.map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="cal-weeks" style={{ opacity: loading ? 0.4 : 1, transition: "opacity 200ms" }}>
                  {cells.map((c, idx) => {
                    const isOther    = c.slot !== "curr";
                    const iso        = isOther ? null : isoOf(viewYear, viewMonth, c.d);
                    const isToday    = iso === todayIso;
                    const isSelected = iso !== null && iso === selectedDate;
                    const evs  = iso ? (eventsByDate[iso] ?? []) : [];
                    const extras = iso ? (extrasByDate[iso] ?? []) : [];
                    // Events first, then tasks and key dates, three chips per cell in all.
                    const shown = evs.slice(0, 3);
                    const shownExtras = extras.slice(0, Math.max(0, 3 - shown.length));
                    const extra = evs.length + extras.length - shown.length - shownExtras.length;
                    return (
                      <div
                        key={idx}
                        className={`cal-cell${isOther ? " is-other" : ""}${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
                        onClick={() => { if (iso) setSelectedDate(iso === selectedDate ? null : iso); }}
                      >
                        <span className="dnum">{c.d}</span>
                        {shown.map((e) => (
                          <span key={e.id} className={evtClass(e)} title={`${e.title} · ${programLabel(e)}`} style={evtStyle(e)}>{e.title}</span>
                        ))}
                        {shownExtras.map(extraChip)}
                        {extra > 0 && <span className="more-link">+{extra} more</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
            </div>

            {/* ── Detail panel ─────────────────────────────────────────── */}
            <div className="cal-detail">
              <div className="section">
                <div className="detail-h">{detailLabel}</div>
                {detailEvents.length === 0 && detailExtras.length === 0 ? (
                  <div style={{ padding: "10px 0", fontSize: 13, color: "var(--fg-tertiary)" }}>
                    {detailDate ? "Nothing on this day" : "Click a day to see its events"}
                  </div>
                ) : detailEvents.map(e => (
                  <div key={e.id} className="evt-card">
                    <div className="et" style={{ alignItems: "flex-start" }}>
                      {eventDot(e, { marginTop: 5 })}
                      <span style={{ flex: 1 }}>{e.title}</span>
                      {canManage && (
                        <button type="button" title="Edit event" aria-label={`Edit ${e.title}`} onClick={() => setEditingEvent(e)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 2, display: "inline-flex" }}>
                          <Pencil style={{ width: 13, height: 13 }} />
                        </button>
                      )}
                    </div>
                    <div className="em" style={{ paddingLeft: 14 }}>{programLabel(e)}</div>
                    {e.siteNames.length > 0 && <div className="em"><MapPin />{e.siteNames.join(" · ")}</div>}
                    {e.location  && <div className="em"><MapPin style={{ visibility: e.siteNames.length ? "hidden" : "visible" }} /><span>{linkify(e.location)}</span></div>}
                    {e.timeRange && <div className="em"><Clock />{e.timeRange}</div>}
                    {e.meta && <div className="em" style={{ alignItems: "flex-start" }}><Info style={{ marginTop: 2, flexShrink: 0 }} /><span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{linkify(e.meta)}</span></div>}
                  </div>
                ))}
                {/* Tasks due and key arts dates for the day (Oct 2026). Tasks open on the Tasks page. */}
                {detailExtras.map((x) => x.kind === "task" ? (
                  <Link key={`t-${x.task.id}`} href={`/tasks?edit=${x.task.id}`} className="evt-card" style={{ textDecoration: "none", color: "inherit" }} title="Open in Tasks">
                    <div className="et" style={{ alignItems: "flex-start" }}>
                      <ListChecks style={{ width: 13, height: 13, marginTop: 3, flexShrink: 0, color: x.task.isOverdue ? "var(--danger-text)" : "var(--fg-tertiary)" }} aria-hidden="true" />
                      <span style={{ flex: 1 }}>{x.task.name}</span>
                      <ExternalLink style={{ width: 12, height: 12, color: "var(--fg-tertiary)" }} aria-hidden="true" />
                    </div>
                    <div className="em" style={{ paddingLeft: 19 }}>
                      Task · {x.task.projectTitle}{x.task.assignedToName ? ` · ${x.task.assignedToName}` : " · Unassigned"}{x.task.isOverdue ? " · Overdue" : ""}
                    </div>
                  </Link>
                ) : (
                  <div key={`k-${x.date.id}`} className="evt-card">
                    <div className="et" style={{ alignItems: "flex-start" }}>
                      <CalendarRange style={{ width: 13, height: 13, marginTop: 3, flexShrink: 0, color: "var(--fg-tertiary)" }} aria-hidden="true" />
                      <span style={{ flex: 1 }}>{keyDateLabel(x.date)}</span>
                    </div>
                    <div className="em" style={{ paddingLeft: 19 }}>Key arts date{x.date.observanceType ? ` · ${x.date.observanceType}` : ""}</div>
                    {x.date.programmingTieIn && <div className="em" style={{ paddingLeft: 19, alignItems: "flex-start" }}><span>{x.date.programmingTieIn}</span></div>}
                  </div>
                ))}
                {canManage && (
                  <button className="btn-dashed" type="button" onClick={() => setAddOpen(true)}>
                    <Plus />Add event
                  </button>
                )}
                {layers.tasks && detailDate && (
                  <Link href={`/tasks?add=${detailDate}`} className="btn-dashed" style={{ textDecoration: "none" }} title="New task due this day">
                    <Plus />Add task due {shortDate(detailDate)}
                  </Link>
                )}
              </div>

              {(otherEvents.length > 0 || (showUpcoming && !loading)) && (
                <div className="section">
                  <div className="detail-h">{viewMode === "week" ? "This week" : showUpcoming ? "Upcoming" : MONTH_NAMES[viewMonth - 1]}</div>
                  {otherEvents.length === 0 ? (
                    <div style={{ padding: "10px 0", fontSize: 13, color: "var(--fg-tertiary)" }}>Nothing else coming up</div>
                  ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    {otherEvents.map(e => {
                      const label = parseLocalDate(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      return (
                        <div key={e.id} className="evt-card" style={canManage ? { cursor: "pointer" } : undefined}
                          onClick={canManage ? () => setEditingEvent(e) : undefined} title={canManage ? "Click to edit" : undefined}>
                          <div className="et">
                            {eventDot(e)}
                            {e.title}
                          </div>
                          <div className="em">
                            <Clock />{label}{e.timeRange ? ` · ${e.timeRange}` : ""} · {programLabel(e)}{e.siteNames.length ? ` · ${e.siteNames.join(", ")}` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {(addOpen || editingEvent) && (
        <EventModal
          programs={programs}
          sites={sites}
          defaultDate={defaultDate}
          existing={editingEvent}
          onClose={() => { setAddOpen(false); setEditingEvent(null); }}
          onSaved={(e) => {
            // Keep it if its month is one of the loaded months (next month counts for Upcoming).
            const eDate = parseLocalDate(e.date);
            const inView = monthsKey.split(",").includes(`${eDate.getFullYear()}-${eDate.getMonth() + 1}`);
            setEvents((prev) => {
              const rest = prev.filter((x) => x.id !== e.id);
              return inView ? [...rest, e] : rest;
            });
            // An event saved under a program that is filtered out would seem to vanish on Save.
            if (hiddenPrograms.has(filterKeyOf(e))) toggleProgram(filterKeyOf(e));
            setAddOpen(false);
            setEditingEvent(null);
          }}
          onDeleted={(id) => {
            setEvents((prev) => prev.filter((x) => x.id !== id));
            setEditingEvent(null);
          }}
        />
      )}
    </>
  );
}
