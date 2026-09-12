"use client";

import { useRef, useState } from "react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import {
  Download,
  ChevronRight,
  Users,
  Clock,
  Music2,
  FileText,
  X,
  Check,
  Calendar,
  Tag,
  Pencil,
  Upload,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";

import { useDialogFocus } from "@/lib/useDialogFocus";
import { timestampLabel } from "@/lib/format";
import {
  type Script,
  type ScriptPdf,
  type ScriptType,
  type ScriptStatus,
  type Prog,
  type FormState,
  PROG_LABEL,
  TYPE_LABEL,
  STATUS_STYLE,
  formatBytes,
  pdfProblem,
} from "./_model";

const PDF_ACCEPT = "application/pdf,.pdf";

// ── PDF picker (inside the add/edit form) ─────────────────────────────────────
// Chooses a file now; the page uploads it once the script row exists, because the upload
// endpoint is a sub-resource of a saved script.

function PdfPicker({
  file,
  existing,
  onPick,
}: {
  file: File | null;
  /** The PDF already attached, in edit mode. */
  existing?: ScriptPdf;
  onPick: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    // Reset so choosing the same file again (after clearing) still fires onChange.
    e.target.value = "";
    if (!picked) return;
    const why = pdfProblem(picked);
    setProblem(why);
    onPick(why ? null : picked);
  }

  const helper = problem
    ?? (file
      ? "Uploads when you save."
      : existing
        ? `Current file: ${existing.fileName} (${formatBytes(existing.sizeBytes)}). Choosing a file replaces it when you save.`
        : "PDF only, up to 25 MB.");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        ref={inputRef}
        type="file"
        accept={PDF_ACCEPT}
        onChange={choose}
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="ss-btn" onClick={() => inputRef.current?.click()}>
          <Upload className="ss-btn-icon" />
          {file ? "Choose a different PDF" : existing ? "Replace PDF" : "Choose PDF"}
        </button>
        {file && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              maxWidth: "100%",
              fontSize: 12,
              padding: "3px 8px",
              borderRadius: "var(--r-sm)",
              background: "var(--bg-secondary)",
              border: "0.5px solid var(--border)",
              color: "var(--fg)",
            }}
          >
            <FileText style={{ width: 12, height: 12, flexShrink: 0, color: "var(--fg-tertiary)" }} />
            <span
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}
              title={file.name}
            >
              {file.name}
            </span>
            <span style={{ color: "var(--fg-tertiary)", flexShrink: 0 }}>{formatBytes(file.size)}</span>
            <button
              type="button"
              aria-label="Remove chosen file"
              onClick={() => {
                onPick(null);
                setProblem(null);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--fg-tertiary)",
                padding: 0,
                display: "flex",
              }}
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: problem ? "var(--danger)" : "var(--fg-tertiary)" }}>{helper}</div>
    </div>
  );
}

// ── Add Script Modal ──────────────────────────────────────────────────────────

export function AddScriptModal({
  form,
  setForm,
  onClose,
  onSubmit,
  mode = "add",
  existingPdf,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onClose: () => void;
  onSubmit: () => void;
  mode?: "add" | "edit";
  /** In edit mode, the PDF the script already has (so the picker can say "replace"). */
  existingPdf?: ScriptPdf;
}) {
  const isEdit = mode === "edit";
  const canSubmit = form.title.trim().length > 0 && form.programs.length > 0;
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "0.5px solid var(--border-hover)",
    borderRadius: "var(--r-md)",
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--fg)",
    background: "var(--surface)",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,42,38,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "var(--space-4)",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit script" : "Add script"}
        style={{
          background: "var(--surface)",
          borderRadius: "var(--r-lg)",
          width: "min(520px, 100%)",
          display: "flex",
          flexDirection: "column",
          border: "0.5px solid var(--border-hover)",
          maxHeight: "90vh",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "var(--space-4)",
            borderBottom: "0.5px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>
              {isEdit ? "Edit script" : "Add script"}
            </h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
              {isEdit ? "Changes will be saved to the library" : "Script will be saved to the library"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--fg-tertiary)",
              padding: 4,
              borderRadius: "var(--r-sm)",
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* scrollable body */}
        <div
          style={{
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
            overflowY: "auto",
          }}
        >
          {/* Title */}
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>
              Title{" "}
              <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span>
            </div>
            <input
              type="text"
              placeholder="e.g. The Magic Garden"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Subtitle */}
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>
              Subtitle{" "}
              <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>
                Optional
              </span>
            </div>
            <input
              type="text"
              placeholder="e.g. An original musical in two acts"
              value={form.subtitle}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Type */}
          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Type</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(["musical", "play", "scene", "skit"] as ScriptType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`ss-chip${form.type === t ? " is-active" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Programs */}
          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>
              Programs{" "}
              <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span>
              {form.programs.length === 0 && (
                <span style={{ marginLeft: 8, color: "var(--danger)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  Choose at least one to enable Save
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["mjc", "pathways", "manteca", "productions"] as Prog[]).map((p) => {
                const checked = form.programs.includes(p);
                return (
                  <label
                    key={p}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 11px",
                      borderRadius: "var(--r-pill)",
                      border: `0.5px solid ${checked ? `var(--${p}-border)` : "var(--border)"}`,
                      background: checked ? `var(--${p}-fill)` : "var(--surface)",
                      color: checked ? `var(--${p}-text)` : "var(--fg-secondary)",
                      cursor: "pointer",
                      fontSize: 13,
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{ display: "none" }}
                      checked={checked}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          programs: e.target.checked
                            ? [...f.programs, p]
                            : f.programs.filter((x) => x !== p),
                        }))
                      }
                    />
                    <span className={`ss-dot ${p}`} />
                    {PROG_LABEL[p]}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Script origin */}
          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Script origin</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["original", "adapted"] as const).map((s) => (
                <label
                  key={s}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 11px",
                    borderRadius: "var(--r-pill)",
                    border: `0.5px solid ${form.source === s ? "var(--border-hover)" : "var(--border)"}`,
                    background: form.source === s ? "var(--bg-secondary)" : "var(--surface)",
                    color: form.source === s ? "var(--fg)" : "var(--fg-secondary)",
                    cursor: "pointer",
                    fontSize: 13,
                    userSelect: "none",
                  }}
                >
                  <input
                    type="radio"
                    name="source"
                    value={s}
                    checked={form.source === s}
                    onChange={() => setForm((f) => ({ ...f, source: s }))}
                    style={{ display: "none" }}
                  />
                  {s === "original" ? "Original work" : "Adapted from another work"}
                </label>
              ))}
            </div>
          </div>

          {/* Cast size */}
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>
              Cast size{" "}
              <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>
                Optional
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                min={1}
                placeholder="Min"
                value={form.castMin}
                onChange={(e) => setForm((f) => ({ ...f, castMin: e.target.value }))}
                style={{ ...inputStyle, width: "auto", flex: 1 }}
              />
              <span style={{ fontSize: 13, color: "var(--fg-tertiary)", flexShrink: 0 }}>to</span>
              <input
                type="number"
                min={1}
                placeholder="Max"
                value={form.castMax}
                onChange={(e) => setForm((f) => ({ ...f, castMax: e.target.value }))}
                style={{ ...inputStyle, width: "auto", flex: 1 }}
              />
              <span style={{ fontSize: 12, color: "var(--fg-tertiary)", flexShrink: 0 }}>
                participants
              </span>
            </div>
          </div>

          {/* Duration */}
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>
              Duration{" "}
              <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>
                Optional
              </span>
            </div>
            <input
              type="text"
              placeholder="e.g. 45 min"
              value={form.duration}
              onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
              style={{ ...inputStyle, width: "50%" }}
            />
          </div>

          {/* Script PDF */}
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>
              Script PDF{" "}
              <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>
                Optional
              </span>
            </div>
            <PdfPicker
              file={form.pdfFile}
              existing={isEdit ? existingPdf : undefined}
              onPick={(file) => setForm((f) => ({ ...f, pdfFile: file }))}
            />
          </div>

          {/* Status */}
          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Status</div>
            <div style={{ display: "flex", gap: 5 }}>
              {(["draft", "active", "archived"] as ScriptStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`ss-chip${form.status === s ? " is-active" : ""}`}
                  style={{ cursor: "pointer", textTransform: "capitalize" }}
                  onClick={() => setForm((f) => ({ ...f, status: s }))}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            borderTop: "0.5px solid var(--border)",
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          <button className="ss-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="ss-btn ss-btn-primary"
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            title={canSubmit ? undefined : "Add a title and choose at least one program"}
            style={canSubmit ? undefined : { opacity: 0.45, cursor: "not-allowed" }}
          >
            <Check className="ss-btn-icon" />
            {isEdit ? "Save changes" : "Add script"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Script Detail Panel ───────────────────────────────────────────────────────

export function ScriptDetailPanel({
  script,
  onClose,
  onEdit,
  onDownloadPdf,
  onUploadPdf,
  onRemovePdf,
  pdfBusy = false,
  pdfError,
}: {
  script: Script;
  onClose: () => void;
  onEdit?: () => void;
  onDownloadPdf?: () => void;
  onUploadPdf?: (file: File) => void;
  onRemovePdf?: () => void;
  /** An upload, download or removal is in flight for this script. */
  pdfBusy?: boolean;
  /** Why the last PDF action failed, if it did. */
  pdfError?: string | null;
}) {
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const TypeIcon = script.type === "musical" ? Music2 : FileText;
  const { bg, color } = STATUS_STYLE[script.status];
  const leadProg = script.programs[0];

  // Demo rows (no id) exist only when the API is empty or unreachable; nothing to attach to.
  const canManagePdf = Boolean(script.id && onUploadPdf);
  const canDownload = Boolean(script.pdf && onDownloadPdf);

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "var(--space-3) 0",
    borderBottom: "0.5px solid var(--border)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--fg-tertiary)",
    width: 96,
    flexShrink: 0,
    paddingTop: 1,
  };
  const valueStyle: React.CSSProperties = {
    fontSize: 13,
    color: "var(--fg)",
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
    alignItems: "center",
  };
  const smallBtnStyle: React.CSSProperties = { padding: "4px 9px", fontSize: 12 };

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(43,42,38,.35)",
          zIndex: 200,
        }}
      />
      {/* panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={script.title}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(440px, 100vw)",
          background: "var(--surface)",
          borderLeft: "0.5px solid var(--border-hover)",
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          animation: "slideInRight 180ms ease-out",
        }}
      >
        {/* colored header */}
        <div
          style={{
            background: `var(--${leadProg}-fill)`,
            padding: "var(--space-4)",
            borderBottom: "0.5px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
              marginBottom: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "2px 7px",
                  borderRadius: "var(--r-sm)",
                  background: "var(--surface)",
                  color: "var(--fg-secondary)",
                  border: "0.5px solid var(--border)",
                }}
              >
                <TypeIcon style={{ width: 11, height: 11 }} />
                {TYPE_LABEL[script.type]}
              </span>
              {script.adapted && (
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 7px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--info-fill)",
                    color: "var(--info-text)",
                    border: "0.5px solid var(--info-border)",
                  }}
                >
                  Adapted
                </span>
              )}
              {script.original && (
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 7px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--success-fill)",
                    color: "var(--success-text)",
                    border: "0.5px solid var(--success-border)",
                  }}
                >
                  Original
                </span>
              )}
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 7px",
                  borderRadius: "var(--r-sm)",
                  background: bg,
                  color,
                  textTransform: "capitalize",
                }}
              >
                {script.status}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--r-sm)",
                cursor: "pointer",
                color: "var(--fg-tertiary)",
                padding: 5,
                display: "flex",
                flexShrink: 0,
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 3px", color: "var(--fg)" }}>
            {script.title}
          </h2>
          {script.subtitle && (
            <div style={{ fontSize: 13, color: "var(--fg-secondary)" }}>{script.subtitle}</div>
          )}
        </div>

        {/* detail rows */}
        <div
          style={{
            padding: "0 var(--space-4)",
            flex: 1,
            overflowY: "auto",
          }}
        >
          {/* Programs */}
          <div style={rowStyle}>
            <div style={labelStyle}>Programs</div>
            <div style={valueStyle}>
              {script.programs.map((p) => (
                <span key={p} className={`ss-program ${p}`}>
                  {PROG_LABEL[p]}
                </span>
              ))}
            </div>
          </div>

          {/* Cast size */}
          {script.castMin !== undefined && script.castMax !== undefined && (
            <div style={rowStyle}>
              <div style={labelStyle}>Cast size</div>
              <div style={{ ...valueStyle, gap: 4 }}>
                <Users style={{ width: 13, height: 13, color: "var(--fg-tertiary)" }} />
                {script.castMin}–{script.castMax} participants
              </div>
            </div>
          )}

          {/* Duration */}
          <div style={rowStyle}>
            <div style={labelStyle}>Duration</div>
            <div style={{ ...valueStyle, gap: 4 }}>
              <Clock style={{ width: 13, height: 13, color: "var(--fg-tertiary)" }} />
              {script.duration}
            </div>
          </div>

          {/* Last performed */}
          <div style={rowStyle}>
            <div style={labelStyle}>{script.status === "draft" ? "Timeline" : "Last performed"}</div>
            <div style={{ ...valueStyle, gap: 4 }}>
              <Calendar style={{ width: 13, height: 13, color: "var(--fg-tertiary)" }} />
              {script.lastUsed}
            </div>
          </div>

          {/* Type detail */}
          <div style={rowStyle}>
            <div style={labelStyle}>Script type</div>
            <div style={{ ...valueStyle, gap: 4 }}>
              <Tag style={{ width: 13, height: 13, color: "var(--fg-tertiary)" }} />
              {TYPE_LABEL[script.type]}
              {script.original ? " · Original work" : script.adapted ? " · Adapted" : ""}
            </div>
          </div>

          {/* Script PDF */}
          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <div style={labelStyle}>Script PDF</div>
            <div
              style={{
                ...valueStyle,
                flexDirection: "column",
                alignItems: "stretch",
                gap: 8,
                flex: 1,
                minWidth: 0,
              }}
            >
              {script.pdf ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                  <FileText
                    style={{ width: 14, height: 14, color: "var(--fg-tertiary)", flexShrink: 0, marginTop: 2 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={script.pdf.fileName}
                    >
                      {script.pdf.fileName}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
                      {formatBytes(script.pdf.sizeBytes)}
                      {script.pdf.uploadedAt ? ` · Uploaded ${timestampLabel(script.pdf.uploadedAt)}` : ""}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>
                  {canManagePdf
                    ? "No PDF attached yet."
                    : "No PDF attached. Save this script to the library to attach one."}
                </div>
              )}

              {canManagePdf && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={PDF_ACCEPT}
                    style={{ display: "none" }}
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) onUploadPdf?.(file);
                    }}
                  />
                  {canDownload && (
                    <button
                      type="button"
                      className="ss-btn"
                      style={smallBtnStyle}
                      onClick={onDownloadPdf}
                      disabled={pdfBusy}
                    >
                      <Download className="ss-btn-icon" />
                      Download
                    </button>
                  )}
                  <button
                    type="button"
                    className="ss-btn"
                    style={smallBtnStyle}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pdfBusy}
                  >
                    {pdfBusy ? (
                      <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <Upload className="ss-btn-icon" />
                    )}
                    {pdfBusy ? "Working…" : script.pdf ? "Replace" : "Upload PDF"}
                  </button>
                  {script.pdf && onRemovePdf && (
                    <button
                      type="button"
                      className="ss-btn"
                      style={{ ...smallBtnStyle, color: "var(--danger)" }}
                      onClick={onRemovePdf}
                      disabled={pdfBusy}
                    >
                      <Trash2 className="ss-btn-icon" />
                      Remove
                    </button>
                  )}
                </div>
              )}

              {pdfError && (
                <div
                  role="alert"
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "flex-start",
                    fontSize: 12,
                    color: "var(--danger)",
                  }}
                >
                  <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
                  <span>{pdfError}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* footer actions */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            borderTop: "0.5px solid var(--border)",
            display: "flex",
            gap: 8,
            flexShrink: 0,
            background: "var(--bg)",
          }}
        >
          {onEdit && (
            <button
              type="button"
              className="ss-btn ss-btn-primary"
              onClick={onEdit}
              style={{ flex: 1, justifyContent: "center" }}
            >
              <Pencil className="ss-btn-icon" />
              Edit script
            </button>
          )}
          <button
            type="button"
            className="ss-btn"
            onClick={onDownloadPdf}
            disabled={!canDownload || pdfBusy}
            title={canDownload ? undefined : "No PDF attached"}
            style={{ flex: onEdit ? undefined : 1, justifyContent: "center" }}
          >
            <Download className="ss-btn-icon" />
            {script.pdf ? "Download PDF" : "No PDF"}
          </button>
          <button
            type="button"
            className="ss-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

// ── Script Card ───────────────────────────────────────────────────────────────

export function ScriptCard({
  script,
  onViewDetails,
  onDownloadPdf,
}: {
  script: Script;
  onViewDetails: () => void;
  onDownloadPdf?: () => void;
}) {
  const TypeIcon = script.type === "musical" ? Music2 : FileText;
  const { bg, color } = STATUS_STYLE[script.status];
  const leadProg = script.programs[0];
  const canDownload = Boolean(script.pdf && onDownloadPdf);

  return (
    <div className="ss-card" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
      <div
        style={{
          background: `var(--${leadProg}-fill)`,
          padding: "var(--space-4)",
          borderBottom: "0.5px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: "var(--space-2)",
          }}
        >
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                padding: "2px 7px",
                borderRadius: "var(--r-sm)",
                background: "var(--surface)",
                color: "var(--fg-secondary)",
                border: "0.5px solid var(--border)",
              }}
            >
              <TypeIcon style={{ width: 11, height: 11 }} />
              {TYPE_LABEL[script.type]}
            </span>
            {script.adapted && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 7px",
                  borderRadius: "var(--r-sm)",
                  background: "var(--info-fill)",
                  color: "var(--info-text)",
                  border: "0.5px solid var(--info-border)",
                }}
              >
                Adapted
              </span>
            )}
            {script.original && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 7px",
                  borderRadius: "var(--r-sm)",
                  background: "var(--success-fill)",
                  color: "var(--success-text)",
                  border: "0.5px solid var(--success-border)",
                }}
              >
                Original
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: 11,
              padding: "2px 7px",
              borderRadius: "var(--r-sm)",
              background: bg,
              color,
              textTransform: "capitalize",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {script.status}
          </span>
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 3px", color: "var(--fg)" }}>
          {script.title}
        </h3>
        {script.subtitle && (
          <div style={{ fontSize: 12, color: "var(--fg-secondary)" }}>{script.subtitle}</div>
        )}
      </div>

      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          flex: 1,
        }}
      >
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {script.programs.map((p) => (
            <span key={p} className={`ss-program ${p}`}>
              {PROG_LABEL[p]}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {script.castMin !== undefined && script.castMax !== undefined && (
            <span
              style={{
                fontSize: 12,
                color: "var(--fg-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Users style={{ width: 12, height: 12 }} />
              {script.castMin}–{script.castMax} participants
            </span>
          )}
          <span
            style={{
              fontSize: 12,
              color: "var(--fg-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Clock style={{ width: 12, height: 12 }} />
            {script.duration}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
          {script.status === "draft" ? script.lastUsed : `Last performed: ${script.lastUsed}`}
        </div>
      </div>

      <div
        style={{
          padding: "var(--space-2) var(--space-4)",
          borderTop: "0.5px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--bg)",
        }}
      >
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={!canDownload}
          title={canDownload ? script.pdf?.fileName : "No PDF attached"}
          style={{
            background: "none",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "5px 10px",
            cursor: canDownload ? "pointer" : "default",
            color: canDownload ? "var(--fg-secondary)" : "var(--fg-tertiary)",
            opacity: canDownload ? 1 : 0.7,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
          }}
        >
          <Download style={{ width: 13, height: 13 }} />
          {script.pdf ? "Download PDF" : "No PDF"}
        </button>
        <button
          type="button"
          onClick={onViewDetails}
          style={{
            background: "none",
            border: "none",
            padding: "5px 4px",
            cursor: "pointer",
            color: "var(--primary)",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          View details
          <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}
