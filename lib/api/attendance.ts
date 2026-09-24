import { api } from "./client";
import type {
  AttendanceSessionDto,
  AttendanceNoteDto,
  CreateAttendanceNoteDto,
  UpdateAttendanceDto,
  ScheduledSessionDto,
  SessionRosterDto,
} from "../types/api";

export const attendanceApi = {
  /** Session cards for a date (defaults to today), scoped to the signed-in user's programs. */
  getScheduled:  (date?: string)                          => api.get<ScheduledSessionDto[]>(`/api/attendance/scheduled${date ? `?date=${date}` : ""}`),
  /** Reads a program's session roster for a date — 404s if none has been opened yet. */
  getProgramSession: (programId: string, date?: string)   => api.get<SessionRosterDto>(`/api/attendance/session?programId=${programId}${date ? `&date=${date}` : ""}`),
  /** Opens (gets or creates) the session for a program on a date. POST — GETs no longer create (#23). */
  openProgramSession: (programId: string, date?: string)  => api.post<SessionRosterDto>("/api/attendance/session", { programId, date }),
  /** Finalizes a session, locking its records. */
  submitSession: (sessionId: string)                      => api.post<void>(`/api/attendance/session/${sessionId}/submit`, {}),
  /** Unlocks a submitted session (management only) so a late arrival or mis-tap can be fixed. Audited. */
  reopenSession: (sessionId: string)                      => api.post<void>(`/api/attendance/session/${sessionId}/reopen`, {}),
  /** Records the session's total hours (Pathways attendance-time reporting). */
  setSessionHours: (sessionId: string, hours: number | null) => api.put<void>(`/api/attendance/session/${sessionId}/hours`, { hours }),

  getSession:    (sessionId: string)                      => api.get<AttendanceSessionDto>(`/api/attendance/session/${sessionId}`),
  updateRecord:  (recordId: string, dto: UpdateAttendanceDto) => api.put<void>(`/api/attendance/${recordId}`, dto),
  addNote:       (recordId: string, dto: CreateAttendanceNoteDto) => api.post<AttendanceNoteDto>(`/api/attendance/${recordId}/notes`, dto),
};
