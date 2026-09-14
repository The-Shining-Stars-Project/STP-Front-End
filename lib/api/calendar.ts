import { api } from "./client";
import type {
  CalendarEventDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from "../types/api";

export const calendarApi = {
  getEvents: (month: number, year: number) =>
    api.get<CalendarEventDto[]>(`/api/calendar/events?month=${month}&year=${year}`),
  create: (dto: CreateCalendarEventDto) =>
    api.post<CalendarEventDto>("/api/calendar/events", dto),
  update: (id: string, dto: UpdateCalendarEventDto) =>
    api.put<CalendarEventDto>(`/api/calendar/events/${id}`, dto),
  remove: (id: string) =>
    api.delete<void>(`/api/calendar/events/${id}`),
};
