import { api } from "./client";
import type { SiteDto, CreateSiteDto, UpdateSiteDto } from "../types/api";

// Program sites, managed from Settings. Dropdowns keep reading ACTIVE sites from
// /api/lists (useReferenceLists); this is the full list, retired included, and the writes.
// There is no delete — a site is retired, because rosters and event registers point at it.
export const sitesApi = {
  getAll: ()                                 => api.get<SiteDto[]>("/api/sites"),
  create: (dto: CreateSiteDto)               => api.post<SiteDto>("/api/sites", dto),
  update: (id: string, dto: UpdateSiteDto)   => api.put<SiteDto>(`/api/sites/${id}`, dto),
};
