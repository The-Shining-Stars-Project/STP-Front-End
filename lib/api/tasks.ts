import { api } from "./client";
import type {
  ProjectDto,
  ProjectTaskDto,
  CreateProjectDto,
  UpdateProjectDto,
  CreateTaskDto,
  UpdateTaskDto,
  TaskCompletionReportDto,
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
  /** Marking Done records the signed-in user as the completer. */
  updateTask:    (taskId: string, dto: UpdateTaskDto) =>
    api.put<ProjectTaskDto>(`/api/tasks/${taskId}`, dto),
  deleteTask:    (taskId: string)            => api.delete<void>(`/api/tasks/${taskId}`),
  /** Grab bag: assign an open role task to yourself. 409 if someone else already took it. */
  takeTask:      (taskId: string)            => api.post<ProjectTaskDto>(`/api/tasks/${taskId}/take`, {}),
  /** Completed-by report for an org-local month. ManagementWrite. */
  getCompletions: (year: number, month: number) =>
    api.get<TaskCompletionReportDto>(`/api/tasks/completions?year=${year}&month=${month}`),
};
