export const MUNICIPAL_CATEGORIES = [
  'Road & Sidewalk',
  'Streetlight & Electrical',
  'Water & Drainage',
  'Sanitation & Waste',
  'Parks & Trees',
  'Public Safety & Signage',
] as const;

export type MunicipalCategory = (typeof MUNICIPAL_CATEGORIES)[number];

export const CATEGORY_OPTIONS = ['Auto-detect', ...MUNICIPAL_CATEGORIES] as const;
export type SelectedCategory = (typeof CATEGORY_OPTIONS)[number];

export const URGENCY_LEVELS = ['Low', 'Medium', 'High', 'Critical'] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const TICKET_STATUSES = ['Reported', 'In Progress', 'Resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PENDING_REVIEW_LABEL = 'Pending review' as const;

export const CATEGORY_TO_DEPARTMENT: Record<MunicipalCategory, string> = {
  'Road & Sidewalk': 'Department of Transportation & Streets',
  'Streetlight & Electrical': 'Public Lighting & Electrical Services',
  'Water & Drainage': 'Water & Sewer Authority',
  'Sanitation & Waste': 'Department of Sanitation',
  'Parks & Trees': 'Parks & Urban Forestry',
  'Public Safety & Signage': 'Civic Traffic & Safety Bureau',
};

export const ALLOWED_DEPARTMENTS = [
  ...Object.values(CATEGORY_TO_DEPARTMENT),
  PENDING_REVIEW_LABEL,
] as const;

export const LIMITS = {
  TITLE_MIN: 3,
  TITLE_MAX: 120,
  DESCRIPTION_MIN: 10,
  DESCRIPTION_MAX: 1500,
  LOCATION_MIN: 3,
  LOCATION_MAX: 200,
  TRIAGE_REASON_MIN: 5,
  TRIAGE_REASON_MAX: 400,
  RESOLUTION_NOTE_MIN: 10,
  RESOLUTION_NOTE_MAX: 1000,
  IMAGE_DATA_URL_MAX: 180_000,
  TICKET_ID_REGEX: /^[a-zA-Z0-9_-]{6,40}$/,
  IMAGE_DATA_URL_REGEX: /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/,
} as const;

export interface TimelineEntry {
  status: TicketStatus;
  timestampMs: number;
  actor: string;
  note: string;
}

export interface TriageRecommendation {
  triageStatus: 'completed' | 'pending_review';
  recommendedCategory: MunicipalCategory | typeof PENDING_REVIEW_LABEL;
  recommendedDepartment: string;
  urgency: UrgencyLevel | typeof PENDING_REVIEW_LABEL;
  triageReason: string;
  triageModel: string;
}

export interface CivicTicket {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  title: string;
  description: string;
  location: string;
  selectedCategory: SelectedCategory;
  status: TicketStatus;
  triageStatus: 'completed' | 'pending_review';
  recommendedCategory: MunicipalCategory | typeof PENDING_REVIEW_LABEL;
  recommendedDepartment: string;
  urgency: UrgencyLevel | typeof PENDING_REVIEW_LABEL;
  triageReason: string;
  triageModel: string;
  imageDataUrl?: string;
  resolutionNote?: string;
  assignedAdminUid?: string;
  assignedAdminEmail?: string;
  timeline: TimelineEntry[];
  createdAtMs: number;
  updatedAtMs: number;
  resolvedAtMs?: number;
}

export interface ReportDraftInput {
  title: string;
  description: string;
  location: string;
  selectedCategory: string;
  imageDataUrl?: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  errors: Record<string, string>;
}

export function isMunicipalCategory(value: unknown): value is MunicipalCategory {
  return typeof value === 'string' && (MUNICIPAL_CATEGORIES as readonly string[]).includes(value);
}

export function isSelectedCategory(value: unknown): value is SelectedCategory {
  return typeof value === 'string' && (CATEGORY_OPTIONS as readonly string[]).includes(value);
}

export function isUrgencyLevel(value: unknown): value is UrgencyLevel {
  return typeof value === 'string' && (URGENCY_LEVELS as readonly string[]).includes(value);
}

export function mapCategoryToDepartment(category: MunicipalCategory): string {
  return CATEGORY_TO_DEPARTMENT[category];
}

export function buildPendingReviewTriage(reasonOverride?: string): TriageRecommendation {
  const fallbackReason =
    reasonOverride && reasonOverride.trim().length >= LIMITS.TRIAGE_REASON_MIN
      ? reasonOverride.trim().slice(0, LIMITS.TRIAGE_REASON_MAX)
      : 'Live AI triage was unavailable at submission. Ticket is queued for manual triage review.';

  return {
    triageStatus: 'pending_review',
    recommendedCategory: PENDING_REVIEW_LABEL,
    recommendedDepartment: PENDING_REVIEW_LABEL,
    urgency: PENDING_REVIEW_LABEL,
    triageReason: fallbackReason,
    triageModel: 'unavailable',
  };
}

/**
 * Validates raw JSON output returned by Gemini and maps the validated category
 * to a fixed municipal department. Rejects malformed, unknown, or empty outputs.
 */
export function validateGeminiTriageOutput(
  raw: unknown,
  modelName = 'gemini-4-hydrogen'
): { valid: true; recommendation: TriageRecommendation } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, error: 'Triage response is not a JSON object.' };
  }

  const candidate = raw as Record<string, unknown>;
  const category = typeof candidate.category === 'string' ? candidate.category.trim() : '';
  const urgency = typeof candidate.urgency === 'string' ? candidate.urgency.trim() : '';
  const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : '';

  if (!isMunicipalCategory(category)) {
    return { valid: false, error: `Invalid category returned by model: "${category}".` };
  }

  if (!isUrgencyLevel(urgency)) {
    return { valid: false, error: `Invalid urgency returned by model: "${urgency}".` };
  }

  if (reason.length < LIMITS.TRIAGE_REASON_MIN) {
    return { valid: false, error: 'Triage reason is missing or too short.' };
  }

  const boundedReason = reason.slice(0, LIMITS.TRIAGE_REASON_MAX);

  return {
    valid: true,
    recommendation: {
      triageStatus: 'completed',
      recommendedCategory: category,
      recommendedDepartment: mapCategoryToDepartment(category),
      urgency,
      triageReason: boundedReason,
      triageModel: modelName.slice(0, 64),
    },
  };
}

export function validateReportInput(input: ReportDraftInput): ValidationResult<{
  title: string;
  description: string;
  location: string;
  selectedCategory: SelectedCategory;
  imageDataUrl?: string;
}> {
  const errors: Record<string, string> = {};
  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();
  const location = (input.location ?? '').trim();
  const selectedCategory = (input.selectedCategory ?? '').trim();
  const imageDataUrl = input.imageDataUrl ? input.imageDataUrl.trim() : undefined;

  if (title.length < LIMITS.TITLE_MIN || title.length > LIMITS.TITLE_MAX) {
    errors.title = `Title must be between ${LIMITS.TITLE_MIN} and ${LIMITS.TITLE_MAX} characters.`;
  }

  if (description.length < LIMITS.DESCRIPTION_MIN || description.length > LIMITS.DESCRIPTION_MAX) {
    errors.description = `Description must be between ${LIMITS.DESCRIPTION_MIN} and ${LIMITS.DESCRIPTION_MAX} characters.`;
  }

  if (location.length < LIMITS.LOCATION_MIN || location.length > LIMITS.LOCATION_MAX) {
    errors.location = `Location must be between ${LIMITS.LOCATION_MIN} and ${LIMITS.LOCATION_MAX} characters.`;
  }

  if (!isSelectedCategory(selectedCategory)) {
    errors.selectedCategory = 'Select a valid municipal category or Auto-detect.';
  }

  if (imageDataUrl !== undefined && imageDataUrl !== '') {
    if (imageDataUrl.length > LIMITS.IMAGE_DATA_URL_MAX) {
      errors.imageDataUrl = 'Attached image exceeds maximum storage size after compression.';
    } else if (!LIMITS.IMAGE_DATA_URL_REGEX.test(imageDataUrl)) {
      errors.imageDataUrl = 'Image must be a valid JPEG, PNG, or WebP file.';
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      title,
      description,
      location,
      selectedCategory: selectedCategory as SelectedCategory,
      ...(imageDataUrl ? { imageDataUrl } : {}),
    },
    errors: {},
  };
}

export function getNextAdminStatus(currentStatus: TicketStatus): TicketStatus | null {
  if (currentStatus === 'Reported') return 'In Progress';
  if (currentStatus === 'In Progress') return 'Resolved';
  return null;
}

export function validateStatusTransition(
  currentStatus: TicketStatus,
  nextStatus: TicketStatus,
  resolutionNote?: string
): { valid: true; cleanedResolutionNote?: string } | { valid: false; error: string } {
  const expectedNext = getNextAdminStatus(currentStatus);
  if (!expectedNext) {
    return { valid: false, error: 'Resolved tickets are closed and cannot be modified.' };
  }
  if (nextStatus !== expectedNext) {
    return {
      valid: false,
      error: `Invalid transition from ${currentStatus} to ${nextStatus}. Expected ${expectedNext}.`,
    };
  }
  if (nextStatus === 'Resolved') {
    const cleaned = (resolutionNote ?? '').trim();
    if (cleaned.length < LIMITS.RESOLUTION_NOTE_MIN) {
      return {
        valid: false,
        error: `A resolution note of at least ${LIMITS.RESOLUTION_NOTE_MIN} characters is required.`,
      };
    }
    if (cleaned.length > LIMITS.RESOLUTION_NOTE_MAX) {
      return {
        valid: false,
        error: `Resolution note cannot exceed ${LIMITS.RESOLUTION_NOTE_MAX} characters.`,
      };
    }
    return { valid: true, cleanedResolutionNote: cleaned };
  }
  return { valid: true };
}

export function generateTicketId(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(Math.random() * alphabet.length);
    suffix += alphabet[idx];
  }
  return `CR-${year}-${suffix}`;
}

export function sortTicketsNewestFirst<T extends { createdAtMs: number }>(tickets: T[]): T[] {
  return [...tickets].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function extractInlineImageParts(
  imageDataUrl?: string
): { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null {
  if (!imageDataUrl) return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl);
  if (!match) return null;
  return {
    mimeType: match[1] as 'image/jpeg' | 'image/png' | 'image/webp',
    data: match[2],
  };
}
