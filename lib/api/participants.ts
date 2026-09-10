import { api } from "./client";
import type {
  ParticipantSummaryDto,
  ParticipantDetailDto,
  CreateParticipantDto,
  UpdateParticipantDto,
  ParticipantArtsProfileDto,
  UpsertArtsProfileDto,
  DocumentRecordDto,
  CreateDocumentRecordDto,
  UpdateDocumentRecordDto,
} from "../types/api";

export const participantsApi = {
  getAll:   ()                              => api.get<ParticipantSummaryDto[]>("/api/participants"),
  getById:  (id: string)                    => api.get<ParticipantDetailDto>(`/api/participants/${id}`),
  create:   (dto: CreateParticipantDto)     => api.post<ParticipantDetailDto>("/api/participants", dto),
  update:   (id: string, dto: UpdateParticipantDto) => api.put<ParticipantDetailDto>(`/api/participants/${id}`, dto),
  remove:   (id: string)                    => api.delete<void>(`/api/participants/${id}`),

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
};
