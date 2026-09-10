"use client";

import { useRef, useState } from "react";
import {
  FileText,
  Plus,
  Upload,
  Download,
  Trash2,
  Check,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Paperclip,
} from "lucide-react";
import { participantsApi } from "@/lib/api/participants";
import { ApiError } from "@/lib/api/client";
import { parseLocalDate } from "@/lib/format";
import { DOCUMENT_ACCEPT, documentProblem, formatBytes, saveBlob } from "@/lib/files";
import type { DocumentRecordDto } from "@/lib/types/api";

// The kinds of paperwork the intake process actually produces. Free text is allowed too —
// the list is a shortcut, not a rule.
const DOCUMENT_TYPES = [
  "Intake packet",
  "POS authorization",
  "IPP",
  "Photo / media release",
  "Emergency contact form",
  "Medical / allergy information",
  "Other",
];

function fmtDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.detail ? err.detail : fallback;
}

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-hover)",
  borderRadius: "var(--r-md)",
  padding: "6px 10px",
  fontSize: 13,
  color: "var(--fg)",
  background: "var(--surface)",
  outline: "none",
};

/**
 * A star's paperwork. Each row is a document record — type, expiry, complete — that may or
 * may not have its scan attached yet, so the intake checklist can be tracked before the
 * scanner is. Files are PDF/PNG/JPG up to 25 MB and stream through the API (private storage).
 */
export default function DocumentsWidget({
  participantId,
  initial,
}: {
  participantId: string;
  initial: DocumentRecordDto[];
}) {
  const [docs, setDocs] = useState<DocumentRecordDto[]>(initial);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState(DOCUMENT_TYPES[0]);
  const [newCustom, setNewCustom] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingUploadId = useRef<string | null>(null);

  function replace(updated: DocumentRecordDto) {
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  async function run(id: string | null, action: () => Promise<void>, fallback: string) {
    setError(null);
    setBusyId(id ?? "new");
    try {
      await action();
    } catch (err) {
      setError(describeError(err, fallback));
    } finally {
      setBusyId(null);
    }
  }

  async function addRecord() {
    const type = (newType === "Other" ? newCustom : newType).trim();
    if (!type) return;
    await run(null, async () => {
      const created = await participantsApi.createDocument(participantId, {
        documentType: type,
        expiryDate: newExpiry || undefined,
      });
      setDocs((prev) => [...prev, created]);
      setAdding(false);
      setNewType(DOCUMENT_TYPES[0]);
      setNewCustom("");
      setNewExpiry("");
    }, "Couldn't add the document — try again.");
  }

  function toggleComplete(d: DocumentRecordDto) {
    void run(d.id, async () => {
      replace(await participantsApi.updateDocument(participantId, d.id, { isComplete: !d.isComplete }));
    }, "Couldn't update the document — try again.");
  }

  function setExpiry(d: DocumentRecordDto, iso: string) {
    void run(d.id, async () => {
      replace(await participantsApi.updateDocument(participantId, d.id, iso ? { expiryDate: iso } : { clearExpiry: true }));
    }, "Couldn't update the expiry date — try again.");
  }

  function pickFile(d: DocumentRecordDto) {
    pendingUploadId.current = d.id;
    fileInput.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    const id = pendingUploadId.current;
    pendingUploadId.current = null;
    if (!file || !id) return;
    const why = documentProblem(file);
    if (why) { setError(why); return; }
    void run(id, async () => {
      replace(await participantsApi.uploadDocumentFile(participantId, id, file));
    }, "Couldn't upload the file — try again.");
  }

  function download(d: DocumentRecordDto) {
    void run(d.id, async () => {
      const file = await participantsApi.downloadDocumentFile(participantId, d.id);
      saveBlob(file.blob, file.fileName ?? d.fileName ?? "document");
    }, "Couldn't download the file — try again.");
  }

  function removeFile(d: DocumentRecordDto) {
    if (!window.confirm(`Remove "${d.fileName}" from ${d.documentType}? The record stays.`)) return;
    void run(d.id, async () => {
      replace(await participantsApi.deleteDocumentFile(participantId, d.id));
    }, "Couldn't remove the file — try again.");
  }

  function removeRecord(d: DocumentRecordDto) {
    const what = d.hasFile ? `${d.documentType} and its file` : d.documentType;
    if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
    void run(d.id, async () => {
      await participantsApi.deleteDocument(participantId, d.id);
      setDocs((prev) => prev.filter((x) => x.id !== d.id));
    }, "Couldn't delete the document — try again.");
  }

  const canAdd = (newType === "Other" ? newCustom.trim().length > 0 : true) && busyId !== "new";

  return (
    <div className="widget">
      <input
        ref={fileInput}
        type="file"
        accept={DOCUMENT_ACCEPT}
        onChange={onFileChosen}
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="widget-head" style={{ display: "flex", alignItems: "center" }}>
        <FileText className="ico" style={{ color: "var(--primary)" }} />
        <h3>Documents</h3>
        {!adding && (
          <button type="button" className="ss-btn" style={{ marginLeft: "auto" }} onClick={() => { setAdding(true); setError(null); }}>
            <Plus className="ss-btn-icon" />Add
          </button>
        )}
      </div>
      <div className="widget-body">
        {error && (
          <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: "var(--r-md)", background: "var(--danger-bg, #fdecec)", color: "var(--danger)", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />{error}
          </div>
        )}

        {adding && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "8px 0 12px", borderBottom: "0.5px solid var(--border)", marginBottom: 8 }}>
            <select value={newType} onChange={(e) => setNewType(e.target.value)} style={inputStyle}>
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {newType === "Other" && (
              <input
                placeholder="Document name"
                value={newCustom}
                onChange={(e) => setNewCustom(e.target.value)}
                maxLength={100}
                style={{ ...inputStyle, minWidth: 160 }}
                autoFocus
              />
            )}
            <input type="date" title="Expires (optional)" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} style={inputStyle} />
            <button type="button" className="ss-btn ss-btn-primary" onClick={addRecord} disabled={!canAdd}>
              {busyId === "new" ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Check className="ss-btn-icon" />}
              Add
            </button>
            <button type="button" className="ss-btn" onClick={() => setAdding(false)} disabled={busyId === "new"}>
              <X className="ss-btn-icon" />Cancel
            </button>
          </div>
        )}

        {docs.length === 0 && !adding ? (
          <div style={{ padding: "16px 0", textAlign: "center", fontSize: 13, color: "var(--fg-tertiary)" }}>
            No documents on file yet. Add one to track the intake paperwork and attach the scan.
          </div>
        ) : (
          docs.map((d) => {
            const busy = busyId === d.id;
            const expired = d.expiryDate ? parseLocalDate(d.expiryDate) < new Date() : false;
            return (
              <div className="list-row" key={d.id} style={{ alignItems: "flex-start", gap: 10, opacity: busy ? 0.6 : 1 }}>
                <button
                  type="button"
                  className={`ss-checkbox${d.isComplete ? " is-checked" : ""}`}
                  style={{ padding: 0, marginTop: 2, flexShrink: 0 }}
                  aria-pressed={d.isComplete}
                  aria-label={`${d.isComplete ? "Mark incomplete" : "Mark complete"}: ${d.documentType}`}
                  disabled={busy}
                  onClick={() => toggleComplete(d)}
                >
                  {d.isComplete && <Check />}
                </button>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="nm">{d.documentType}</div>
                  <div className="sub" style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "center" }}>
                    {d.hasFile ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }} title={d.fileName ?? undefined}>
                        <Paperclip style={{ width: 12, height: 12, flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{d.fileName}</span>
                        {d.sizeBytes != null && <span style={{ color: "var(--fg-tertiary)" }}>{formatBytes(d.sizeBytes)}</span>}
                      </span>
                    ) : (
                      <span style={{ color: "var(--fg-tertiary)" }}>No file attached</span>
                    )}
                    <span className={expired ? "ss-date-expired" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {d.expiryDate ? <>{expired ? "Expired" : "Expires"} {fmtDate(d.expiryDate)}</> : null}
                      <input
                        type="date"
                        title="Expiry date"
                        value={d.expiryDate ?? ""}
                        disabled={busy}
                        onChange={(e) => setExpiry(d, e.target.value)}
                        style={{ fontSize: 11, padding: "1px 4px", border: "0.5px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface)", color: "var(--fg-tertiary)", width: 118 }}
                      />
                    </span>
                  </div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <span className={`ss-badge ${d.isComplete ? "is-active" : "is-attention"}`} style={{ marginRight: 4 }}>
                    {d.isComplete ? <><CheckCircle2 />Complete</> : <><AlertCircle />Incomplete</>}
                  </span>
                  <button type="button" className="ss-btn" title={d.hasFile ? "Replace file" : "Attach file"} disabled={busy} onClick={() => pickFile(d)}>
                    <Upload className="ss-btn-icon" />{d.hasFile ? "Replace" : "Attach"}
                  </button>
                  {d.hasFile && (
                    <>
                      <button type="button" className="ss-btn" title="Download" disabled={busy} onClick={() => download(d)} aria-label={`Download ${d.fileName}`}>
                        <Download className="ss-btn-icon" />
                      </button>
                      <button type="button" className="ss-btn" title="Remove file" disabled={busy} onClick={() => removeFile(d)} aria-label={`Remove file from ${d.documentType}`}>
                        <X className="ss-btn-icon" />
                      </button>
                    </>
                  )}
                  <button type="button" className="ss-btn" title="Delete document" disabled={busy} onClick={() => removeRecord(d)} style={{ color: "var(--danger)" }} aria-label={`Delete ${d.documentType}`}>
                    <Trash2 className="ss-btn-icon" />
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
