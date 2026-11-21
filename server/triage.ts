import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  MUNICIPAL_CATEGORIES,
  URGENCY_LEVELS,
  buildPendingReviewTriage,
  extractInlineImageParts,
  validateGeminiTriageOutput,
  type SelectedCategory,
  type TriageRecommendation,
} from '../src/shared/civicDomain.ts';

export const TRIAGE_MODEL = 'gemini-4-hydrogen';
const TRIAGE_TIMEOUT_MS = 25_000;

export interface TriageRequestInput {
  title: string;
  description: string;
  location: string;
  selectedCategory: SelectedCategory;
  imageDataUrl?: string;
}

export interface TriageExecutionResult {
  recommendation: TriageRecommendation;
  fallbackReasonCode?: 'MISSING_API_KEY' | 'UPSTREAM_ERROR' | 'TIMEOUT' | 'INVALID_MODEL_OUTPUT';
}

export type RawModelCaller = (params: {
  promptText: string;
  imagePart: { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null;
}) => Promise<string>;

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | undefined;

function getGeminiClient(apiKey: string): GoogleGenAI {
  if (cachedClient && cachedKey === apiKey) {
    return cachedClient;
  }
  cachedClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  cachedKey = apiKey;
  return cachedClient;
}

export function buildTriagePrompt(input: TriageRequestInput): string {
  const categoryGuidance =
    input.selectedCategory === 'Auto-detect'
      ? 'The citizen selected Auto-detect. Determine the single best municipal category from the allowed list.'
      : `The citizen suggested "${input.selectedCategory}". Confirm or refine this into the single best municipal category from the allowed list based on the issue details.`;

  return [
    'Triage the following municipal citizen issue report.',
    categoryGuidance,
    `Allowed categories (exact match required): ${MUNICIPAL_CATEGORIES.join(' | ')}`,
    `Allowed urgency levels (exact match required): ${URGENCY_LEVELS.join(' | ')}`,
    'Provide a concise 1 to 2 sentence factual reason (max 280 characters) explaining the recommended category and urgency.',
    '',
    `Report Title: ${input.title}`,
    `Location: ${input.location}`,
    `Citizen Selected Category: ${input.selectedCategory}`,
    `Description: ${input.description}`,
  ].join('\n');
}

async function callLiveGeminiOnce(
  apiKey: string,
  params: {
    promptText: string;
    imagePart: { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null;
  }
): Promise<string> {
  const ai = getGeminiClient(apiKey);
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (params.imagePart) {
    parts.push({
      inlineData: {
        mimeType: params.imagePart.mimeType,
        data: params.imagePart.data,
      },
    });
  }
  parts.push({ text: params.promptText });

  const response = await ai.models.generateContent({
    model: TRIAGE_MODEL,
    contents: { parts },
    config: {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
      },
      systemInstruction:
        'You are a municipal 311 triage classifier. Classify citizen issue reports into exactly one allowed municipal category and one allowed urgency level, with a short factual reason. Never invent new categories or urgency levels.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description: `Must be one of: ${MUNICIPAL_CATEGORIES.join(', ')}`,
          },
          urgency: {
            type: Type.STRING,
            description: `Must be one of: ${URGENCY_LEVELS.join(', ')}`,
          },
          reason: {
            type: Type.STRING,
            description: 'Concise 1-2 sentence triage justification grounded in the citizen report.',
          },
        },
        required: ['category', 'urgency', 'reason'],
      },
    },
  });

  return (response.text ?? '').trim();
}

export async function triageCivicReport(
  input: TriageRequestInput,
  options?: {
    apiKey?: string;
    caller?: RawModelCaller;
    timeoutMs?: number;
  }
): Promise<TriageExecutionResult> {
  const apiKey = options?.apiKey !== undefined ? options.apiKey : process.env.GEMINI_API_KEY;
  const caller = options?.caller;
  const timeoutMs = options?.timeoutMs ?? TRIAGE_TIMEOUT_MS;

  if (!caller && (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY')) {
    return {
      recommendation: buildPendingReviewTriage(
        'Gemini triage is not configured on the server. Report saved as Pending review for manual triage.'
      ),
      fallbackReasonCode: 'MISSING_API_KEY',
    };
  }

  const promptText = buildTriagePrompt(input);
  const imagePart = extractInlineImageParts(input.imageDataUrl);

  let rawText: string;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const invoke = caller
      ? caller({ promptText, imagePart })
      : callLiveGeminiOnce(apiKey as string, { promptText, imagePart });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TRIAGE_TIMEOUT')), timeoutMs);
    });

    rawText = await Promise.race([invoke, timeoutPromise]);
  } catch (err) {
    const isTimeout = err instanceof Error && err.message === 'TRIAGE_TIMEOUT';
    return {
      recommendation: buildPendingReviewTriage(
        isTimeout
          ? 'Live AI triage timed out. Report saved as Pending review for manual triage.'
          : 'Live AI triage was temporarily unavailable. Report saved as Pending review for manual triage.'
      ),
      fallbackReasonCode: isTimeout ? 'TIMEOUT' : 'UPSTREAM_ERROR',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      recommendation: buildPendingReviewTriage(
        'AI triage returned an unreadable format. Report saved as Pending review for manual triage.'
      ),
      fallbackReasonCode: 'INVALID_MODEL_OUTPUT',
    };
  }

  const validated = validateGeminiTriageOutput(parsed, TRIAGE_MODEL);
  if (!validated.valid) {
    return {
      recommendation: buildPendingReviewTriage(
        'AI triage output did not pass schema validation. Report saved as Pending review for manual triage.'
      ),
      fallbackReasonCode: 'INVALID_MODEL_OUTPUT',
    };
  }

  return {
    recommendation: validated.recommendation,
  };
}
