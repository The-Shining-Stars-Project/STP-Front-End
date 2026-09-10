"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { scriptsApi } from "@/lib/api/scripts";
import { programsApi } from "@/lib/api/programs";
import { ApiError } from "@/lib/api/client";
import {
  BookOpen,
  Search,
  Plus,
  AlertCircle,
  X,
} from "lucide-react";

import { AddScriptModal, ScriptDetailPanel, ScriptCard } from "./_components";
import {
  type Script,
  type Prog,
  type StatusFilter,
  type FormState,
  INITIAL_SCRIPTS,
  progFromName,
  STATUS_FILTERS,
  PROG_FILTERS,
  PROG_LABEL,
  EMPTY_FORM,
  LOCAL_TYPE_TO_API,
  LOCAL_STATUS_TO_API,
  scriptFromDto,
  formFromScript,
  pdfProblem,
} from "./_model";

/** Why the last PDF action failed, and for which script — shown until dismissed or retried. */
type PdfNotice = { scriptId: string; title: string; message: string };

/** Turns an API failure into a sentence a coordinator can act on. */
function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.detail) return err.detail;
    if (err.status === 413) return "That file is larger than the 25 MB limit.";
    if (err.status === 403) return "You do not have permission to change script files.";
    if (err.status === 404) return "That PDF is no longer available.";
    return `The request failed (${err.status || "network"}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

/**
 * Hands a downloaded Blob to the browser as a file. An anchor with `download` avoids the
 * pop-up blocker that a window.open after an await would trip; the object URL is revoked
 * after a generous delay so a slow disk still gets the bytes.
 */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  // The demo rows have no backend id, so edits to them never reach the API — they must
  // never be what production shows (the same trap as the Development-only program seeder).
  const [scripts, setScripts] = useState<Script[]>(
    process.env.NODE_ENV === "development" ? INITIAL_SCRIPTS : []
  );
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [progFilter, setProgFilter] = useState<"all" | Prog>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // The script being edited; null means the modal is in "add" mode.
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  // program slug → GUID, so newly-created scripts can be linked to real programs.
  const [progIdBySlug, setProgIdBySlug] = useState<Record<string, string>>({});
  // PDF work in flight (by script id) and the last failure, if any.
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [pdfNotice, setPdfNotice] = useState<PdfNotice | null>(null);

  // Load real scripts from the API (#18). The library is shown as the API reports it,
  // empty included; only in development does an empty/unreachable API leave the demo rows.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [dtos, programs] = await Promise.all([
          scriptsApi.getAll(),
          programsApi.getAll().catch(() => []),
        ]);
        if (!active) return;
        if (Array.isArray(dtos) && (dtos.length > 0 || process.env.NODE_ENV !== "development")) {
          setScripts(dtos.map(scriptFromDto));
        }
        // Key by the form's program bucket, derived from the program's NAME. The org's
        // programs were hand-created, so their slugs ("manteca-pt") never matched the
        // form's fixed slugs ("manteca") and every link silently dropped on save.
        setProgIdBySlug(
          Object.fromEntries((programs ?? []).map((p) => [progFromName(p.name), p.id]))
        );
      } catch {
        // Development keeps its demo rows; production keeps whatever it already shows.
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () =>
      scripts.filter((s) => {
        if (statusFilter !== "all" && s.status !== statusFilter) return false;
        if (progFilter !== "all" && !s.programs.includes(progFilter)) return false;
        if (query && !s.title.toLowerCase().includes(query.toLowerCase().trim())) return false;
        return true;
      }),
    [scripts, query, statusFilter, progFilter]
  );

  /** Swaps in the server's copy of a script wherever it is shown (grid and open panel). */
  const replaceScript = useCallback((updated: Script) => {
    setScripts((prev) => prev.map((s) => (s.id && s.id === updated.id ? updated : s)));
    setSelectedScript((prev) => (prev?.id && prev.id === updated.id ? updated : prev));
  }, []);

  // ── PDF actions ─────────────────────────────────────────────────────────────
  // Unlike the metadata edits below, these are NOT optimistic: the server is the only party
  // that knows whether the bytes landed, so the UI changes when it answers.

  async function uploadPdf(id: string, title: string, file: File) {
    const problem = pdfProblem(file);
    if (problem) {
      setPdfNotice({ scriptId: id, title, message: problem });
      return;
    }
    setPdfNotice(null);
    setPdfBusyId(id);
    try {
      const dto = await scriptsApi.uploadPdf(id, file);
      replaceScript(scriptFromDto(dto));
    } catch (err) {
      setPdfNotice({ scriptId: id, title, message: describeError(err) });
    } finally {
      setPdfBusyId(null);
    }
  }

  async function removePdf(script: Script) {
    if (!script.id || !script.pdf) return;
    if (!window.confirm(`Remove "${script.pdf.fileName}" from ${script.title}?`)) return;
    setPdfNotice(null);
    setPdfBusyId(script.id);
    try {
      const dto = await scriptsApi.deletePdf(script.id);
      replaceScript(scriptFromDto(dto));
    } catch (err) {
      setPdfNotice({ scriptId: script.id, title: script.title, message: describeError(err) });
    } finally {
      setPdfBusyId(null);
    }
  }

  async function downloadPdf(script: Script) {
    if (!script.id || !script.pdf) return;
    setPdfNotice(null);
    setPdfBusyId(script.id);
    try {
      const { blob, fileName } = await scriptsApi.downloadPdf(script.id);
      saveBlob(blob, fileName ?? script.pdf.fileName);
    } catch (err) {
      setPdfNotice({ scriptId: script.id, title: script.title, message: describeError(err) });
    } finally {
      setPdfBusyId(null);
    }
  }

  // ── Add / edit ──────────────────────────────────────────────────────────────

  function openModal() {
    setEditingScript(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(script: Script) {
    setEditingScript(script);
    setForm(formFromScript(script));
    setSelectedScript(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingScript(null);
  }

  function handleSubmit() {
    const min = form.castMin ? parseInt(form.castMin, 10) : undefined;
    const max = form.castMax ? parseInt(form.castMax, 10) : undefined;
    const year = new Date().getFullYear();
    const programIds = form.programs
      .map((p) => progIdBySlug[p])
      .filter((id): id is string => Boolean(id));
    const pdfFile = form.pdfFile;

    const editing = editingScript;
    const nextScript: Script = {
      id: editing?.id,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      type: form.type,
      original: form.source === "original",
      adapted: form.source === "adapted",
      programs: form.programs,
      castMin: min,
      castMax: max,
      duration: form.duration.trim() || "TBD",
      lastUsed: editing?.lastUsed ?? (form.status === "draft" ? `Planned: ${year}` : "—"),
      status: form.status,
      // The attachment is not part of the form save; keep what the row already has until
      // the upload (if any) answers with the new one.
      pdf: editing?.pdf,
    };

    const payload = {
      title: nextScript.title,
      subtitle: nextScript.subtitle,
      type: LOCAL_TYPE_TO_API[form.type],
      status: LOCAL_STATUS_TO_API[form.status],
      isOriginal: nextScript.original,
      isAdapted: nextScript.adapted,
      castMin: min,
      castMax: max,
      duration: form.duration.trim() || undefined,
      programIds,
    };

    setStatusFilter(form.status);
    closeModal();

    if (editing) {
      // Optimistically replace the edited row in place (match by identity or id).
      setScripts((prev) =>
        prev.map((s) => (s === editing || (editing.id && s.id === editing.id) ? nextScript : s))
      );
      if (editing.id) {
        const id = editing.id;
        scriptsApi
          .update(id, payload)
          .then(() => {
            if (pdfFile) void uploadPdf(id, nextScript.title, pdfFile);
          })
          .catch((err) => console.error("Failed to update script in the library:", err));
        return;
      }
      // No backend id (a demo row, or a create whose POST failed): saving it silently
      // changing nothing on the server is a trap, so adopt it — create the record now.
      scriptsApi
        .create(payload)
        .then((created) => {
          if (created?.id) {
            setScripts((prev) => prev.map((s) => (s === nextScript ? { ...s, id: created.id } : s)));
            if (pdfFile) void uploadPdf(created.id, nextScript.title, pdfFile);
          }
        })
        .catch((err) => console.error("Failed to save script to the library:", err));
      return;
    }

    // Create: optimistically show it immediately so the UI stays snappy.
    setScripts((prev) => [nextScript, ...prev]);

    // Persist to the library (#18), best-effort — a backend error must not lose the UI entry.
    scriptsApi
      .create(payload)
      .then((created) => {
        // Backfill the real id so the new card can be edited without a page refresh.
        if (created?.id) {
          setScripts((prev) => prev.map((s) => (s === nextScript ? { ...s, id: created.id } : s)));
          // The PDF could not go up with the form — the script had no id yet. Now it does.
          if (pdfFile) void uploadPdf(created.id, nextScript.title, pdfFile);
        }
      })
      .catch((err) => console.error("Failed to save script to the library:", err));
  }

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Script Library</h1>
          <span className="date">
            {visible.length} script{visible.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="right">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "0.5px solid var(--border-hover)",
              borderRadius: 8,
              padding: "5px 10px",
              background: "var(--surface)",
            }}
          >
            <Search style={{ width: 14, height: 14, color: "var(--fg-tertiary)" }} />
            <input
              type="text"
              placeholder="Search scripts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: 13,
                background: "transparent",
                width: 160,
              }}
            />
          </div>
          <button className="ss-btn ss-btn-primary" type="button" onClick={openModal}>
            <Plus className="ss-btn-icon" />
            Add script
          </button>
        </div>
      </div>

      <div className="adm-content">
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            marginBottom: "var(--space-5)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 5 }}>
            {STATUS_FILTERS.map((f) => (
              <span
                key={f}
                className={`ss-chip${statusFilter === f ? " is-active" : ""}`}
                style={{ cursor: "pointer", textTransform: "capitalize" }}
                onClick={() => setStatusFilter(f)}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </span>
            ))}
          </div>
          <div
            style={{ width: "0.5px", height: 16, background: "var(--border-strong)", flexShrink: 0 }}
          />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {PROG_FILTERS.map((p) => (
              <span
                key={p}
                className={`ss-chip${progFilter === p ? ` is-active${p !== "all" ? ` ${p}` : ""}` : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => setProgFilter(p)}
              >
                {p === "all" ? (
                  "All programs"
                ) : (
                  <>
                    <span className={`ss-dot ${p}`} />
                    {PROG_LABEL[p]}
                  </>
                )}
              </span>
            ))}
          </div>
        </div>

        {pdfNotice && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              marginBottom: "var(--space-4)",
              borderRadius: "var(--r-md)",
              background: "var(--danger-fill)",
              border: "0.5px solid var(--danger-border)",
              color: "var(--danger-text)",
              fontSize: 13,
            }}
          >
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <strong>{pdfNotice.title}:</strong> {pdfNotice.message}
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setPdfNotice(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 2, display: "flex" }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}

        {visible.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            {visible.map((script) => (
              <ScriptCard
                key={script.id ?? script.title}
                script={script}
                onViewDetails={() => setSelectedScript(script)}
                onDownloadPdf={script.id ? () => downloadPdf(script) : undefined}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-3)",
              padding: "var(--space-8) var(--space-5)",
              textAlign: "center",
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--r-md)",
                background: "var(--bg-secondary)",
                color: "var(--fg-secondary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BookOpen style={{ width: 22, height: 22 }} />
            </span>
            <h3 style={{ fontSize: 15, fontWeight: 500, color: "var(--fg)" }}>
              {loaded ? "No scripts found" : "Loading scripts…"}
            </h3>
            <p className="ss-meta" style={{ maxWidth: 320 }}>
              {loaded
                ? scripts.length === 0
                  ? "The library is empty. Add the first script to get started."
                  : "Try adjusting your filters or search query."
                : ""}
            </p>
          </div>
        )}
      </div>

      {modalOpen && (
        <AddScriptModal
          form={form}
          setForm={setForm}
          onClose={closeModal}
          onSubmit={handleSubmit}
          mode={editingScript ? "edit" : "add"}
          existingPdf={editingScript?.pdf}
        />
      )}

      {selectedScript && (
        <ScriptDetailPanel
          script={selectedScript}
          onClose={() => setSelectedScript(null)}
          onEdit={() => openEdit(selectedScript)}
          onDownloadPdf={selectedScript.id ? () => downloadPdf(selectedScript) : undefined}
          onUploadPdf={
            selectedScript.id
              ? (file) => uploadPdf(selectedScript.id!, selectedScript.title, file)
              : undefined
          }
          onRemovePdf={selectedScript.id ? () => removePdf(selectedScript) : undefined}
          pdfBusy={pdfBusyId !== null && pdfBusyId === selectedScript.id}
          pdfError={pdfNotice && pdfNotice.scriptId === selectedScript.id ? pdfNotice.message : null}
        />
      )}
    </div>
  );
}
