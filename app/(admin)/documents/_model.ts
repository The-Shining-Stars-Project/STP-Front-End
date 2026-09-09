// Script Library domain model: local UI types, the demo/seed data, and the
// API ↔ local mapping helpers (#18). Shared by the page and its components (#40).

import type {
  ScriptDto,
  ScriptType as ApiScriptType,
  ScriptStatus as ApiScriptStatus,
} from "@/lib/types/api";

export type ScriptType = "musical" | "play" | "scene" | "skit";
export type ScriptStatus = "active" | "archived" | "draft";
export type Prog = "mjc" | "pathways" | "manteca" | "productions";

export const PROG_LABEL: Record<Prog, string> = {
  mjc: "MJC",
  pathways: "Pathways",
  manteca: "Manteca PT",
  productions: "Productions",
};

export const TYPE_LABEL: Record<ScriptType, string> = {
  musical: "Musical",
  play: "Full Play",
  scene: "Scene Collection",
  skit: "Skit",
};

export const STATUS_STYLE: Record<ScriptStatus, { bg: string; color: string }> = {
  active: { bg: "var(--success-fill)", color: "var(--success-text)" },
  archived: { bg: "var(--neutral-fill)", color: "var(--neutral-text)" },
  draft: { bg: "var(--warning-fill)", color: "var(--warning-text)" },
};

/** The PDF attached to a script — described only; the bytes come from the download endpoint. */
export type ScriptPdf = {
  fileName: string;
  sizeBytes: number;
  /** API timestamp (UTC, no designator); read it with parseApiTimestamp. */
  uploadedAt: string | null;
};

export type Script = {
  /** Backend id. Absent only for the demo fallback rows (INITIAL_SCRIPTS). */
  id?: string;
  title: string;
  subtitle?: string;
  type: ScriptType;
  adapted: boolean;
  original: boolean;
  programs: Prog[];
  castMin?: number;
  castMax?: number;
  duration: string;
  lastUsed: string;
  status: ScriptStatus;
  /** Present when a PDF is attached. */
  pdf?: ScriptPdf;
};

export const INITIAL_SCRIPTS: Script[] = [
  {
    title: "The Magic Garden",
    subtitle: "An original musical in two acts",
    type: "musical",
    adapted: false,
    original: true,
    programs: ["productions", "pathways"],
    castMin: 12,
    castMax: 18,
    duration: "55 min",
    lastUsed: "Spring 2026",
    status: "active",
  },
  {
    title: "Cinderella",
    subtitle: "Adapted for performing arts",
    type: "play",
    adapted: true,
    original: false,
    programs: ["mjc"],
    castMin: 8,
    castMax: 12,
    duration: "40 min",
    lastUsed: "Fall 2025",
    status: "active",
  },
  {
    title: "Under the Sea",
    subtitle: "A musical celebration",
    type: "musical",
    adapted: false,
    original: true,
    programs: ["manteca"],
    castMin: 6,
    castMax: 10,
    duration: "35 min",
    lastUsed: "Spring 2025",
    status: "active",
  },
  {
    title: "The Brave Little Star",
    subtitle: "Scene collection — one act per program group",
    type: "scene",
    adapted: false,
    original: true,
    programs: ["mjc", "pathways", "manteca", "productions"],
    castMin: 4,
    castMax: 8,
    duration: "20 min / scene",
    lastUsed: "Ongoing",
    status: "active",
  },
  {
    title: "Stardust",
    subtitle: "New original musical — in development",
    type: "musical",
    adapted: false,
    original: true,
    programs: ["productions"],
    duration: "TBD",
    lastUsed: "Planned: Fall 2026",
    status: "draft",
  },
  {
    title: "A Midsummer Dream",
    subtitle: "Adapted from Shakespeare",
    type: "play",
    adapted: true,
    original: false,
    programs: ["productions"],
    castMin: 15,
    castMax: 20,
    duration: "60 min",
    lastUsed: "Spring 2025",
    status: "archived",
  },
  {
    title: "Rainbow Road",
    subtitle: "A musical journey",
    type: "musical",
    adapted: false,
    original: true,
    programs: ["mjc", "pathways"],
    castMin: 10,
    castMax: 14,
    duration: "45 min",
    lastUsed: "Spring 2024",
    status: "archived",
  },
  {
    title: "The Lighthouse Keeper",
    type: "play",
    adapted: false,
    original: true,
    programs: ["manteca"],
    castMin: 6,
    castMax: 8,
    duration: "30 min",
    lastUsed: "Fall 2024",
    status: "archived",
  },
];

// ── API ↔ local model mapping (#18) ─────────────────────────────────────────────
// This page keeps its own lowercase unions; the API uses PascalCase enums and program
// GUIDs. These helpers bridge the two so the page can show and persist real data while
// the existing demo (INITIAL_SCRIPTS) remains the fallback if the API is empty/unreachable.

export const API_TYPE_TO_LOCAL: Record<ApiScriptType, ScriptType> = {
  Musical: "musical",
  Play: "play",
  Scene: "scene",
  Skit: "skit",
};
export const LOCAL_TYPE_TO_API: Record<ScriptType, ApiScriptType> = {
  musical: "Musical",
  play: "Play",
  scene: "Scene",
  skit: "Skit",
};
export const API_STATUS_TO_LOCAL: Record<ApiScriptStatus, ScriptStatus> = {
  Active: "active",
  Draft: "draft",
  Archived: "archived",
};
export const LOCAL_STATUS_TO_API: Record<ScriptStatus, ApiScriptStatus> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

/** Maps a program's display name to the local Prog tag (best-effort; unknown → productions). */
export function progFromName(name: string): Prog {
  const n = name.toLowerCase();
  if (n.includes("mjc")) return "mjc";
  if (n.includes("pathways")) return "pathways";
  if (n.includes("manteca")) return "manteca";
  return "productions";
}

export function scriptFromDto(dto: ScriptDto): Script {
  return {
    id: dto.id,
    title: dto.title,
    subtitle: dto.subtitle ?? undefined,
    type: API_TYPE_TO_LOCAL[dto.type] ?? "play",
    adapted: dto.isAdapted,
    original: dto.isOriginal,
    programs: Array.from(new Set((dto.programNames ?? []).map(progFromName))),
    castMin: dto.castMin ?? undefined,
    castMax: dto.castMax ?? undefined,
    duration: dto.duration ?? "TBD",
    lastUsed: dto.lastUsed ?? "—",
    status: API_STATUS_TO_LOCAL[dto.status] ?? "draft",
    pdf: dto.hasPdf
      ? {
          fileName: dto.pdfFileName ?? "script.pdf",
          sizeBytes: dto.pdfSizeBytes ?? 0,
          uploadedAt: dto.pdfUploadedAt,
        }
      : undefined,
  };
}

export const STATUS_FILTERS = ["all", "active", "archived", "draft"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const PROG_FILTERS: ("all" | Prog)[] = ["all", "mjc", "pathways", "manteca", "productions"];

// ── PDF rules ─────────────────────────────────────────────────────────────────
// The backend is the authority (it checks the file header too); these mirror its cheap rules
// so the two common mistakes — wrong file, huge file — get an answer before any bytes move.

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** 1234567 → "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why a chosen file cannot be attached, or null when it can. */
export function pdfProblem(file: File): string | null {
  if (!/\.pdf$/i.test(file.name)) return "Only PDF files can be attached.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_PDF_BYTES) return `That PDF is ${formatBytes(file.size)}; the limit is 25 MB.`;
  return null;
}

// ── Form state ────────────────────────────────────────────────────────────────

export type FormState = {
  title: string;
  subtitle: string;
  type: ScriptType;
  source: "original" | "adapted";
  programs: Prog[];
  castMin: string;
  castMax: string;
  duration: string;
  status: ScriptStatus;
  /** A PDF chosen in the form, uploaded once the script itself has been saved. */
  pdfFile: File | null;
};

export const EMPTY_FORM: FormState = {
  title: "",
  subtitle: "",
  type: "musical",
  source: "original",
  programs: [],
  castMin: "",
  castMax: "",
  duration: "",
  status: "draft",
  pdfFile: null,
};

/** Pre-fills the modal form from an existing script (for editing). */
export function formFromScript(s: Script): FormState {
  return {
    title: s.title,
    subtitle: s.subtitle ?? "",
    type: s.type,
    source: s.adapted ? "adapted" : "original",
    programs: s.programs,
    castMin: s.castMin != null ? String(s.castMin) : "",
    castMax: s.castMax != null ? String(s.castMax) : "",
    duration: s.duration === "TBD" ? "" : s.duration,
    status: s.status,
    pdfFile: null,
  };
}
