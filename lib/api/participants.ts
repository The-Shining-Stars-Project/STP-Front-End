import { api } from "./client";
import type {
  ParticipantSummaryDto,
  ParticipantDetailDto,
  CreateParticipantDto,
  UpdateParticipantDto,
  UpdateIntakeNotesDto,
  ParticipantArtsProfileDto,
  UpsertArtsProfileDto,
  DocumentRecordDto,
  CreateDocumentRecordDto,
  UpdateDocumentRecordDto,
  ParticipantImportReportDto,
} from "../types/api";

export const participantsApi = {
  getAll:   ()                              => api.get<ParticipantSummaryDto[]>("/api/participants"),
  getById:  (id: string)                    => api.get<ParticipantDetailDto>(`/api/participants/${id}`),
  create:   (dto: CreateParticipantDto)     => api.post<ParticipantDetailDto>("/api/participants", dto),
  update:   (id: string, dto: UpdateParticipantDto) => api.put<ParticipantDetailDto>(`/api/participants/${id}`, dto),
  remove:   (id: string)                    => api.delete<void>(`/api/participants/${id}`),
  /** Notes only — the one edit a teacher may make on a star. */
  updateIntakeNotes: (id: string, dto: UpdateIntakeNotesDto) => api.put<ParticipantDetailDto>(`/api/participants/${id}/intake-notes`, dto),

  // ── Enrolment ───────────────────────────────────────────────────────────────
  // Two named wrappers over update, so a caller can't mix them up: "Enroll star" used to send
  // { programId } for a star who was already in another program, which MOVED them and silently
  // dropped e.g. Pathways (Oct 2026). Adding a second program leaves the main one alone.
  /** Dual enrolment: sets `programId` as the star's second program. Their main program is unchanged. */
  addSecondProgram: (id: string, programId: string) =>
    api.put<ParticipantDetailDto>(`/api/participants/${id}`, { secondaryProgramId: programId } satisfies UpdateParticipantDto),
  /** Changes the star's MAIN program — they leave the old one. A second program, if any, is unchanged. */
  moveMainProgram: (id: string, programId: string) =>
    api.put<ParticipantDetailDto>(`/api/participants/${id}`, { programId } satisfies UpdateParticipantDto),

  getArtsProfile:    (id: string)                       => api.get<ParticipantArtsProfileDto>(`/api/participants/${id}/arts-profile`),
  upsertArtsProfile: (id: string, dto: UpsertArtsProfileDto) => api.put<ParticipantArtsProfileDto>(`/api/participants/${id}/arts-profile`, dto),

  // ── Documents ───────────────────────────────────────────────────────────────
  // A star's paperwork. The record (type, expiry, complete) can exist before its scan;
  // the file endpoints attach, fetch and detach the scan. PDF, PNG or JPG, up to 25 MB.
  listDocuments:  (id: string)                                        => api.get<DocumentRecordDto[]>(`/api/participants/${id}/documents`),
  createDocument: (id: string, dto: CreateDocumentRecordDto)          => api.post<DocumentRecordDto>(`/api/participants/${id}/documents`, dto),
  updateDocument: (id: string, docId: string, dto: UpdateDocumentRecordDto) => api.put<DocumentRecordDto>(`/api/participants/${id}/documents/${docId}`, dto),
  deleteDocument: (id: string, docId: string)                         => api.delete<void>(`/api/participants/${id}/documents/${docId}`),
  uploadDocumentFile: (id: string, docId: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return api.upload<DocumentRecordDto>(`/api/participants/${id}/documents/${docId}/file`, form);
  },
  downloadDocumentFile: (id: string, docId: string) => api.file(`/api/participants/${id}/documents/${docId}/file`),
  deleteDocumentFile:   (id: string, docId: string) => api.delete<DocumentRecordDto>(`/api/participants/${id}/documents/${docId}/file`),

  // ── Bulk import ─────────────────────────────────────────────────────────────
  /** Checks a CSV (commit=false) or creates every row (commit=true) — all rows or none. */
  importCsv: (file: File, commit: boolean) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return api.upload<ParticipantImportReportDto>(`/api/participants/import?commit=${commit}`, form);
  },
  /** The blank sheet with the columns the import understands. */
  downloadImportTemplate: () => api.file("/api/participants/import/template"),
};
