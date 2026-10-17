import { api } from "./client";
import type {
  CopyRosterForwardDto,
  CopyRosterForwardResultDto,
  RosterEntryDto,
  UpsertRosterAssignmentDto,
} from "../types/api";

export const rosterApi = {
  get: (year: number, quarter: number, siteId?: string) => {
    const p = new URLSearchParams({ year: String(year), quarter: String(quarter) });
    if (siteId) p.set("siteId", siteId);
    return api.get<RosterEntryDto[]>(`/api/roster?${p.toString()}`);
  },
  myStars: (year: number, quarter: number) =>
    api.get<RosterEntryDto[]>(`/api/roster/my-stars?year=${year}&quarter=${quarter}`),
  upsert: (dto: UpsertRosterAssignmentDto) =>
    api.put<RosterEntryDto>("/api/roster/assignment", dto),
  /**
   * Fill a term from each enrolment's most recent EARLIER term (managers only). Enrolments
   * that already have a row in the term are left alone, so it never overwrites.
   */
  copyForward: (year: number, quarter: number) =>
    api.post<CopyRosterForwardResultDto>("/api/roster/copy-forward", { year, quarter } satisfies CopyRosterForwardDto),
};
