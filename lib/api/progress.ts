import { api } from "./client";
import type {
  StarMonthDto,
  WeeklyDataEntryDto,
  MonthlyProgressSnapshotDto,
  RecordWeeklyScoreDto,
  ConfirmMonthEndDto,
  WeeklyFocusSkillDto,
  SetFocusSkillsDto,
  GoalBankEntryDto,
  GoalBankKind,
  WeeklyNoteSelectionDto,
  UpsertNoteSelectionDto,
  MonthlySummaryDto,
  UpsertMonthlySummaryDto,
} from "../types/api";

export const progressApi = {
  getStarMonth:   (participantId: string, month: string) =>
    api.get<StarMonthDto>(`/api/progress/star/${participantId}?month=${encodeURIComponent(month)}`),
  /** Every weekly score for a program's stars in one month — the Weekly Data grid's bulk read. */
  getProgramMonth: (programId: string, month: string) =>
    api.get<WeeklyDataEntryDto[]>(`/api/progress/weekly?programId=${programId}&month=${encodeURIComponent(month)}`),
  recordWeekly:   (dto: RecordWeeklyScoreDto) =>
    api.post<WeeklyDataEntryDto>("/api/progress/weekly", dto),
  computeMonthEnd: (participantId: string, month: string) =>
    api.post<MonthlyProgressSnapshotDto[]>(`/api/progress/star/${participantId}/compute?month=${encodeURIComponent(month)}`, {}),
  confirmMonthEnd: (participantId: string, month: string, dto: ConfirmMonthEndDto) =>
    api.post<MonthlyProgressSnapshotDto>(`/api/progress/star/${participantId}/confirm?month=${encodeURIComponent(month)}`, dto),

  getFocusSkills: (programId: string, month: string) =>
    api.get<WeeklyFocusSkillDto[]>(`/api/progress/focus-skills?programId=${programId}&month=${encodeURIComponent(month)}`),
  setFocusSkills: (dto: SetFocusSkillsDto) =>
    api.put<WeeklyFocusSkillDto[]>("/api/progress/focus-skills", dto),

  recordNote: (participantId: string, month: string, dto: UpsertNoteSelectionDto) =>
    api.post<WeeklyNoteSelectionDto>(`/api/progress/star/${participantId}/note?month=${encodeURIComponent(month)}`, dto),
  upsertSummary: (participantId: string, month: string, dto: UpsertMonthlySummaryDto) =>
    api.put<MonthlySummaryDto>(`/api/progress/star/${participantId}/summary?month=${encodeURIComponent(month)}`, dto),
};

export const goalBankApi = {
  get: (params?: { section?: number; level?: string; kind?: GoalBankKind }) => {
    const p = new URLSearchParams();
    if (params?.section) p.set("section", String(params.section));
    if (params?.level) p.set("level", params.level);
    if (params?.kind) p.set("kind", params.kind);
    const s = p.toString();
    return api.get<GoalBankEntryDto[]>(`/api/goal-bank${s ? `?${s}` : ""}`);
  },
};
