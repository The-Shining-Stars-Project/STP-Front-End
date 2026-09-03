"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, ChevronLeft, ChevronRight, MapPin, Clock, X } from "lucide-react";
import { parseLocalDate } from "@/lib/format";
import { calendarApi } from "@/lib/api/calendar";
import { usePrograms } from "@/lib/api/hooks";
import type { CalendarEventDto, ProgramSummaryDto, CreateCalendarEventDto } from "@/lib/types/api";
import { programPillStyle, programTint } from "@/lib/programColor";

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

// ── Add Event Modal ───────────────────────────────────────────────────────────

type AddForm = { title: string; date: string; programId: string; location: string; timeRange: string };
const EMPTY_ADD: AddForm = { title: "", date: "", programId: "", location: "", timeRange: "" };

function AddEventModal({
  programs,
  defaultDate,
  onClose,
  onCreated,
}: {
  programs: ProgramSummaryDto[];
  defaultDate: string;
  onClose: () => void;
  onCreated: (e: CalendarEventDto) => void;
}) {
  const [form, setForm] = useState<AddForm>({ ...EMPTY_ADD, date: defaultDate });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canSubmit = form.title.trim().length > 0 && form.date !== "";

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
    };
    try {
      const created = await calendarApi.create(dto);
      onCreated(created);
    } catch {
      setError("Could not save event — make sure the backend is running.");
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(440px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Add event</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>Event will appear on the calendar</div>
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setForm(f => ({ ...f, programId: "" }))}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: "var(--r-pill)", border: `0.5px solid ${!form.programId ? "var(--border-hover)" : "var(--border)"}`, background: !form.programId ? "var(--bg)" : "var(--surface)", color: "var(--fg-secondary)", cursor: "pointer", fontSize: 13 }}>
                None
              </button>
              {programs.map(p => {
                const sel = form.programId === p.id;
                return (
                  <button key={p.id} type="button" aria-pressed={sel} onClick={() => setForm(f => ({ ...f, programId: p.id }))}
                    style={programPillStyle(p.colorHex, sel)}>
                    <span className="ss-dot" style={{ background: programTint(p.colorHex).accent }} />
                    {p.name}
                  </button>
                );
              })}
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
        </div>

        {error && (
          <div style={{ margin: "0 var(--space-4)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" disabled={!canSubmit || saving} onClick={handleSubmit}>
            <Plus className="ss-btn-icon" />
            {saving ? "Saving…" : "Add event"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  // Lazy init so server/client rendering agrees on the initial value
  const [today] = useState<{ year: number; month: number; day: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  });

  const [viewYear,  setViewYear]  = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);
  const [events,    setEvents]    = useState<CalendarEventDto[]>([]);
  // Cached + shared via React Query (#34).
  const programs: ProgramSummaryDto[] = usePrograms().data ?? [];
  const [loading,   setLoading]   = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Reload events whenever the viewed month changes
  useEffect(() => {
    setLoading(true);
    calendarApi.getEvents(viewMonth, viewYear)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [viewMonth, viewYear]);

  // programId → slug map for event coloring
  const programSlugMap = useMemo(
    () => Object.fromEntries(programs.map(p => [p.id, p.slug])),
    [programs],
  );

  function slugFor(e: CalendarEventDto): string {
    if (!e.programId) return "staff";
    return programSlugMap[e.programId] ?? "staff";
  }

  // Group events by day-of-month
  const eventsByDay = useMemo(() => {
    return events.reduce((acc, e) => {
      const d = parseLocalDate(e.date).getDate();
      (acc[d] = acc[d] ?? []).push(e);
      return acc;
    }, {} as Record<number, CalendarEventDto[]>);
  }, [events]);

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth]);

  const isCurrentMonth = viewYear === today.year && viewMonth === today.month;

  function prevMonth() {
    setSelectedDay(null);
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    setSelectedDay(null);
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function goToToday() {
    setViewYear(today.year);
    setViewMonth(today.month);
    setSelectedDay(null);
  }

  // Detail panel: show selected day, or today if in current month, otherwise nothing
  const detailDay = selectedDay ?? (isCurrentMonth ? today.day : null);
  const detailEvents = detailDay ? (eventsByDay[detailDay] ?? []) : [];

  const detailLabel = detailDay
    ? new Date(viewYear, viewMonth - 1, detailDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : `${MONTH_NAMES[viewMonth - 1]} ${viewYear}`;

  // Other events this month (excluding the selected day so they don't duplicate)
  const otherEvents = useMemo(() => {
    return events
      .filter(e => {
        const d = parseLocalDate(e.date).getDate();
        return detailDay === null || d !== detailDay;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [events, detailDay]);

  const defaultDate = detailDay
    ? `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(detailDay).padStart(2, "0")}`
    : `${viewYear}-${String(viewMonth).padStart(2, "0")}-01`;

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
              <button className="is-active">Month</button>
              <button>Week</button>
            </div>
            <button className="ss-btn ss-btn-primary" type="button" onClick={() => setAddOpen(true)}>
              <Plus className="ss-btn-icon" />
              Add event
            </button>
          </div>
        </div>

        <div className="adm-content">
          {/* program filter chips */}
          <div className="row tight" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {programs.map(p => (
              <span key={p.id} className="ss-chip is-active">
                <span className={`ss-dot ${p.slug}`} />
                {p.name}
              </span>
            ))}
            {programs.length > 0 && (
              <span style={{ width: 1, height: 22, background: "var(--border-strong)", margin: "0 4px" }} />
            )}
            <span className="ss-chip is-active">
              <span className="ss-dot staff" />
              Staff
            </span>
          </div>

          <div className="cal-layout">
            {/* ── Grid ─────────────────────────────────────────────────── */}
            <div className="cal-area">
              <div className="cal-nav">
                <span className="arrow" onClick={prevMonth}><ChevronLeft /></span>
                <span className="arrow" onClick={nextMonth}><ChevronRight /></span>
                <span className="month">{MONTH_NAMES[viewMonth - 1]} {viewYear}</span>
                <button className="ss-btn" type="button" onClick={goToToday}
                  style={{ marginLeft: 8, height: 32, minHeight: 32, padding: "0 14px" }}>
                  Today
                </button>
              </div>

              <div className="cal-grid">
                <div className="cal-dow">
                  {DOW.map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="cal-weeks" style={{ opacity: loading ? 0.4 : 1, transition: "opacity 200ms" }}>
                  {cells.map((c, idx) => {
                    const isOther    = c.slot !== "curr";
                    const isToday    = isCurrentMonth && !isOther && c.d === today.day;
                    const isSelected = !isOther && c.d === selectedDay;
                    const evs  = !isOther ? (eventsByDay[c.d] ?? []) : [];
                    const shown = evs.slice(0, 3);
                    const extra = evs.length - shown.length;
                    return (
                      <div
                        key={idx}
                        className={`cal-cell${isOther ? " is-other" : ""}${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
                        onClick={() => { if (!isOther) setSelectedDay(c.d === selectedDay ? null : c.d); }}
                      >
                        <span className="dnum">{c.d}</span>
                        {shown.map((e, i) => (
                          <span key={i} className={`evt ${slugFor(e)}`}>{e.title}</span>
                        ))}
                        {extra > 0 && <span className="more-link">+{extra} more</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Detail panel ─────────────────────────────────────────── */}
            <div className="cal-detail">
              <div className="section">
                <div className="detail-h">{detailLabel}</div>
                {detailEvents.length === 0 ? (
                  <div style={{ padding: "10px 0", fontSize: 13, color: "var(--fg-tertiary)" }}>
                    {detailDay ? "No events this day" : "Click a day to see its events"}
                  </div>
                ) : detailEvents.map(e => (
                  <div key={e.id} className="evt-card">
                    <div className="et">
                      <span className={`ss-dot ${slugFor(e)}`} />
                      {e.title}
                    </div>
                    {e.location  && <div className="em"><MapPin />{e.location}</div>}
                    {e.timeRange && <div className="em"><Clock />{e.timeRange}</div>}
                  </div>
                ))}
                <button className="btn-dashed" type="button" onClick={() => setAddOpen(true)}>
                  <Plus />Add event
                </button>
              </div>

              {otherEvents.length > 0 && (
                <div className="section">
                  <div className="detail-h">{isCurrentMonth ? "Upcoming" : MONTH_NAMES[viewMonth - 1]}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    {otherEvents.map(e => {
                      const label = parseLocalDate(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      return (
                        <div key={e.id} className="evt-card">
                          <div className="et">
                            <span className={`ss-dot ${slugFor(e)}`} />
                            {e.title}
                          </div>
                          <div className="em">
                            <Clock />{label}{e.timeRange ? ` · ${e.timeRange}` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {addOpen && (
        <AddEventModal
          programs={programs}
          defaultDate={defaultDate}
          onClose={() => setAddOpen(false)}
          onCreated={(e) => {
            const eDate = parseLocalDate(e.date);
            if (eDate.getMonth() + 1 === viewMonth && eDate.getFullYear() === viewYear) {
              setEvents(prev => [...prev, e]);
            }
            setAddOpen(false);
          }}
        />
      )}
    </>
  );
}
