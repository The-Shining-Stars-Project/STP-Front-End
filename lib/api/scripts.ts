import { api } from "./client";
import type {
  ScriptDto,
  CreateScriptDto,
  UpdateScriptDto,
} from "../types/api";

export const scriptsApi = {
  getAll:  ()                        => api.get<ScriptDto[]>("/api/scripts"),
  getById: (id: string)              => api.get<ScriptDto>(`/api/scripts/${id}`),
  create:  (dto: CreateScriptDto)    => api.post<ScriptDto>("/api/scripts", dto),
  update:  (id: string, dto: UpdateScriptDto) => api.put<ScriptDto>(`/api/scripts/${id}`, dto),

  // ── PDF attachment ──────────────────────────────────────────────────────────
  // One PDF per script, stored in Azure Blob Storage behind the API. Uploading again
  // replaces it; every call answers with the updated ScriptDto.

  /** Attaches or replaces the script's PDF. 400 if it is not a PDF or is over 25 MB; 503 until storage is configured. */
  uploadPdf: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return api.upload<ScriptDto>(`/api/scripts/${id}/pdf`, form);
  },

  /** The PDF's bytes plus the file name it was uploaded under. 404 when there is none. */
  downloadPdf: (id: string) => api.file(`/api/scripts/${id}/pdf`),

  /** Detaches and deletes the PDF. Idempotent. */
  deletePdf: (id: string) => api.delete<ScriptDto>(`/api/scripts/${id}/pdf`),
};
