import { api } from "./client";
import type {
  StaffSummaryDto,
  StaffDetailDto,
  CreateStaffDto,
  UpdateStaffDto,
  ChecklistTemplateItemDto,
  SetOnboardingItemDto,
} from "../types/api";

export const staffApi = {
  getAll:  ()                          => api.get<StaffSummaryDto[]>("/api/staff"),
  getById: (id: string)                => api.get<StaffDetailDto>(`/api/staff/${id}`),
  create:  (dto: CreateStaffDto)       => api.post<StaffDetailDto>("/api/staff", dto),
  update:  (id: string, dto: UpdateStaffDto) => api.put<StaffDetailDto>(`/api/staff/${id}`, dto),
  setOnboardingItem: (staffId: string, itemId: string, dto: SetOnboardingItemDto) =>
    api.put<StaffDetailDto>(`/api/staff/${staffId}/onboarding/${itemId}`, dto),
  getChecklistTemplate: () =>
    api.get<ChecklistTemplateItemDto[]>("/api/staff/checklist-template"),
  updateChecklistTemplate: (items: ChecklistTemplateItemDto[]) =>
    api.put<ChecklistTemplateItemDto[]>("/api/staff/checklist-template", { items }),

  // ── Onboarding paperwork ────────────────────────────────────────────────────
  // The file behind a checklist item (offer letter, I-9, TB result…). Admin-only, like the
  // checklist itself. PDF, PNG or JPG, up to 25 MB; every call answers with the full detail.
  uploadOnboardingFile: (staffId: string, itemId: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return api.upload<StaffDetailDto>(`/api/staff/${staffId}/onboarding/${itemId}/file`, form);
  },
  downloadOnboardingFile: (staffId: string, itemId: string) => api.file(`/api/staff/${staffId}/onboarding/${itemId}/file`),
  deleteOnboardingFile:   (staffId: string, itemId: string) => api.delete<StaffDetailDto>(`/api/staff/${staffId}/onboarding/${itemId}/file`),
};
