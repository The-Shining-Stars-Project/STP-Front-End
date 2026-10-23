import { api } from "./client";
import type {
  ProjectDto,
  ProjectTaskDto,
  CreateProjectDto,
  UpdateProjectDto,
  CreateTaskDto,
  UpdateTaskDto,
} from "../types/api";

export const tasksApi = {
  getProjects:   ()                          => api.get<ProjectDto[]>("/api/projects"),
  createProject: (dto: CreateProjectDto)     => api.post<ProjectDto>("/api/projects", dto),
  // Project edit/delete and task delete are ManagementWrite (Oct 2026): gate the buttons on canManage.
  updateProject: (projectId: string, dto: UpdateProjectDto) =>
    api.put<ProjectDto>(`/api/projects/${projectId}`, dto),
  deleteProject: (projectId: string)         => api.delete<void>(`/api/projects/${projectId}`),
  addTask:       (projectId: string, dto: CreateTaskDto) =>
    api.post<ProjectTaskDto>(`/api/projects/${projectId}/tasks`, dto),
  updateTask:    (taskId: string, dto: UpdateTaskDto) =>
    api.put<ProjectTaskDto>(`/api/tasks/${taskId}`, dto),
  deleteTask:    (taskId: string)            => api.delete<void>(`/api/tasks/${taskId}`),
};
