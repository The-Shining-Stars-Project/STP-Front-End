"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ChevronRight, Plus, X, Pencil, Check } from "lucide-react";
import { programsApi } from "@/lib/api/programs";
import { usePrograms, queryKeys } from "@/lib/api/hooks";
import LoadError from "@/app/components/LoadError";
import { ApiError } from "@/lib/api/client";
import type { ProgramSummaryDto, CreateProgramDto, UpdateProgramDto } from "@/lib/types/api";

// ── Color palette ─────────────────────────────────────────────────────────────

type ProgramColor = { key: string; label: string; main: string; fill: string; border: string };

const COLOR_OPTIONS: ProgramColor[] = [
  { key: "blue",   label: "Blue",   main: "#378add", fill: "#e6f1fb", border: "#85b7eb" },
  { key: "teal",   label: "Teal",   main: "#1d9e75", fill: "#e1f5ee", border: "#5dcaa5" },
  { key: "coral",  label: "Coral",  main: "#d85a30", fill: "#faece7", border: "#f0997b" },
  { key: "amber",  label: "Amber",  main: "#ef9f27", fill: "#faeeda", border: "#efcf87" },
  { key: "purple", label: "Purple", main: "#7c6bc4", fill: "#ede9f7", border: "#b5abdf" },
  { key: "rose",   label: "Rose",   main: "#c04a70", fill: "#fae8ef", border: "#e8a0b8" },
];

function colorFromHex(hex: string): ProgramColor {
  const match = COLOR_OPTIONS.find((c) => c.main.toLowerCase() === hex.toLowerCase());
  return match ?? { key: "custom", label: "Custom", main: hex, fill: hex + "22", border: hex + "66" };
}

// ── Schedule helpers ──────────────────────────────────────────────────────────

const DAYS: { full: string; abbr: string }[] = [
  { full: "Sunday", abbr: "Sun" },
  { full: "Monday", abbr: "Mon" },
  { full: "Tuesday", abbr: "Tue" },
  { full: "Wednesday", abbr: "Wed" },
  { full: "Thursday", abbr: "Thu" },
  { full: "Friday", abbr: "Fri" },
  { full: "Saturday", abbr: "Sat" },
];
const DAY_ORDER = DAYS.map((d) => d.full);

/** "Monday, Wednesday, Friday" | "None" | null → ["Monday","Wednesday","Friday"] */
function parseDays(s: string | null | undefined): string[] {
  if (!s || s === "None") return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
/** ["Monday","Wednesday","Friday"] → "Mon / Wed / Fri" (display label) */
function scheduleLabel(days: string[]): string {
  return days
    .slice()
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    .map((f) => DAYS.find((d) => d.full === f)?.abbr ?? f)
    .join(" / ");
}
/** "09:00:00" → "09:00" for <input type="time"> */
function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

// ── Local card type ───────────────────────────────────────────────────────────

type ProgramCard = {
  id: string;
  slug: string;
  label: string;
  enrolled: number;
  attendance: number | null;
  schedule: string;
  nextSession: string;
  nextMeta: string;
  alertCount: number;
  color: ProgramColor;
  // editable schedule fields
  meetingDays: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
};

function dtoToCard(dto: ProgramSummaryDto): ProgramCard {
  return {
    id: dto.id,
    slug: dto.slug,
    label: dto.name,
    enrolled: dto.enrolledCount,
    attendance: dto.attendancePct ?? null,
    schedule: dto.sessionSchedule ?? "—",
    nextSession: dto.nextSessionDate ?? "TBD",
    nextMeta: dto.nextSessionMeta ?? (dto.defaultLocation ?? ""),
    alertCount: dto.alertCount,
    color: colorFromHex(dto.colorHex),
    meetingDays: dto.meetingDays ?? "None",
    startTime: dto.startTime,
    endTime: dto.endTime,
    location: dto.defaultLocation ?? "",
  };
}

// ── Program form (create + edit) ───────────────────────────────────────────────

type ProgForm = { name: string; colorKey: string; days: string[]; start: string; end: string; location: string };

function emptyForm(): ProgForm {
  return { name: "", colorKey: "", days: [], start: "", end: "", location: "" };
}
function formFromCard(c: ProgramCard): ProgForm {
  return {
    name: c.label,
    colorKey: c.color.key,
    days: parseDays(c.meetingDays),
    start: hhmm(c.startTime),
    end: hhmm(c.endTime),
    location: c.location,
  };
}

function ProgramFormModal({
  mode,
  initial,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial?: ProgramCard;
  onClose: () => void;
  onSubmit: (form: ProgForm) => void;
}) {
  const [form, setForm] = useState<ProgForm>(() => (initial ? formFromCard(initial) : emptyForm()));
  const canSubmit = form.name.trim().length > 0 && form.colorKey !== "";

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
    padding: "8px 12px", fontSize: 13, color: "var(--fg)",
    background: "var(--surface)", outline: "none",
  };

  function toggleDay(full: string) {
    setForm((f) => ({
      ...f,
      days: f.days.includes(full) ? f.days.filter((d) => d !== full) : [...f.days, full],
    }));
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(43,42,38,.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: "var(--space-4)",
      }}
    >
      <div style={{
        background: "var(--surface)", borderRadius: "var(--r-lg)",
        width: "min(480px, 100%)", display: "flex", flexDirection: "column",
        border: "0.5px solid var(--border-hover)", maxHeight: "90vh",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0,
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>
              {mode === "edit" ? "Edit program" : "Create program"}
            </h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
              {mode === "edit" ? "Changes apply to this program and new sessions" : "New program will appear on the Programs page"}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>
              Program name <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span>
            </div>
            <input type="text" placeholder="e.g. Stockton Drama" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={inputStyle} autoFocus />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>
              Color <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLOR_OPTIONS.map((c) => {
                const selected = form.colorKey === c.key;
                return (
                  <button key={c.key} type="button" title={c.label}
                    onClick={() => setForm((f) => ({ ...f, colorKey: c.key }))}
                    style={{
                      width: 28, height: 28, borderRadius: "var(--r-circle)",
                      background: c.main, border: selected ? "2.5px solid var(--fg)" : "2.5px solid transparent",
                      cursor: "pointer", outline: selected ? `2px solid ${c.main}` : "none",
                      outlineOffset: 2, flexShrink: 0,
                    }} />
                );
              })}
            </div>
          </div>

          {/* Meeting days */}
          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>
              Meeting days{" "}
              <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>
                Determines which days this program appears for attendance
              </span>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {DAYS.map((d) => (
                <button
                  key={d.full}
                  type="button"
                  className={`ss-chip${form.days.includes(d.full) ? " is-active" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleDay(d.full)}
                >
                  {d.abbr}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>
                Start time <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span>
              </div>
              <input type="time" value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>
                End time <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span>
              </div>
              <input type="time" value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                style={inputStyle} />
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>
              Location <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional — e.g. Room B</span>
            </div>
            <input type="text" placeholder="Room B" value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              style={inputStyle} />
          </div>
        </div>

        <div style={{
          padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)",
          display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0,
        }}>
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" disabled={!canSubmit} onClick={() => onSubmit(form)}>
            {mode === "edit" ? <Check className="ss-btn-icon" /> : <Plus className="ss-btn-icon" />}
            {mode === "edit" ? "Save changes" : "Create program"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProgramsPage() {
  const router = useRouter();
  // Cached + shared with every other page that lists programs (#34).
  const queryClient = useQueryClient();
  const programsQ = usePrograms();
  const loading = programsQ.isPending;
  const programs = useMemo(() => (programsQ.data ?? []).map(dtoToCard), [programsQ.data]);
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<ProgramCard | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function closeModal() { setMode(null); setEditing(null); }

  // Shared payload from the form (color + structured schedule).
  function buildPayload(form: ProgForm) {
    const color = COLOR_OPTIONS.find((c) => c.key === form.colorKey);
    const colorHex = color ? color.main : (editing?.color.main ?? "#378add");
    const days = form.days;
    return {
      name: form.name.trim(),
      colorHex,
      meetingDays: days.length ? days.join(", ") : "None",
      startTime: form.start ? `${form.start}:00` : undefined,
      endTime: form.end ? `${form.end}:00` : undefined,
      sessionSchedule: days.length ? scheduleLabel(days) : undefined,
      defaultLocation: form.location.trim() || undefined,
    };
  }

  async function handleSubmit(form: ProgForm) {
    setSaveError(null);

    if (mode === "edit" && editing) {
      const dto: UpdateProgramDto = { ...buildPayload(form) };
      try {
        await programsApi.update(editing.id, dto);
        queryClient.invalidateQueries({ queryKey: queryKeys.programs });
      } catch (e) {
        // A failed save must not masquerade as a successful one (#35).
        setSaveError(e instanceof ApiError && e.detail ? e.detail : "Couldn't save the program — try again.");
      }
      closeModal();
      return;
    }

    // create
    const dto: CreateProgramDto = buildPayload(form);
    try {
      const created = await programsApi.create(dto);
      queryClient.invalidateQueries({ queryKey: queryKeys.programs });
      closeModal();
      router.push(`/programs/${created.slug}`);
    } catch (e) {
      setSaveError(e instanceof ApiError && e.detail ? e.detail : "Couldn't create the program — try again.");
      closeModal();
    }
  }

  return (
    <>
      <style>{`
        .prog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-4); }
        .prog-card { display: flex; flex-direction: column; background: var(--surface); border: 0.5px solid var(--border); border-radius: var(--r-lg); text-decoration: none; color: var(--fg); overflow: hidden; transition: border-color 100ms; }
        .prog-card:hover { border-color: var(--border-hover); }
        .prog-card-head { padding: 16px 16px 14px; border-bottom: 0.5px solid var(--border); }
        .prog-card-stats { display: flex; flex: 1; padding: 14px 0; }
        .prog-stat { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 0 12px; }
        .prog-stat + .prog-stat { border-left: 0.5px solid var(--border); }
        .prog-stat .num { font-size: 18px; font-weight: 500; color: var(--fg); line-height: 1; }
        .prog-stat .lbl { font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--fg-tertiary); }
        .prog-card-foot { padding: 8px 14px; border-top: 0.5px solid var(--border); background: var(--bg); display: flex; align-items: center; justify-content: space-between; }
        .prog-edit-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--r-sm); border: 0.5px solid var(--border); background: var(--surface); color: var(--fg-secondary); cursor: pointer; flex-shrink: 0; }
        .prog-edit-btn:hover { border-color: var(--border-hover); color: var(--fg); }
        .prog-skeleton { height: 160px; background: var(--surface); border: 0.5px solid var(--border); border-radius: var(--r-lg); animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>

      <div className="adm-main">
        <div className="adm-topbar">
          <div className="titles">
            <h1>Programs</h1>
            <span className="date">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
          <div className="right">
            <button className="ss-btn ss-btn-primary" type="button" onClick={() => { setEditing(null); setMode("create"); }}>
              <Plus className="ss-btn-icon" />
              Create program
            </button>
          </div>
        </div>

        <div className="adm-content">
          {saveError && (
            <div
              role="alert"
              style={{
                marginBottom: "var(--space-4)", padding: "10px 14px", borderRadius: "var(--r-md)",
                background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 13,
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
              {saveError}
              <button
                onClick={() => setSaveError(null)}
                aria-label="Dismiss"
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", display: "inline-flex" }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="prog-grid">
              {[1, 2, 3].map((i) => <div key={i} className="prog-skeleton" />)}
            </div>
          ) : programsQ.isError ? (
            <LoadError
              title="Couldn't load programs"
              error={programsQ.error}
              onRetry={() => programsQ.refetch()}
            />
          ) : (
            <div className="prog-grid">
              {programs.map((p) => (
                <Link key={p.id} href={`/programs/${p.slug}`} className="prog-card">
                  <div className="prog-card-head" style={{ background: p.color.fill }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span className="ss-dot" style={{ background: p.color.main, flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{p.label}</span>
                      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {p.alertCount > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--danger)" }}>
                            <AlertCircle style={{ width: 11, height: 11 }} />{p.alertCount}
                          </span>
                        )}
                        <button
                          type="button"
                          className="prog-edit-btn"
                          title="Edit program"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(p); setMode("edit"); }}
                        >
                          <Pencil style={{ width: 12, height: 12 }} />
                        </button>
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-secondary)" }}>
                      {p.enrolled} enrolled · {p.schedule}
                    </div>
                  </div>

                  <div className="prog-card-stats">
                    <div className="prog-stat">
                      <span className="num">{p.attendance !== null ? `${p.attendance}%` : "—"}</span>
                      <span className="lbl">Attendance</span>
                    </div>
                    <div className="prog-stat">
                      <span className="num">{p.nextSession}</span>
                      <span className="lbl">Next Session</span>
                    </div>
                    <div className="prog-stat">
                      <span className="num" style={{ color: p.alertCount > 0 ? "var(--danger)" : "var(--fg)" }}>{p.alertCount}</span>
                      <span className="lbl">Alerts</span>
                    </div>
                  </div>

                  <div className="prog-card-foot">
                    <span style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>{p.nextMeta}</span>
                    <ChevronRight style={{ width: 13, height: 13, color: "var(--fg-tertiary)" }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {mode && (
        <ProgramFormModal
          mode={mode}
          initial={editing ?? undefined}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
