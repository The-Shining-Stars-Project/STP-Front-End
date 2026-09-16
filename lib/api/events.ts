import { api } from "./client";
import type {
  EventSessionSummaryDto,
  EventRosterDto,
  EventCandidateDto,
  CreateEventSessionDto,
  AddEventParticipantsDto,
  UpdateEventRecordDto,
  Guid,
} from "../types/api";

/**
 * Productions and events. A parallel surface to attendanceApi, not an extension of it —
 * event attendance is tracked separately from class attendance and never mixes with it.
 */
export const eventsApi = {
  list: (from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const q = p.toString();
    return api.get<EventSessionSummaryDto[]>(`/api/events${q ? `?${q}` : ""}`);
  },
  roster: (id: Guid) => api.get<EventRosterDto>(`/api/events/${id}`),
  candidates: (id: Guid) => api.get<EventCandidateDto[]>(`/api/events/${id}/candidates`),
  create: (dto: CreateEventSessionDto) => api.post<EventSessionSummaryDto>("/api/events", dto),
  addParticipants: (id: Guid, dto: AddEventParticipantsDto) =>
    api.post<EventRosterDto>(`/api/events/${id}/participants`, dto),
  removeParticipant: (id: Guid, participantId: Guid) =>
    api.delete<void>(`/api/events/${id}/participants/${participantId}`),
  updateRecord: (recordId: Guid, dto: UpdateEventRecordDto) =>
    api.put<void>(`/api/events/records/${recordId}`, dto),
  submit: (id: Guid) => api.post<EventSessionSummaryDto>(`/api/events/${id}/submit`, {}),
  /** Puts a submitted register back to Open so marks can be corrected (management). */
  reopen: (id: Guid) => api.post<EventSessionSummaryDto>(`/api/events/${id}/reopen`, {}),
  /** Deletes the event and its marks (admin). */
  remove: (id: Guid) => api.delete<void>(`/api/events/${id}`),
};
