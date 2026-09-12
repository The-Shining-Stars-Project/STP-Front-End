"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Plus, Search, Users, X } from "lucide-react";
import { eventsApi } from "@/lib/api/events";
import { useReferenceLists } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/client";
import { useEscapeKey } from "@/lib/useEscapeKey";
import EmptyState from "../components/EmptyState";
import type {
  AttendanceStatus,
  EventCandidateDto,
  EventCategory,
  EventRosterDto,
  EventSessionSummaryDto,
  SiteDto,
} from "@/lib/types/api";

/**
 * Productions and events — one combined register per event, drawing Stars from any programme
 * or location. Deliberately a separate panel from the class attendance view rather than a
 * variation of it: the two never share a record, and the class view's roster is derived from
 * a programme while this one is chosen by hand.
 */

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(first), to: iso(last) };
}

function prettyDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

const CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "Production", label: "Production" },
  { value: "Event", label: "Event" },
];

export default function EventsPanel({ canManage }: { canManage: boolean }) {
  const sites: SiteDto[] = useReferenceLists().data?.sites ?? [];

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [events, setEvents] = useState<EventSessionSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  // An outage must not render as "no events" — the same distinction the class view draws.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<EventRosterDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);

  const loadEvents = useCallback(() => {
    const { from, to } = monthBounds(month);
    setLoading(true);
    setLoadError(null);
    eventsApi.list(from, to)
      .then(setEvents)
      .catch(() => setLoadError("Couldn't load events — check the connection and try again."))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(loadEvents, [loadEvents]);

  function openEvent(id: string) {
    setError(null);
    eventsApi.roster(id).then(setSelected).catch(() => setError("Couldn't open that event."));
  }

  function fail(e: unknown, fallback: string) {
    setError(e instanceof ApiError && e.detail ? e.detail : fallback);
  }

  async function mark(recordId: string, status: AttendanceStatus, siteId: string | null) {
    if (!selected) return;
    setError(null);
    // Optimistic, matching the class view — a register is marked at speed.
    setSelected((prev) => prev && {
      ...prev,
      entries: prev.entries.map((e) => (e.recordId === recordId ? { ...e, status } : e)),
    });
    try {
      await eventsApi.updateRecord(recordId, { status, siteId });
    } catch (e) {
      fail(e, "Couldn't save that mark.");
      openEvent(selected.event.id); // resync from the server
    }
  }

  async function submit() {
    if (!selected) return;
    try {
      await eventsApi.submit(selected.event.id);
      openEvent(selected.event.id);
      loadEvents();
    } catch (e) { fail(e, "Couldn't submit this event."); }
  }

  async function removeStar(participantId: string) {
    if (!selected) return;
    try {
      await eventsApi.removeParticipant(selected.event.id, participantId);
      openEvent(selected.event.id);
    } catch (e) { fail(e, "Couldn't remove that star."); }
  }

  // ── roster view ─────────────────────────────────────────────────────────────
  if (selected) {
    const ev = selected.event;
    const locked = ev.status === "Submitted";
    return (
      <>
        {error && <ErrorBar text={error} onClose={() => setError(null)} />}

        <button type="button" className="ss-btn" style={{ marginBottom: "var(--space-3)" }}
          onClick={() => { setSelected(null); loadEvents(); }}>
          ← All events
        </button>

        <div className="widget">
          <div className="widget-head" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <CalendarDays className="ico" style={{ color: "var(--primary)" }} />
            <h3 style={{ margin: 0 }}>{ev.title}</h3>
            <span className="ss-chip">{ev.category}</span>
            <span style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>{prettyDay(ev.date)}</span>
            {ev.sites.map((s) => <span key={s.id} className="ss-chip">{s.name}</span>)}
            <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>
                {ev.markedCount} of {ev.totalCount} marked
              </span>
              {canManage && !locked && (
                <>
                  <button type="button" className="ss-btn" onClick={() => setAdding(true)}>
                    <Plus className="ss-btn-icon" />Add stars
                  </button>
                  <button type="button" className="ss-btn ss-btn-primary" onClick={submit}>
                    <Check className="ss-btn-icon" />Submit
                  </button>
                </>
              )}
              {locked && <span className="ss-chip is-active">Submitted</span>}
            </span>
          </div>

          <div className="widget-body">
            <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginBottom: "var(--space-3)" }}>
              Tracked separately — not counted in class attendance %.
            </p>

            {selected.entries.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
                No stars added yet — use <strong>Add stars</strong> to pull from any location.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {selected.entries.map((e) => (
                  <div key={e.recordId}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", flexWrap: "wrap" }}>
                    <span className="ss-avatar teacher sm">{e.participantInitials}</span>
                    <span style={{ fontSize: "var(--fs-body)" }}>{e.participantName}</span>
                    <span className="ss-chip">{e.programName}</span>
                    {e.siteName && <span style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>{e.siteName}</span>}

                    <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      {(["Present", "Absent"] as const).map((st) => (
                        <button key={st} type="button"
                          disabled={locked || !e.canMark}
                          onClick={() => mark(e.recordId, st, e.siteId)}
                          className={`ss-chip${e.status === st ? " is-active" : ""}`}
                          style={{ cursor: locked || !e.canMark ? "not-allowed" : "pointer", opacity: locked || !e.canMark ? 0.5 : 1 }}>
                          {st}
                        </button>
                      ))}
                      {canManage && !locked && (
                        <button type="button"
                          onClick={() => removeStar(e.participantId)}
                          disabled={e.status !== "Unmarked"}
                          title={e.status !== "Unmarked"
                            ? "Set back to Unmarked before removing."
                            : `Remove ${e.participantName} from this event`}
                          aria-label={`Remove ${e.participantName}`}
                          style={{ border: "none", background: "none", cursor: e.status !== "Unmarked" ? "not-allowed" : "pointer", color: "var(--fg-tertiary)", opacity: e.status !== "Unmarked" ? 0.35 : 1, display: "inline-flex" }}>
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {adding && (
          <AddStarsModal
            eventId={ev.id}
            sites={ev.sites}
            onClose={() => setAdding(false)}
            onAdded={(roster) => { setSelected(roster); setAdding(false); }}
            onError={(msg) => setError(msg)}
          />
        )}
      </>
    );
  }

  // ── list view ───────────────────────────────────────────────────────────────
  return (
    <>
      {error && <ErrorBar text={error} onClose={() => setError(null)} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          aria-label="Month"
          style={{ border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none" }} />
        {canManage && (
          <button type="button" className="ss-btn ss-btn-primary" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}>
            <Plus className="ss-btn-icon" />New event
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
      ) : loadError ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--danger-text, var(--danger))", fontSize: 13 }}>{loadError}</div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No productions or events this month"
          description={canManage
            ? "Create one to take a combined register across locations."
            : "Nothing scheduled for this month."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {events.map((e) => (
            <button key={e.id} type="button" onClick={() => openEvent(e.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "0.5px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", cursor: "pointer", textAlign: "left", flexWrap: "wrap", font: "inherit", color: "var(--fg)" }}>
              <span className="ss-chip">{e.category}</span>
              <span style={{ fontSize: "var(--fs-body)", fontWeight: "var(--w-medium)" }}>{e.title}</span>
              <span style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>{prettyDay(e.date)}</span>
              {e.venue && <span style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>{e.venue}</span>}
              {e.sites.map((s) => <span key={s.id} className="ss-chip">{s.name}</span>)}
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg-tertiary)" }}>
                <Users style={{ width: 13, height: 13 }} />
                {e.markedCount} / {e.totalCount}
                {e.status === "Submitted" && <span className="ss-chip is-active">Submitted</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <EventFormModal
          sites={sites}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); loadEvents(); }}
          onError={(msg) => setError(msg)}
        />
      )}
    </>
  );
}

function ErrorBar({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-4)", padding: "9px 12px", borderRadius: "var(--r-md)", fontSize: 13, background: "var(--danger-fill)", color: "var(--danger-text)", border: "0.5px solid var(--danger-border)" }}>
      <X style={{ width: 14, height: 14 }} />
      {text}
      <button type="button" onClick={onClose} aria-label="Dismiss"
        style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "inherit", display: "inline-flex" }}>
        <X style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );
}

function EventFormModal({
  sites, onClose, onCreated, onError,
}: {
  sites: SiteDto[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<EventCategory>("Production");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [venue, setVenue] = useState("");
  const [siteIds, setSiteIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  useEscapeKey(onClose);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await eventsApi.create({
        title: title.trim(), category, date,
        venue: venue.trim() || null, siteIds: [...siteIds],
      });
      onCreated();
    } catch (e) {
      onError(e instanceof ApiError && e.detail ? e.detail : "Couldn't create that event.");
      setSaving(false);
    }
  }

  return (
    <Modal label="New production or event" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="ss-label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring Showcase"
            style={inputStyle} autoFocus />
        </label>

        <div>
          <div className="ss-label" style={{ marginBottom: 4 }}>Type</div>
          <div style={{ display: "flex", gap: 6 }}>
            {CATEGORIES.map((c) => (
              <button key={c.value} type="button" className={`ss-chip${category === c.value ? " is-active" : ""}`}
                style={{ cursor: "pointer" }} onClick={() => setCategory(c.value)}>{c.label}</button>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="ss-label">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="ss-label">Venue</span>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Main Stage" style={inputStyle} />
        </label>

        <div>
          <div className="ss-label" style={{ marginBottom: 4 }}>Locations taking part</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sites.map((s) => {
              const on = siteIds.has(s.id);
              return (
                <button key={s.id} type="button" className={`ss-chip${on ? " is-active" : ""}`} style={{ cursor: "pointer" }}
                  aria-pressed={on}
                  onClick={() => setSiteIds((prev) => {
                    const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n;
                  })}>
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)" }}>
        <button type="button" className="ss-btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="ss-btn ss-btn-primary" onClick={save} disabled={saving || !title.trim()}>
          {saving ? "Creating…" : "Create event"}
        </button>
      </div>
    </Modal>
  );
}

function AddStarsModal({
  eventId, sites, onClose, onAdded, onError,
}: {
  eventId: string;
  sites: { id: string; name: string }[];
  onClose: () => void;
  onAdded: (roster: EventRosterDto) => void;
  onError: (msg: string) => void;
}) {
  const [candidates, setCandidates] = useState<EventCandidateDto[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [siteId, setSiteId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  useEscapeKey(onClose);

  useEffect(() => {
    eventsApi.candidates(eventId).then(setCandidates).catch(() => setCandidates([]));
  }, [eventId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => !q || c.fullName.toLowerCase().includes(q) || c.programName.toLowerCase().includes(q));
  }, [candidates, query]);

  async function save() {
    if (picked.size === 0) return;
    setSaving(true);
    try {
      const roster = await eventsApi.addParticipants(eventId, {
        participantIds: [...picked],
        siteId: siteId || null,
      });
      onAdded(roster);
    } catch (e) {
      onError(e instanceof ApiError && e.detail ? e.detail : "Couldn't add those stars.");
      setSaving(false);
    }
  }

  return (
    <Modal label="Add stars to this event" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-4)", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 10px" }}>
          <Search style={{ width: 14, height: 14, color: "var(--fg-tertiary)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any programme…"
            aria-label="Search stars"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--fg)", width: "100%" }} autoFocus />
        </div>

        {sites.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-tertiary)" }}>
            Performing with
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ ...inputStyle, padding: "4px 8px", fontSize: 12 }}>
              <option value="">— no location —</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {shown.map((c) => {
            const on = picked.has(c.participantId);
            return (
              <button key={c.participantId} type="button"
                disabled={c.alreadyAdded}
                aria-pressed={on}
                onClick={() => setPicked((prev) => {
                  const n = new Set(prev); n.has(c.participantId) ? n.delete(c.participantId) : n.add(c.participantId); return n;
                })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: "var(--r-md)", border: `0.5px solid ${on ? "var(--primary)" : "var(--border)"}`, background: on ? "var(--primary-fill)" : "var(--surface)", cursor: c.alreadyAdded ? "not-allowed" : "pointer", opacity: c.alreadyAdded ? 0.45 : 1, font: "inherit", color: "var(--fg)", textAlign: "left" }}>
                <span className="ss-avatar teacher sm">{c.initials}</span>
                <span style={{ fontSize: "var(--fs-body)" }}>{c.fullName}</span>
                <span className="ss-chip">{c.programName}</span>
                {c.alreadyAdded && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-tertiary)" }}>already added</span>}
                {on && !c.alreadyAdded && <Check style={{ marginLeft: "auto", width: 14, height: 14, color: "var(--primary)" }} />}
              </button>
            );
          })}
          {shown.length === 0 && (
            <div style={{ padding: "16px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>No stars match.</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)" }}>
        <span style={{ marginRight: "auto", fontSize: 12, color: "var(--fg-tertiary)" }}>
          {picked.size} selected
        </span>
        <button type="button" className="ss-btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="ss-btn ss-btn-primary" onClick={save} disabled={saving || picked.size === 0}>
          {saving ? "Adding…" : `Add ${picked.size || ""}`.trim()}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
     >
      <div role="dialog" aria-modal="true" aria-label={label}
        style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(520px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "var(--space-3) var(--space-4)", borderBottom: "0.5px solid var(--border)" }}>
          <h3 style={{ margin: 0, fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)" }}>{label}</h3>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--fg-secondary)", display: "inline-flex" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
  padding: "7px 10px", fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none",
};
