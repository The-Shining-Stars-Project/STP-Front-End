import { api } from "./client";
import type { YearCalendarDto, KeyArtsDateDto, ResolvedKeyArtsDateDto, CalendarThemeDto, UpsertCalendarThemeDto } from "../types/api";

export const yearCalendarApi = {
  getCalendar:     () => api.get<YearCalendarDto>("/api/year-calendar"),
  getKeyArtsDates: () => api.get<KeyArtsDateDto[]>("/api/year-calendar/key-arts-dates"),
  /** The key arts dates placed on real days of `year`, for the calendar's Annual Planning layer. */
  getResolvedKeyArtsDates: (year: number) => api.get<ResolvedKeyArtsDateDto[]>(`/api/year-calendar/key-arts-dates/resolved?year=${year}`),
  upsertTheme:     (dto: UpsertCalendarThemeDto) => api.put<CalendarThemeDto>("/api/year-calendar/theme", dto),
};
