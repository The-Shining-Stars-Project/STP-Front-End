// ── Shared ────────────────────────────────────────────────────────────────────

export type Guid = string;

// ── Enums (mirror backend) ────────────────────────────────────────────────────

export type ParticipantStatus = "Active" | "Prospective" | "Attention" | "Former" | "AuthPending" | "Inquiry" | "NotInterested";
export type StaffRole = "Teacher" | "Coordinator" | "Admin";
export type AttendanceStatus = "Present" | "Absent" | "Unmarked";
export type TaskStatus = "Upcoming" | "InProgress" | "Done" | "Overdue" | "Blocked";
export type TaskPriority = "High" | "Medium" | "Low";
export type ScriptType = "Musical" | "Play" | "Scene" | "Skit";
export type ScriptStatus = "Active" | "Draft" | "Archived";
export type ProjectType = "Production" | "Staff" | "Admin" | "Event";
export type AlertSeverity = "Danger" | "Warning" | "Info";
export type UserRole = "Staff" | "Admin";
export type ProgressLevel = "Novice" | "Intermediate" | "Expert" | "NotApplicable" | "Vocational";
export type ProgramTrack = "PartTime" | "Pathways";
export type DataScore = "Refusal" | "FullPrompts" | "MinimalPrompts" | "Independent" | "NotApplicable";
export type GoalBankKind = "Strength" | "AreaForImprovement" | "NewGoal";
export type GameSource = "TSSP" | "Suggested";
export type GameCategory =
  | "Warmup" | "Circle" | "Movement" | "Name"
  | "Icebreaker" | "Theater" | "Reset" | "SuggestedAddition";
/** Flags enum serialized as a name or comma-separated list, e.g. "All" or "Novice, Intermediate". */
export type GameTier = string;

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterUserDto {
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
  staffMemberId?: Guid;
}

export interface UserDto {
  id: Guid;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  staffMemberId: Guid | null;
  /**
   * Whether this account has a confirmed second factor. Not a secret — the admin user
   * list needs it to show who is still unenrolled, and the account page uses it to
   * decide between "enroll" and "manage".
   */
  mfaEnabled: boolean;
}

export interface UpdateUserDto {
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
  staffMemberId?: Guid;
}

export interface ResetPasswordDto {
  newPassword: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResultDto {
  token: string;
  expiresAt: string;
  user: UserDto;
}

// ── Multi-factor authentication ───────────────────────────────────────────────

/**
 * What POST /api/auth/login returns. `auth` is null exactly when `mfaRequired` is true,
 * in which case the backend has set only a short-lived challenge cookie and the caller
 * owes a code to POST /api/auth/login/mfa.
 *
 * The JWT moved from `.token` to `.auth.token` when the second factor landed — nothing
 * in this app reads it (it lives in an httpOnly cookie), but the shape changed.
 */
export interface LoginResponseDto {
  mfaRequired: boolean;
  auth: AuthResultDto | null;
}

/** A 6-digit TOTP code or a recovery code; the backend tells them apart by shape. */
export interface MfaVerifyDto {
  code: string;
}

export interface MfaSetupResultDto {
  /** Base32, for typing into an authenticator app by hand. */
  secret: string;
  /** otpauth:// URI — what the QR code encodes, and a deep link on mobile. */
  otpAuthUri: string;
}

export interface MfaEnableDto {
  code: string;
}

/** Returned exactly once, at enrollment or regeneration. Nothing retrieves them again. */
export interface MfaEnableResultDto {
  recoveryCodes: string[];
}

export interface MfaDisableDto {
  currentPassword: string;
  code: string;
}

/** Body for an admin MFA reset. currentPassword is required only when targeting yourself. */
export interface AdminResetMfaDto {
  currentPassword?: string;
}

export interface MfaStatusDto {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

// ── Productions & events (attendance tracked separately from classes) ─────────

export type EventCategory = "Production" | "Event";

/**
 * Serialized from the SessionStatus enum, so capitalized — unlike the class attendance DTOs,
 * which hand-map to lowercase strings with an extra "in-progress" state the enum has no
 * concept of.
 */
export type EventStatus = "Open" | "Submitted";

export interface EventSiteDto {
  id: Guid;
  name: string;
}

export interface EventSessionSummaryDto {
  id: Guid;
  title: string;
  category: EventCategory;
  /** yyyy-MM-dd */
  date: string;
  venue: string | null;
  timeRange: string | null;
  hoursLogged: number | null;
  status: EventStatus;
  sites: EventSiteDto[];
  /** Counts describe what the caller may see, not necessarily the whole register. */
  totalCount: number;
  markedCount: number;
  presentCount: number;
}

export interface EventRosterEntryDto {
  recordId: Guid;
  participantId: Guid;
  participantName: string;
  participantInitials: string;
  programName: string;
  programSlug: string;
  siteId: Guid | null;
  siteName: string | null;
  status: AttendanceStatus;
  canMark: boolean;
}

export interface EventRosterDto {
  event: EventSessionSummaryDto;
  entries: EventRosterEntryDto[];
}

export interface EventCandidateDto {
  participantId: Guid;
  fullName: string;
  initials: string;
  programName: string;
  programSlug: string;
  alreadyAdded: boolean;
}

export interface CreateEventSessionDto {
  title: string;
  category: EventCategory;
  date: string;
  venue?: string | null;
  timeRange?: string | null;
  siteIds: Guid[];
}

export interface AddEventParticipantsDto {
  participantIds: Guid[];
  siteId?: Guid | null;
}

export interface UpdateEventRecordDto {
  status: AttendanceStatus;
  siteId?: Guid | null;
}

// ── Programs ──────────────────────────────────────────────────────────────────

export interface ProgramSummaryDto {
  id: Guid;
  name: string;
  slug: string;
  colorHex: string;
  sessionSchedule: string | null;
  defaultLocation: string | null;
  /** Flags enum serialized as comma-separated names, e.g. "Monday, Wednesday, Friday" or "None". */
  meetingDays: string;
  /** "HH:mm:ss" or null. */
  startTime: string | null;
  endTime: string | null;
  enrolledCount: number;
  attendancePct: number | null;
  nextSessionDate: string | null;
  nextSessionMeta: string | null;
  alertCount: number;
}

export interface ProgramDetailDto {
  id: Guid;
  name: string;
  slug: string;
  colorHex: string;
  sessionSchedule: string | null;
  defaultLocation: string | null;
  enrolledCount: number;
  attendancePct: number | null;
  participants: ParticipantSummaryDto[];
  upcomingEvents: CalendarEventDto[];
  staff: StaffSummaryDto[];
  alerts: ProgramAlertDto[];
}

export interface ProgramAlertDto {
  severity: AlertSeverity;
  message: string;
  participantId: Guid | null;
}

export interface CreateProgramDto {
  name: string;
  colorHex: string;
  sessionSchedule?: string;
  defaultLocation?: string;
  /** Comma-separated day names ("Monday, Wednesday, Friday") or "None". */
  meetingDays?: string;
  /** "HH:mm:ss". */
  startTime?: string;
  endTime?: string;
}

export interface UpdateProgramDto {
  name: string;
  colorHex: string;
  sessionSchedule?: string;
  defaultLocation?: string;
  meetingDays: string;
  startTime?: string;
  endTime?: string;
}

// ── Participants ──────────────────────────────────────────────────────────────

export interface ParticipantSummaryDto {
  id: Guid;
  fullName: string;
  initials: string;
  status: ParticipantStatus;
  programId: Guid;
  programName: string;
  programSlug: string;
  attendancePct: number;
  startDate: string;
  hasDocAlerts: boolean;
  birthYear: number | null;
  serviceCoordinator: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  referralSource: string | null;
  tShirtSize: string | null;
  intakeNotes: string | null;
  /** yyyy-MM-dd, null when not set. */
  authorizationExpiry: string | null;
  /** yyyy-MM-dd, null when not set. */
  ippExpiry: string | null;
  /** yyyy-MM-dd, null when not set. */
  dateOfBirth: string | null;
  allergies: string | null;
  allergyAnaphylactic: boolean;
  areasOfConcern: string | null;
  serviceCoordinatorEmail: string | null;
  serviceCoordinatorPhone: string | null;
  contactInRemind: string | null;
  intakeDocsSubmitted: boolean;
  hasHighSchoolDiploma: boolean | null;
  secondaryProgramId: Guid | null;
  secondaryProgramName: string | null;
  secondaryProgramSlug: string | null;
}

export interface ParticipantDetailDto extends ParticipantSummaryDto {
  documents: DocumentRecordDto[];
  recentAttendance: AttendanceRecordDto[];
}

export interface ParticipantArtsProfileDto {
  participantId: Guid;
  ippSummary: string | null;
  currentLevel: string | null;
  tsspArtsGoal: string | null;
  hasProfile: boolean;
}

export interface UpsertArtsProfileDto {
  ippSummary?: string | null;
  currentLevel?: string | null;
  tsspArtsGoal?: string | null;
}

// ── Progress tracking (weekly data + month-end levels) ────────────────────────

export interface WeeklyDataEntryDto {
  id: Guid;
  participantId: Guid;
  subSkillId: Guid;
  sessionId: Guid | null;
  monthKey: string;
  weekNumber: number;
  weekDate: string;
  score: DataScore;
  recordedByStaffMemberId: Guid | null;
  /** The month-end snapshot for this skill, refreshed by the same save. */
  snapshot: MonthlyProgressSnapshotDto | null;
}

export interface MonthlyProgressSnapshotDto {
  id: Guid;
  participantId: Guid;
  subSkillId: Guid;
  subSkillName: string;
  sectionNumber: number;
  monthKey: string;
  level: ProgressLevel;
  suggestedLevel: ProgressLevel;
  summedScore: number;
  scoredWeekCount: number;
  isConfirmed: boolean;
  confirmedByStaffMemberId: Guid | null;
}

export interface GoalBankEntryDto {
  id: Guid;
  kind: GoalBankKind;
  sectionNumber: number;
  level: ProgressLevel;
  text: string;
  hasGrowingEdge: boolean;
}

export interface WeeklyNoteSelectionDto {
  id: Guid;
  participantId: Guid;
  monthKey: string;
  weekNumber: number;
  kind: GoalBankKind;
  goalBankEntryId: Guid | null;
  customText: string | null;
  displayText: string | null;
}

export interface UpsertNoteSelectionDto {
  weekNumber: number;
  kind: GoalBankKind;
  goalBankEntryId?: Guid | null;
  customText?: string | null;
}

export interface MonthlySummaryDto {
  participantId: Guid;
  monthKey: string;
  primaryLevel: ProgressLevel;
  progressNarrative: string | null;
  goalsCarryOver: boolean;
  nextMonthUpdate: string | null;
  hasSummary: boolean;
}

export interface UpsertMonthlySummaryDto {
  primaryLevel: ProgressLevel;
  progressNarrative?: string | null;
  goalsCarryOver: boolean;
  nextMonthUpdate?: string | null;
}

export interface StarMonthDto {
  participantId: Guid;
  monthKey: string;
  entries: WeeklyDataEntryDto[];
  snapshots: MonthlyProgressSnapshotDto[];
  noteSelections: WeeklyNoteSelectionDto[];
  monthlySummary: MonthlySummaryDto | null;
  /** Overall level for the month — every weekly score pooled across skills and averaged once. */
  suggestedPrimaryLevel: ProgressLevel;
  /** How many weekly scores fed that suggestion; 0 means there is nothing to suggest. */
  suggestedPrimaryScoredCount: number;
}

/** One Star behind a roll-up count, fetched on demand rather than inlined into every row. */
export interface CohortStarDto {
  participantId: Guid;
  fullName: string;
  initials: string;
  programName: string;
}

export interface CohortRollUpRowDto {
  subSkillId: Guid;
  subSkillName: string;
  sectionNumber: number;
  objectiveAreaName: string;
  objectiveAreaColorHex: string;
  noviceCount: number;
  intermediateCount: number;
  expertCount: number;
  notApplicableCount: number;
  scoredCount: number;
  mostCommonLevel: string;
}

export interface CohortRollUpDto {
  monthKey: string;
  programId: Guid | null;
  programName: string | null;
  participantCount: number;
  rows: CohortRollUpRowDto[];
}

// ── Game backlog (To Develop) ─────────────────────────────────────────────────

export interface GameIdeaDto {
  id: Guid;
  name: string;
  statusNotes: string | null;
  sourceInspiration: string | null;
  targetCategory: GameCategory | null;
  teacherSuggested: boolean;
  teacherSuggestedId: Guid | null;
  teacherSuggestedName: string | null;
  promotedGameId: Guid | null;
}

export interface CreateGameIdeaDto {
  name: string;
  statusNotes?: string | null;
  sourceInspiration?: string | null;
  targetCategory?: GameCategory | null;
  teacherSuggested: boolean;
  teacherSuggestedId?: Guid | null;
}

export interface AgeModificationDto {
  id: Guid;
  gameName: string;
  groupAgeLevel: string;
  modification: string;
  teacherSuggested: boolean;
  teacherSuggestedId: Guid | null;
  teacherSuggestedName: string | null;
  gameId: Guid | null;
}

export interface CreateAgeModificationDto {
  gameName: string;
  groupAgeLevel: string;
  modification: string;
  teacherSuggested: boolean;
  teacherSuggestedId?: Guid | null;
  gameId?: Guid | null;
}

// ── Per-Star planning ─────────────────────────────────────────────────────────

export interface PerStarPlanDto {
  participantId: Guid;
  participantName: string;
  participantInitials: string;
  programId: Guid;
  programName: string;
  programSlug: string;
  monthKey: string;
  planId: Guid | null;
  assignedStaffId: Guid | null;
  assignedStaffName: string | null;
  primaryTier: ProgressLevel;
  priorityObjectiveAreaId: Guid | null;
  priorityObjectiveAreaName: string | null;
  prioritySubSkillId: Guid | null;
  prioritySubSkillName: string | null;
  monthlyGoal: string | null;
  howIllSupport: string | null;
  notes: string | null;
}

export interface UpsertPerStarPlanDto {
  participantId: Guid;
  monthKey: string;
  assignedStaffId?: Guid | null;
  primaryTier: ProgressLevel;
  priorityObjectiveAreaId?: Guid | null;
  prioritySubSkillId?: Guid | null;
  monthlyGoal?: string | null;
  howIllSupport?: string | null;
  notes?: string | null;
}

export interface RecordWeeklyScoreDto {
  participantId: Guid;
  subSkillId: Guid;
  monthKey: string;
  weekNumber: number;
  weekDate?: string | null;
  score: DataScore;
  sessionId?: Guid | null;
  recordedByStaffMemberId?: Guid | null;
}

export interface ConfirmMonthEndDto {
  subSkillId: Guid;
  level: ProgressLevel;
  confirmedByStaffMemberId?: Guid | null;
}

export interface WeeklyFocusSkillDto {
  programId: Guid;
  monthKey: string;
  weekNumber: number;
  subSkillId: Guid;
  subSkillName: string;
  sectionNumber: number;
}

export interface SetFocusSkillsDto {
  programId: Guid;
  monthKey: string;
  weekNumber: number;
  subSkillIds: Guid[];
}

export interface CreateParticipantDto {
  fullName: string;
  initials: string;
  programId: Guid;
  status?: ParticipantStatus;
  birthYear?: number;
  serviceCoordinator?: string;
  startDate?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  referralSource?: string;
  tShirtSize?: string;
  intakeNotes?: string;
  authorizationExpiry?: string;
  ippExpiry?: string;
  dateOfBirth?: string;
  allergies?: string;
  allergyAnaphylactic?: boolean;
  areasOfConcern?: string;
  serviceCoordinatorEmail?: string;
  serviceCoordinatorPhone?: string;
  contactInRemind?: string;
  intakeDocsSubmitted?: boolean;
  hasHighSchoolDiploma?: boolean;
  secondaryProgramId?: Guid;
}

export interface UpdateParticipantDto {
  fullName?: string;
  initials?: string;
  programId?: Guid;
  status?: ParticipantStatus;
  birthYear?: number;
  serviceCoordinator?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  referralSource?: string;
  tShirtSize?: string;
  intakeNotes?: string;
  authorizationExpiry?: string;
  /** True clears the stored expiry (null alone means "unchanged"). */
  clearAuthorizationExpiry?: boolean;
  ippExpiry?: string;
  clearIppExpiry?: boolean;
  dateOfBirth?: string;
  allergies?: string;
  allergyAnaphylactic?: boolean;
  areasOfConcern?: string;
  serviceCoordinatorEmail?: string;
  serviceCoordinatorPhone?: string;
  contactInRemind?: string;
  intakeDocsSubmitted?: boolean;
  hasHighSchoolDiploma?: boolean;
  secondaryProgramId?: Guid;
  /** True removes the secondary enrollment (null alone means "unchanged"). */
  clearSecondaryProgram?: boolean;
}

// ── Staff ─────────────────────────────────────────────────────────────────────

export interface StaffSummaryDto {
  id: Guid;
  fullName: string;
  initials: string;
  role: StaffRole;
  startDate: string;
  /** yyyy-MM-dd; non-null marks the member as former. */
  endDate: string | null;
  isFormer: boolean;
  tShirtSize: string | null;
  onboardingProgressPct: number;
  programNames: string[];
}

export interface StaffDetailDto extends StaffSummaryDto {
  onboardingItems: OnboardingItemDto[];
}

export interface CreateStaffDto {
  fullName: string;
  initials: string;
  role: StaffRole;
  startDate?: string;
  programIds?: Guid[];
  tShirtSize?: string;
}

export interface ChecklistTemplateItemDto {
  section: string;
  label: string;
}

export interface UpdateChecklistTemplateDto {
  items: ChecklistTemplateItemDto[];
}

export interface SetOnboardingItemDto {
  isCompleted: boolean;
  /** Due/renewal date for expiring items (CPR, TB, Mandated Reporter…). */
  expiryDate?: string;
  /** True clears the stored expiry (null alone means "unchanged"). */
  clearExpiry?: boolean;
}

export interface UpdateStaffDto {
  fullName?: string;
  initials?: string;
  role?: StaffRole;
  programIds?: Guid[];
  endDate?: string;
  /** True clears the end date, restoring the member to active. */
  clearEndDate?: boolean;
  tShirtSize?: string;
}

// ── Attendance ────────────────────────────────────────────────────────────────

export interface AttendanceSessionDto {
  sessionId: Guid;
  programId: Guid;
  date: string;
  room: string | null;
  timeRange: string | null;
  records: AttendanceRecordDto[];
}

export interface AttendanceRecordDto {
  id: Guid;
  participantId: Guid;
  participantName: string;
  participantInitials: string;
  status: AttendanceStatus;
  group: string | null;
  notes: AttendanceNoteDto[];
}

export interface AttendanceNoteDto {
  id: Guid;
  content: string;
  noteType: "observation" | "concern";
}

export interface UpdateAttendanceDto {
  status: AttendanceStatus;
}

export interface AttendanceRosterEntryDto {
  recordId: Guid;
  participantId: Guid;
  fullName: string;
  initials: string;
  programId: Guid;
  programSlug: string;
  programName: string;
  status: AttendanceStatus;
  notes: AttendanceNoteDto[];
}

export interface CreateAttendanceNoteDto {
  content: string;
  noteType: "observation" | "concern";
}

/** A session card on the attendance landing page (scoped to the current user's programs). */
export interface ScheduledSessionDto {
  sessionId: Guid | null;
  programId: Guid;
  programSlug: string;
  programName: string;
  colorHex: string;
  date: string;
  timeRange: string | null;
  room: string | null;
  status: "not-started" | "in-progress" | "submitted";
  markedCount: number;
  totalCount: number;
  isAdHoc: boolean;
}

/** A single session's roster plus meta — the working view for taking attendance. */
export interface SessionRosterDto {
  sessionId: Guid;
  programId: Guid;
  programSlug: string;
  programName: string;
  colorHex: string;
  date: string;
  timeRange: string | null;
  room: string | null;
  status: "open" | "submitted";
  submittedAt: string | null;
  /** Total hours the session ran — recorded for Pathways reporting. */
  hoursLogged: number | null;
  entries: AttendanceRosterEntryDto[];
}

export interface SetSessionHoursDto {
  hours: number | null;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardDto {
  participants: ParticipantSummaryDto[];
  todayRoster: AttendanceRosterEntryDto[];
  projects: ProjectDto[];
  staff: StaffSummaryDto[];
  programs: ProgramSummaryDto[];
  events: CalendarEventDto[];
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface ReportsDto {
  totals: ReportTotalsDto;
  programs: ProgramReportDto[];
  staffOnboarding: StaffOnboardingReportDto[];
  attendance: AttendanceSummaryDto;
  starAttendance: StarAttendanceReportDto[];
}

/** Per-star attendance tally — presents, absences, and rate across all marked records. */
export interface StarAttendanceReportDto {
  participantId: Guid;
  name: string;
  programName: string;
  programSlug: string;
  status: string;
  present: number;
  absent: number;
  presentRatePct: number;
}

export interface ReportTotalsDto {
  totalParticipants: number;
  activeParticipants: number;
  prospective: number;
  attention: number;
  former: number;
  programs: number;
  staff: number;
  fullyOnboardedStaff: number;
  avgAttendancePct: number;
  openTasks: number;
  overdueTasks: number;
}

export interface ProgramReportDto {
  slug: string;
  name: string;
  enrolled: number;
  attendancePct: number;
  sessions: number;
}

export interface StaffOnboardingReportDto {
  name: string;
  pct: number;
}

export interface AttendanceSummaryDto {
  sessions: number;
  present: number;
  absent: number;
  unmarked: number;
  presentRatePct: number;
}

// ── Volunteers ────────────────────────────────────────────────────────────────

export interface VolunteerDto {
  id: Guid;
  fullName: string;
  initials: string;
  phone: string | null;
  email: string | null;
  programId: Guid;
  programName: string;
  programSlug: string;
  notes: string | null;
  isActive: boolean;
  startDate: string;
}

export interface CreateVolunteerDto {
  fullName: string;
  programId: Guid;
  phone?: string;
  email?: string;
  notes?: string;
  startDate?: string;
}

export interface UpdateVolunteerDto {
  fullName?: string;
  programId?: Guid;
  phone?: string;
  email?: string;
  notes?: string;
  isActive?: boolean;
}

// ── Projects & Tasks ──────────────────────────────────────────────────────────

export interface ProjectDto {
  id: Guid;
  title: string;
  type: ProjectType;
  status: string;
  scope: string | null;
  dueDate: string | null;
  tasks: ProjectTaskDto[];
}

export interface ProjectTaskDto {
  id: Guid;
  projectId: Guid;
  name: string;
  context: string | null;
  assignedToId: Guid | null;
  assignedToName: string | null;
  assignedToInitials: string | null;
  taskStatus: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  isOverdue: boolean;
}

export interface CreateProjectDto {
  title: string;
  type: ProjectType;
  status?: string;
  scope?: string;
  dueDate?: string;
}

export interface CreateTaskDto {
  projectId: Guid;
  name: string;
  context?: string;
  assignedToId?: Guid;
  priority?: TaskPriority;
  dueDate?: string;
}

export interface UpdateTaskDto {
  name?: string;
  context?: string;
  assignedToId?: Guid | null;
  taskStatus?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
}

// ── Scripts ───────────────────────────────────────────────────────────────────

export interface ScriptDto {
  id: Guid;
  title: string;
  subtitle: string | null;
  type: ScriptType;
  status: ScriptStatus;
  isOriginal: boolean;
  isAdapted: boolean;
  castMin: number | null;
  castMax: number | null;
  duration: string | null;
  lastUsed: string | null;
  programNames: string[];
  /** Whether a PDF is attached. The bytes come from GET /api/scripts/{id}/pdf, never inline. */
  hasPdf: boolean;
  pdfFileName: string | null;
  pdfSizeBytes: number | null;
  /** Upload instant, UTC with no designator — read it with parseApiTimestamp. */
  pdfUploadedAt: string | null;
}

export interface CreateScriptDto {
  title: string;
  subtitle?: string;
  type: ScriptType;
  status?: ScriptStatus;
  isOriginal?: boolean;
  isAdapted?: boolean;
  castMin?: number;
  castMax?: number;
  duration?: string;
  programIds?: Guid[];
}

export interface UpdateScriptDto {
  title?: string;
  subtitle?: string;
  type?: ScriptType;
  status?: ScriptStatus;
  programIds?: Guid[];
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export interface CalendarEventDto {
  id: Guid;
  title: string;
  location: string | null;
  meta: string | null;
  date: string;
  timeRange: string | null;
  programId: Guid | null;
  programName: string | null;
  isUpcoming: boolean;
}

export interface CreateCalendarEventDto {
  title: string;
  date: string;
  programId?: Guid;
  location?: string;
  meta?: string;
  timeRange?: string;
}

// ── Year Calendar (annual themes + key arts dates) ────────────────────────────

export type ThemeArc = "FoundationalReset" | "SpringShow" | "Nutcracker";

export interface CalendarThemeDto {
  month: number;
  themeTitle: string;
  themeSubtitle: string | null;
  keyArtsDatesText: string | null;
  featuredGamesText: string | null;
  alternativeOptionsText: string | null;
  productionPhase: string | null;
  programmingNotes: string | null;
  legendArc: ThemeArc | null;
}

export interface KeyArtsDateDto {
  id: Guid;
  month: number;
  sortOrder: number;
  dateText: string;
  observance: string;
  observanceType: string | null;
  programmingTieIn: string | null;
}

export interface UpsertCalendarThemeDto {
  month: number;
  themeTitle: string;
  themeSubtitle?: string | null;
  keyArtsDatesText?: string | null;
  featuredGamesText?: string | null;
  alternativeOptionsText?: string | null;
  productionPhase?: string | null;
  programmingNotes?: string | null;
  legendArc?: ThemeArc | null;
}

export interface YearCalendarDto {
  themes: CalendarThemeDto[];
  keyArtsDates: KeyArtsDateDto[];
}

// ── Taxonomy (shared skill framework) ─────────────────────────────────────────

export interface SubSkillDto {
  id: Guid;
  objectiveAreaId: Guid;
  name: string;
  slug: string;
  sectionNumber: number;
  sortOrder: number;
  isActive: boolean;
  objectiveAreaName: string | null;
  objectiveAreaColorHex: string | null;
}

export interface ObjectiveAreaDto {
  id: Guid;
  name: string;
  slug: string;
  colorHex: string;
  sortOrder: number;
  /** Which progress framework the area belongs to. */
  track: ProgramTrack;
  annualGoal: string | null;
  sixMonthBenchmark: string | null;
  subSkills: SubSkillDto[];
}

export interface SiteDto {
  id: Guid;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface StarGroupDto {
  id: Guid;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface ReferenceListsDto {
  objectiveAreas: ObjectiveAreaDto[];
  subSkills: SubSkillDto[];
  progressLevels: ProgressLevel[];
  sites: SiteDto[];
  starGroups: StarGroupDto[];
}

// ── Games Library ─────────────────────────────────────────────────────────────

export interface GameSubGoalDto {
  subSkillId: Guid;
  subSkillName: string;
  sectionNumber: number;
  objectiveAreaColorHex: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface GameSummaryDto {
  id: Guid;
  name: string;
  source: GameSource;
  category: GameCategory;
  categoryLabel: string | null;
  tiers: GameTier;
  primaryObjectiveAreaId: Guid;
  primaryObjectiveAreaName: string;
  primaryObjectiveAreaColorHex: string;
  whenToUse: string | null;
  location: string | null;
  programId: Guid | null;
  programName: string | null;
  subGoals: GameSubGoalDto[];
}

export interface GameDetailDto extends GameSummaryDto {
  description: string | null;
  bestForVariations: string | null;
}

export interface GameFilter {
  tier?: "Novice" | "Intermediate" | "Expert";
  objectiveAreaId?: Guid;
  subSkillId?: Guid;
  category?: GameCategory;
  q?: string;
  programId?: Guid;
}

export interface CreateGameSubGoalDto {
  subSkillId: Guid;
  isPrimary: boolean;
}

export interface CreateGameDto {
  name: string;
  source: GameSource;
  category: GameCategory;
  categoryLabel?: string | null;
  /** "All" or a comma-separated list, e.g. "Novice, Intermediate". */
  tiers: GameTier;
  primaryObjectiveAreaId: Guid;
  description?: string | null;
  bestForVariations?: string | null;
  whenToUse?: string | null;
  location?: string | null;
  programId?: Guid | null;
  subGoals: CreateGameSubGoalDto[];
}

export type UpdateGameDto = CreateGameDto;

// ── Roster & Assignments ──────────────────────────────────────────────────────

export interface RosterEntryDto {
  participantId: Guid;
  participantName: string;
  participantInitials: string;
  programId: Guid;
  programName: string;
  programSlug: string;
  assignmentId: Guid | null;
  siteId: Guid | null;
  siteName: string | null;
  starGroupId: Guid | null;
  starGroupName: string | null;
  assignedStaffId: Guid | null;
  assignedStaffName: string | null;
  countedInRatio: boolean;
  notes: string | null;
  quarter: number;
  year: number;
}

export interface UpsertRosterAssignmentDto {
  participantId: Guid;
  quarter: number;
  year: number;
  siteId?: Guid | null;
  starGroupId?: Guid | null;
  assignedStaffId?: Guid | null;
  countedInRatio: boolean;
  notes?: string | null;
}

// ── Documents & Onboarding ────────────────────────────────────────────────────

export interface DocumentRecordDto {
  id: Guid;
  documentType: string;
  expiryDate: string | null;
  isComplete: boolean;
  /** The attached scan, described but never embedded — bytes come from .../documents/{id}/file. */
  hasFile: boolean;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
}

/** Outcome of checking (and optionally committing) a Stars spreadsheet — one shape for both. */
export interface ParticipantImportReportDto {
  fileName: string;
  sourceHash: string;
  rowCount: number;
  readyCount: number;
  problemCount: number;
  fileProblems: string[];
  committed: boolean;
  createdCount: number;
  rows: ParticipantImportRowDto[];
}

export interface ParticipantImportRowDto {
  /** 1-based spreadsheet line, matching what the reviewer sees in Excel. */
  line: number;
  name: string;
  program: string;
  status: "ready" | "error" | "created";
  messages: string[];
  participantId: Guid | null;
}

export interface CreateDocumentRecordDto {
  documentType: string;
  expiryDate?: string;
  isComplete?: boolean;
}

export interface UpdateDocumentRecordDto {
  documentType?: string;
  expiryDate?: string;
  /** True clears the stored expiry (omitting expiryDate alone means "unchanged"). */
  clearExpiry?: boolean;
  isComplete?: boolean;
}

export interface OnboardingItemDto {
  id: Guid;
  section: string;
  label: string;
  isCompleted: boolean;
  completedDate: string | null;
  expiryDate: string | null;
  /** The paperwork behind the item — bytes come from /api/staff/{id}/onboarding/{itemId}/file. */
  hasFile: boolean;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

/**
 * One row of GET /api/audit. Read-only: the table is append-only and the API exposes
 * no PUT or DELETE, so nothing here has an update counterpart.
 */
export interface AuditEventDto {
  id: Guid;
  /**
   * The instant the event happened, recorded as UTC. It arrives WITHOUT a trailing "Z"
   * — the value round-trips through SQL Server as a kind-less DateTime — so passing it
   * straight to `new Date()` reads it as local time and shifts it by the viewer's offset.
   * Use `parseApiTimestamp` from lib/format.
   */
  occurredAt: string;
  /** Null when no account matched the actor, e.g. a failed sign-in against an unknown address. */
  userId: Guid | null;
  userEmail: string;
  userRole: string | null;
  /** Dotted key, e.g. "auth.login", "participant.update". */
  action: string;
  entityType: string | null;
  entityId: Guid | null;
  summary: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  succeeded: boolean;
  /** Free-form JSON detail — a failure reason, a status code, an export's row count. */
  metadata: string | null;
}

/**
 * Filters for GET /api/audit. All optional, combined with AND by the backend, with two
 * matching rules that are easy to get wrong from the UI side:
 *   - `action` is a PREFIX match ("auth" pulls auth.login, auth.mfa.verify, …)
 *   - `userEmail` and `entityType` are EXACT (email is normalized to lower-case first)
 */
export interface AuditQueryParams {
  /** ISO instant. Not a calendar date — see the conversion helpers in the audit page. */
  from?: string;
  to?: string;
  userId?: Guid;
  userEmail?: string;
  action?: string;
  entityType?: string;
  succeeded?: boolean;
  /** 1-based. Omitting both paging fields still yields page 1 at size 50, never the whole table. */
  page?: number;
  /** Clamped to 1..200 server-side. */
  pageSize?: number;
}

/** The body rows plus the pre-paging total the endpoint returns in X-Total-Count. */
export interface AuditPageDto {
  rows: AuditEventDto[];
  total: number;
}

/**
 * The export kinds POST /api/audit/export accepts. This is a closed vocabulary —
 * ExportAuditValidation.AllowedKinds rejects anything else with a 400 rather than
 * letting callers invent log entries — so a new export site needs a backend change
 * before it can be reported here.
 */
export type AuditExportKind =
  | "reports-summary"
  | "star-attendance"
  | "participant-roster"
  | "stars-detail"
  | "staff-onboarding";

/** What the client reports after building a CSV in the browser. */
export interface RecordExportDto {
  exportKind: AuditExportKind;
  rowCount: number;
  fileName?: string;
  /** Short free-text description of what was in scope (filters applied, selection size). */
  scope?: string;
}
