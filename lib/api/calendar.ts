import { api } from "./client";
import type {
  CalendarEventDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  EventEditScope,
} from "../types/api";

/** ?scope=…&occurrence=… for repeating events; nothing for "all" (the API's default). */
function scopeQuery(scope: EventEditScope, occurrence?: string): string {
  if (scope === "all" && !occurrence) return "";
  const q = new URLSearchParams({ scope });
  if (occurrence) q.set("occurrence", occurrence);
  return `?${q.toString()}`;
}

export const calendarApi = {
  getEvents: (month: number, year: number) =>
    api.get<CalendarEventDto[]>(`/api/calendar/events?month=${month}&year=${year}`),
  create: (dto: CreateCalendarEventDto) =>
    api.post<CalendarEventDto>("/api/calendar/events", dto),
  /** For a repeating event, `occurrence` is the clicked day (yyyy-MM-dd) and `scope` which part to change. */
  update: (id: string, dto: UpdateCalendarEventDto, scope: EventEditScope = "all", occurrence?: string) =>
    api.put<CalendarEventDto>(`/api/calendar/events/${id}${scopeQuery(scope, occurrence)}`, dto),
  remove: (id: string, scope: EventEditScope = "all", occurrence?: string) =>
    api.delete<void>(`/api/calendar/events/${id}${scopeQuery(scope, occurrence)}`),
};
