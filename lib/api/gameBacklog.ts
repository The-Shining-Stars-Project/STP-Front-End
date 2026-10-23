import { api } from "./client";
import type {
  GameIdeaDto,
  CreateGameIdeaDto,
  AgeModificationDto,
  CreateAgeModificationDto,
  UpdateAgeModificationDto,
} from "../types/api";

export const gameBacklogApi = {
  getIdeas:   ()                            => api.get<GameIdeaDto[]>("/api/game-backlog/ideas"),
  createIdea: (dto: CreateGameIdeaDto)      => api.post<GameIdeaDto>("/api/game-backlog/ideas", dto),
  promote:    (id: string)                  => api.post<GameIdeaDto>(`/api/game-backlog/ideas/${id}/promote`, {}),
  /** Undoes a promote: deletes the library game it created. ManagementWrite. */
  demote:     (id: string)                  => api.post<GameIdeaDto>(`/api/game-backlog/ideas/${id}/demote`, {}),
  getAgeMods: ()                            => api.get<AgeModificationDto[]>("/api/game-backlog/age-mods"),
  createAgeMod: (dto: CreateAgeModificationDto) => api.post<AgeModificationDto>("/api/game-backlog/age-mods", dto),
  // Edit and delete are ManagementWrite (client decision, Oct 2026).
  updateAgeMod: (id: string, dto: UpdateAgeModificationDto) => api.put<AgeModificationDto>(`/api/game-backlog/age-mods/${id}`, dto),
  deleteAgeMod: (id: string)                => api.delete<void>(`/api/game-backlog/age-mods/${id}`),
};
