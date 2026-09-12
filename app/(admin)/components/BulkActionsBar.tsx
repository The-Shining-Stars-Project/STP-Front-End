"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Tag, ArrowRightLeft, UserCog, Trash2, X, AlertCircle } from "lucide-react";
import { participantsApi } from "@/lib/api/participants";
import { queryKeys } from "@/lib/api/hooks";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type { ProgramSummaryDto, ParticipantStatus } from "@/lib/types/api";

const STATUSES: { value: ParticipantStatus; label: string }[] = [
  { value: "Active", label: "Active" },
  { value: "Prospective", label: "Prospective" },
  { value: "Attention", label: "Needs attention" },
  { value: "Former", label: "Former" },
];

// ── Dropdown ────────────────────────────────────────────────────────────────
// Small controlled menu: Escape + outside-click close it; items are real
// buttons so they're keyboard-operable.

function Dropdown({
  label,
  icon,
  disabled,
  children,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscapeKey(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="bulk-menu" ref={ref}>
      <button
        type="button"
        className="ss-btn"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {label}
        <ChevronDown style={{ width: 13, height: 13 }} />
      </button>
      {open && (
        <div className="bulk-menu-pop" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ── Modal shell ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEscapeKey(onClose, true);
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
    >
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(440px, 100%)", border: "0.5px solid var(--border-hover)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <div style={{ padding: "var(--space-4)" }}>{children}</div>
        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

// ── Bar ──────────────────────────────────────────────────────────────────────

export default function BulkActionsBar({
  ids,
  programs,
  coordinators,
  isAdmin,
  onClear,
}: {
  ids: string[];
  programs: ProgramSummaryDto[];
  coordinators: string[];
  isAdmin: boolean;
  onClear: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [coordOpen, setCoordOpen] = useState(false);
  const [coordValue, setCoordValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const n = ids.length;
  const noun = `${n} star${n === 1 ? "" : "s"}`;

  /** Run `fn` for every selected id; refresh caches; report partial failures. */
  async function run(fn: (id: string) => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setErr(null);
    const results = await Promise.allSettled(ids.map(fn));
    // Reflect whatever actually landed, even on partial failure (#34).
    await qc.invalidateQueries({ queryKey: queryKeys.participants });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    qc.invalidateQueries({ queryKey: ["program-detail"] });
    setBusy(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) {
      setErr(`${failed} of ${noun} couldn't be updated — try again.`);
      return false;
    }
    onClear();
    return true;
  }

  const setStatus = (status: ParticipantStatus) => run((id) => participantsApi.update(id, { status }));
  const setProgram = (programId: string) => run((id) => participantsApi.update(id, { programId }));

  async function applyCoordinator() {
    const value = coordValue.trim();
    if (!value) return;
    const ok = await run((id) => participantsApi.update(id, { serviceCoordinator: value }));
    if (ok) { setCoordOpen(false); setCoordValue(""); }
  }

  async function confirmDelete() {
    const ok = await run((id) => participantsApi.remove(id));
    if (ok) setDeleteOpen(false);
  }

  return (
    <div className="bulk-bar">
      <span className="count">{noun} selected</span>

      <Dropdown label="Change status" icon={<Tag style={{ width: 14, height: 14 }} />} disabled={busy}>
        {(close) =>
          STATUSES.map((s) => (
            <button key={s.value} type="button" role="menuitem" className="bulk-menu-item" onClick={() => { close(); setStatus(s.value); }}>
              {s.label}
            </button>
          ))
        }
      </Dropdown>

      <Dropdown label="Move to program" icon={<ArrowRightLeft style={{ width: 14, height: 14 }} />} disabled={busy}>
        {(close) =>
          programs.map((p) => (
            <button key={p.id} type="button" role="menuitem" className="bulk-menu-item" onClick={() => { close(); setProgram(p.id); }}>
              <span className={`ss-dot ${p.slug}`} />
              {p.name}
            </button>
          ))
        }
      </Dropdown>

      <button type="button" className="ss-btn" disabled={busy} onClick={() => { setCoordValue(""); setCoordOpen(true); }}>
        <UserCog className="ss-btn-icon" />
        Assign coordinator
      </button>

      {isAdmin && (
        <button type="button" className="ss-btn" disabled={busy} onClick={() => setDeleteOpen(true)} style={{ color: "var(--danger-text)" }}>
          <Trash2 className="ss-btn-icon" />
          Delete
        </button>
      )}

      {busy && <span className="ss-meta">Working…</span>}
      {err && (
        <span className="bulk-err" role="alert" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <AlertCircle style={{ width: 13, height: 13 }} />
          {err}
        </span>
      )}

      <span className="spacer" />
      <button type="button" className="ss-btn" disabled={busy} onClick={onClear}>Clear</button>

      {/* Assign coordinator */}
      {coordOpen && (
        <Modal
          title={`Assign coordinator to ${noun}`}
          onClose={() => setCoordOpen(false)}
          footer={
            <>
              <button className="ss-btn" type="button" onClick={() => setCoordOpen(false)} disabled={busy}>Cancel</button>
              <button className="ss-btn ss-btn-primary" type="button" onClick={applyCoordinator} disabled={busy || !coordValue.trim()}>
                {busy ? "Saving…" : "Apply"}
              </button>
            </>
          }
        >
          <div className="ss-label" style={{ marginBottom: 6 }}>Service coordinator</div>
          <input
            type="text"
            autoFocus
            placeholder="e.g. R. Alvarez"
            value={coordValue}
            onChange={(e) => setCoordValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyCoordinator(); }}
            style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none" }}
          />
          {coordinators.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {coordinators.map((c) => (
                <button key={c} type="button" className="ss-chip" style={{ cursor: "pointer" }} onClick={() => setCoordValue(c)}>{c}</button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteOpen && (
        <Modal
          title={`Delete ${noun}?`}
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <button className="ss-btn" type="button" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</button>
              <button className="ss-btn ss-btn-danger" type="button" onClick={confirmDelete} disabled={busy}>
                <Trash2 className="ss-btn-icon" />
                {busy ? "Deleting…" : `Delete ${noun}`}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.6 }}>
            This permanently removes {noun} and their records. This can&apos;t be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
