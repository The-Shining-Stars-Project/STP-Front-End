"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  X,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import { attendanceApi } from "@/lib/api/attendance";
import { usePrograms } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type {
  ScheduledSessionDto,
  SessionRosterDto,
  AttendanceStatus,
  ProgramSummaryDto,
} from "@/lib/types/api";
import {
  SessionCard,
  AdHocStarter,
  RosterView,
  NoteModal,
  type Filter,
  todayStr,
  prettyDate,
} from "./_components";
import EmptyState from "../components/EmptyState";
import EventsPanel from "./_events";

export default function AttendancePage() {
  const { isAdmin, canManage } = useAuth();

  // Classes and events are two different registers, not two views of one — event attendance
  // is tracked separately and never counts toward class attendance %.
  const [tab, setTab] = useState<"classes" | "events">("classes");

  const [date, setDate] = useState<string>(todayStr());
  const [cards, setCards] = useState<ScheduledSessionDto[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  // Distinguish "backend unreachable" from "no sessions today" (#35) — for an
  // attendance tool, rendering an outage as an empty state is an operational hazard.
  const [cardsError, setCardsError] = useState<string | null>(null);

  const [selected, setSelected] = useState<SessionRosterDto | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // note modal
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<"observation" | "concern">("observation");
  const [savingNote, setSavingNote] = useState(false);

  // submit
  const [submitting, setSubmitting] = useState(false);

  // Escape closes the note modal (#41)
  useEscapeKey(() => setNoteFor(null), noteFor !== null && !savingNote);

  // ad-hoc
  // Cached + shared via React Query (#34).
  const programs: ProgramSummaryDto[] = usePrograms().data ?? [];
  const [adhocId, setAdhocId] = useState<string>("");
  const [adhocOpen, setAdhocOpen] = useState(false);

  const loadCards = useCallback((d: string) => {
    setLoadingCards(true);
    setCardsError(null);
    attendanceApi.getScheduled(d)
      .then(setCards)
      .catch((e: unknown) => {
        setCards([]);
        setCardsError(e instanceof ApiError && e.detail ? e.detail : "Couldn't load sessions — the server may be unreachable.");
      })
      .finally(() => setLoadingCards(false));
  }, []);

  useEffect(() => { loadCards(date); }, [date, loadCards]);

  function changeDate(d: string) {
    setSelected(null);
    setError(null);
    setAdhocOpen(false);
    setDate(d);
  }

  async function openSession(programId: string) {
    setError(null);
    setLoadingRoster(true);
    setFilter("all");
    setQuery("");
    try {
      // POST: opening a session is a write (creates it if needed) — see #23.
      const roster = await attendanceApi.openProgramSession(programId, date);
      setSelected(roster);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setError("You're not assigned to that program.");
      } else {
        setError("Couldn't open that session. Try again.");
      }
    } finally {
      setLoadingRoster(false);
    }
  }

  function backToList() {
    setSelected(null);
    setError(null);
    loadCards(date); // refresh counts/status
  }

  const refreshSelected = useCallback(async () => {
    if (!selected) return;
    try {
      const roster = await attendanceApi.getProgramSession(selected.programId, date);
      setSelected(roster);
    } catch { /* leave as-is */ }
  }, [selected, date]);

  async function mark(recordId: string, target: AttendanceStatus) {
    if (!selected || selected.status === "submitted") return;
    const entry = selected.entries.find((e) => e.recordId === recordId);
    if (!entry) return;
    const prev = entry.status;
    // Tapping the selected status no longer clears it to Unmarked: on an iPad a double-tap on
    // Present read as "it didn't take" (client, Sep 2026). A second tap is simply a no-op.
    if (prev === target) return;
    const next: AttendanceStatus = target;

    setSelected((s) =>
      s ? { ...s, entries: s.entries.map((e) => (e.recordId === recordId ? { ...e, status: next } : e)) } : s
    );
    try {
      await attendanceApi.updateRecord(recordId, { status: next });
    } catch (e) {
      setSelected((s) =>
        s ? { ...s, entries: s.entries.map((en) => (en.recordId === recordId ? { ...en, status: prev } : en)) } : s
      );
      if (e instanceof ApiError && e.status === 409) {
        // 409 = submitted-and-locked or an edit collision (#26) — the backend's
        // message says which; fall back to the lock copy.
        setError(e.detail ?? "This session was submitted and is now locked.");
        refreshSelected();
      }
    }
  }

  function openNote(recordId: string) {
    setNoteText("");
    setNoteType("observation");
    setNoteFor(recordId);
  }

  async function saveNote() {
    if (!noteFor || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const created = await attendanceApi.addNote(noteFor, { content: noteText.trim(), noteType });
      setSelected((s) =>
        s ? { ...s, entries: s.entries.map((e) => (e.recordId === noteFor ? { ...e, notes: [...e.notes, created] } : e)) } : s
      );
      setNoteFor(null);
    } catch {
      /* keep modal open */
    } finally {
      setSavingNote(false);
    }
  }

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await attendanceApi.submitSession(selected.sessionId);
      setSelected((s) => (s ? { ...s, status: "submitted" } : s));
    } catch {
      setError("Couldn't submit attendance. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Management only. Every unlock is audited server-side (attendance.session.reopen), and
  // every mark that follows is audited as usual — attendance drives funding.
  async function reopen() {
    if (!selected) return;
    if (!window.confirm("Reopen this session for edits? The change is recorded in the audit log.")) return;
    setSubmitting(true);
    try {
      await attendanceApi.reopenSession(selected.sessionId);
      setSelected((s) => (s ? { ...s, status: "open", submittedAt: null } : s));
      setError(null);
    } catch {
      setError("Couldn't reopen the session. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const entries = selected?.entries ?? [];
  const total = entries.length;
  const present = entries.filter((e) => e.status === "Present").length;
  const absent = entries.filter((e) => e.status === "Absent").length;
  const rescheduled = entries.filter((e) => e.status === "Rescheduled").length;
  const notScheduled = entries.filter((e) => e.status === "NotScheduled").length;
  const marked = entries.filter((e) => e.status !== "Unmarked").length;
  const locked = selected?.status === "submitted";

  const visibleEntries = useMemo(
    () =>
      entries.filter((e) => {
        if (filter === "present" && e.status !== "Present") return false;
        if (filter === "absent" && e.status !== "Absent") return false;
        if (filter === "rescheduled" && e.status !== "Rescheduled") return false;
        if (filter === "not scheduled" && e.status !== "NotScheduled") return false;
        if (filter === "unmarked" && e.status !== "Unmarked") return false;
        if (query && !e.fullName.toLowerCase().includes(query.toLowerCase().trim())) return false;
        return true;
      }),
    [entries, filter, query]
  );

  const noteEntry = noteFor ? entries.find((e) => e.recordId === noteFor) ?? null : null;

  // programs available for an ad-hoc session (those not already shown as cards today)
  const cardProgramIds = useMemo(() => new Set(cards.map((c) => c.programId)), [cards]);
  const adhocOptions = useMemo(
    () => programs.filter((p) => !cardProgramIds.has(p.id)),
    [programs, cardProgramIds]
  );

  const th: React.CSSProperties = {
    textAlign: "left", padding: "9px 16px", fontSize: 11, fontWeight: 500,
    textTransform: "uppercase", letterSpacing: ".04em", color: "var(--fg-tertiary)", whiteSpace: "nowrap",
  };

  return (
    <>
      <div className="adm-main">
        <div className="adm-topbar">
          <div className="titles">
            <h1>Attendance</h1>
            <span className="date">{prettyDate(date)}</span>
          </div>
          <div className="right">
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6,
                border: "0.5px solid var(--border-hover)", borderRadius: 8,
                padding: "5px 10px", background: "var(--surface)",
              }}
            >
              <CalendarDays style={{ width: 14, height: 14, color: "var(--fg-tertiary)" }} />
              <input
                type="date"
                value={date}
                onChange={(e) => changeDate(e.target.value || todayStr())}
                style={{ border: "none", outline: "none", fontSize: 13, background: "transparent", color: "var(--fg)" }}
              />
            </div>
          </div>
        </div>

        <div className="adm-content">
          <div role="tablist" aria-label="Attendance type"
            style={{ display: "flex", gap: 6, marginBottom: "var(--space-4)" }}>
            {([["classes", "Classes"], ["events", "Productions & Events"]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key}
                className={`ss-chip${tab === key ? " is-active" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "events" ? (
            <EventsPanel canManage={canManage} />
          ) : (
          <>
          {error && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-4)",
                padding: "9px 12px", borderRadius: "var(--r-md)", fontSize: 13,
                background: "var(--danger-fill)", color: "var(--danger-text)",
                border: "0.5px solid var(--danger-border)",
              }}
            >
              <X style={{ width: 14, height: 14 }} />
              {error}
            </div>
          )}

          {selected ? (
            // ── ROSTER VIEW ──────────────────────────────────────────────────
            <RosterView
              rescheduled={rescheduled} notScheduled={notScheduled} canManage={canManage}
              selected={selected}
              locked={locked}
              total={total}
              present={present}
              absent={absent}
              marked={marked}
              filter={filter}
              setFilter={setFilter}
              query={query}
              setQuery={setQuery}
              visibleEntries={visibleEntries}
              loadingRoster={loadingRoster}
              onBack={backToList}
              onMark={mark}
              onOpenNote={openNote}
              onSubmit={submit}
              onReopen={reopen}
              submitting={submitting}
              th={th}
            />
          ) : (
            // ── LANDING: SESSION CARDS ───────────────────────────────────────
            <>
              <div style={{ marginBottom: "var(--space-4)", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                  {isAdmin ? "Sessions" : "Your sessions"} for this day
                </h3>
                <span className="ss-meta">
                  {loadingRoster ? "Opening…" : `${cards.length} session${cards.length !== 1 ? "s" : ""}`}
                </span>
              </div>

              {loadingCards ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
                  Loading sessions…
                </div>
              ) : cardsError ? (
                <EmptyState
                  icon={AlertTriangle}
                  tone="danger"
                  title="Couldn't load sessions"
                  description={cardsError}
                  action={
                    <button className="ss-btn ss-btn-primary" onClick={() => loadCards(date)}>
                      Retry
                    </button>
                  }
                />
              ) : (
                <>
                  {cards.length > 0 ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                        gap: "var(--space-4)",
                      }}
                    >
                      {cards.map((c) => (
                        <SessionCard key={c.programId} card={c} onOpen={() => openSession(c.programId)} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={CalendarDays}
                      title="No sessions scheduled"
                      description="No programs meet on this day. Pick another date, or start an ad-hoc session below."
                    />
                  )}

                  {/* ad-hoc */}
                  <AdHocStarter
                    open={adhocOpen}
                    setOpen={setAdhocOpen}
                    options={adhocOptions}
                    value={adhocId}
                    setValue={setAdhocId}
                    onStart={() => { if (adhocId) openSession(adhocId); }}
                  />
                </>
              )}
            </>
          )}
          </>
          )}
        </div>
      </div>

      {/* note modal */}
      {noteEntry ? (
        <NoteModal
          entry={noteEntry}
          dateLabel={`${prettyDate(date)} · ${noteEntry.programName}`}
          noteText={noteText}
          setNoteText={setNoteText}
          noteType={noteType}
          setNoteType={setNoteType}
          saving={savingNote}
          onClose={() => setNoteFor(null)}
          onSave={saveNote}
        />
      ) : null}
    </>
  );
}

