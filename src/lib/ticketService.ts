import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  LIMITS,
  PENDING_REVIEW_LABEL,
  buildPendingReviewTriage,
  generateTicketId,
  sortTicketsNewestFirst,
  validateStatusTransition,
  type CivicTicket,
  type MunicipalCategory,
  type SelectedCategory,
  type TicketStatus,
  type TimelineEntry,
  type TriageRecommendation,
  type UrgencyLevel,
} from '../shared/civicDomain';
import { OperationType, db, handleFirestoreError } from './firebase';

export interface SubmittedReportPayload {
  title: string;
  description: string;
  location: string;
  selectedCategory: SelectedCategory;
  imageDataUrl?: string;
}

export async function requestServerTriage(
  payload: SubmittedReportPayload
): Promise<{ recommendation: TriageRecommendation; fallbackReasonCode: string | null }> {
  try {
    const response = await fetch('/api/triage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        recommendation: buildPendingReviewTriage(
          'Server triage returned an error. Ticket saved as Pending review for manual triage.'
        ),
        fallbackReasonCode: `HTTP_${response.status}`,
      };
    }

    const data = (await response.json()) as {
      recommendation?: TriageRecommendation;
      fallbackReasonCode?: string | null;
    };

    if (!data?.recommendation) {
      return {
        recommendation: buildPendingReviewTriage(),
        fallbackReasonCode: 'EMPTY_RESPONSE',
      };
    }

    return {
      recommendation: data.recommendation,
      fallbackReasonCode: data.fallbackReasonCode ?? null,
    };
  } catch {
    return {
      recommendation: buildPendingReviewTriage(
        'Could not reach server triage endpoint. Ticket saved as Pending review for manual triage.'
      ),
      fallbackReasonCode: 'NETWORK_ERROR',
    };
  }
}

export async function compressImageToDataUrl(file: File): Promise<string> {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Please choose a JPEG, PNG, or WebP image file.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Source image must be smaller than 8 MB.');
  }

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode selected image.'));
      img.src = bitmapUrl;
    });

    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
    const targetW = Math.max(1, Math.round(image.width * scale));
    const targetH = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas is unavailable for image processing.');
    }
    ctx.drawImage(image, 0, 0, targetW, targetH);

    let quality = 0.72;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > LIMITS.IMAGE_DATA_URL_MAX && quality > 0.25) {
      quality -= 0.12;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    if (dataUrl.length > LIMITS.IMAGE_DATA_URL_MAX) {
      throw new Error('Image could not be compressed under storage limits. Try a smaller photo.');
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

function mapDocToTicket(id: string, data: DocumentData): CivicTicket {
  const rawTimeline = Array.isArray(data.timeline) ? data.timeline : [];
  const timeline: TimelineEntry[] = rawTimeline
    .filter((item): item is TimelineEntry => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      status: item.status as TicketStatus,
      timestampMs: typeof item.timestampMs === 'number' ? item.timestampMs : Date.now(),
      actor: typeof item.actor === 'string' ? item.actor : 'System',
      note: typeof item.note === 'string' ? item.note : '',
    }));

  return {
    id: typeof data.id === 'string' ? data.id : id,
    ownerId: String(data.ownerId ?? ''),
    ownerEmail: String(data.ownerEmail ?? ''),
    ownerName: String(data.ownerName ?? 'Citizen'),
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    location: String(data.location ?? ''),
    selectedCategory: (data.selectedCategory ?? 'Auto-detect') as SelectedCategory,
    status: (data.status ?? 'Reported') as TicketStatus,
    triageStatus: data.triageStatus === 'completed' ? 'completed' : 'pending_review',
    recommendedCategory: (data.recommendedCategory ?? PENDING_REVIEW_LABEL) as
      | MunicipalCategory
      | typeof PENDING_REVIEW_LABEL,
    recommendedDepartment: String(data.recommendedDepartment ?? PENDING_REVIEW_LABEL),
    urgency: (data.urgency ?? PENDING_REVIEW_LABEL) as UrgencyLevel | typeof PENDING_REVIEW_LABEL,
    triageReason: String(data.triageReason ?? ''),
    triageModel: String(data.triageModel ?? 'unavailable'),
    imageDataUrl: typeof data.imageDataUrl === 'string' ? data.imageDataUrl : undefined,
    resolutionNote: typeof data.resolutionNote === 'string' ? data.resolutionNote : undefined,
    assignedAdminUid: typeof data.assignedAdminUid === 'string' ? data.assignedAdminUid : undefined,
    assignedAdminEmail:
      typeof data.assignedAdminEmail === 'string' ? data.assignedAdminEmail : undefined,
    timeline,
    createdAtMs: typeof data.createdAtMs === 'number' ? data.createdAtMs : Date.now(),
    updatedAtMs: typeof data.updatedAtMs === 'number' ? data.updatedAtMs : Date.now(),
    resolvedAtMs: typeof data.resolvedAtMs === 'number' ? data.resolvedAtMs : undefined,
  };
}

export async function checkAdminAllowlist(uid: string): Promise<boolean> {
  const path = `admins/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createTicketInFirestore(
  user: User,
  draft: SubmittedReportPayload,
  triage: TriageRecommendation
): Promise<CivicTicket> {
  const ticketId = generateTicketId();
  const nowMs = Date.now();
  const ownerName = (user.displayName || user.email || 'Citizen').trim().slice(0, 120);
  const ownerEmail = (user.email || '').trim().slice(0, 254);

  const initialTimeline: TimelineEntry[] = [
    {
      status: 'Reported',
      timestampMs: nowMs,
      actor: ownerName,
      note:
        triage.triageStatus === 'completed'
          ? `Report filed. AI triage recommended ${triage.recommendedDepartment} (${triage.urgency} urgency).`
          : 'Report filed. Triage queued as Pending review.',
    },
  ];

  const payload: Record<string, unknown> = {
    id: ticketId,
    ownerId: user.uid,
    ownerEmail,
    ownerName,
    title: draft.title.trim().slice(0, LIMITS.TITLE_MAX),
    description: draft.description.trim().slice(0, LIMITS.DESCRIPTION_MAX),
    location: draft.location.trim().slice(0, LIMITS.LOCATION_MAX),
    selectedCategory: draft.selectedCategory,
    status: 'Reported',
    triageStatus: triage.triageStatus,
    recommendedCategory: triage.recommendedCategory,
    recommendedDepartment: triage.recommendedDepartment,
    urgency: triage.urgency,
    triageReason: triage.triageReason.slice(0, LIMITS.TRIAGE_REASON_MAX),
    triageModel: triage.triageModel.slice(0, 64),
    timeline: initialTimeline,
    createdAt: serverTimestamp(),
    createdAtMs: nowMs,
    updatedAt: serverTimestamp(),
    updatedAtMs: nowMs,
  };

  if (draft.imageDataUrl) {
    payload.imageDataUrl = draft.imageDataUrl;
  }

  const path = `tickets/${ticketId}`;
  try {
    await setDoc(doc(db, 'tickets', ticketId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    id: ticketId,
    ownerId: user.uid,
    ownerEmail,
    ownerName,
    title: payload.title as string,
    description: payload.description as string,
    location: payload.location as string,
    selectedCategory: draft.selectedCategory,
    status: 'Reported',
    triageStatus: triage.triageStatus,
    recommendedCategory: triage.recommendedCategory,
    recommendedDepartment: triage.recommendedDepartment,
    urgency: triage.urgency,
    triageReason: payload.triageReason as string,
    triageModel: payload.triageModel as string,
    imageDataUrl: draft.imageDataUrl,
    timeline: initialTimeline,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export function subscribeCitizenTickets(
  uid: string,
  onTickets: (tickets: CivicTicket[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `tickets?ownerId=${uid}`;
  const q = query(collection(db, 'tickets'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => mapDocToTicket(docSnap.id, docSnap.data()));
      onTickets(sortTicketsNewestFirst(items));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeAllTicketsForAdmin(
  onTickets: (tickets: CivicTicket[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'tickets';
  const q = query(collection(db, 'tickets'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => mapDocToTicket(docSnap.id, docSnap.data()));
      onTickets(sortTicketsNewestFirst(items));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function advanceTicketStatusInFirestore(
  ticket: CivicTicket,
  adminUser: User,
  nextStatus: TicketStatus,
  resolutionNote?: string
): Promise<void> {
  const transition = validateStatusTransition(ticket.status, nextStatus, resolutionNote);
  if (!transition.valid) {
    throw new Error(transition.error);
  }

  const nowMs = Date.now();
  const adminActor = (adminUser.displayName || adminUser.email || 'Municipal Admin')
    .trim()
    .slice(0, 120);
  const adminEmail = (adminUser.email || '').trim().slice(0, 254);

  const newEntry: TimelineEntry = {
    status: nextStatus,
    timestampMs: nowMs,
    actor: adminActor,
    note:
      nextStatus === 'Resolved'
        ? transition.cleanedResolutionNote!
        : `Assigned for municipal crew dispatch to ${ticket.recommendedDepartment}.`,
  };

  const nextTimeline = [...ticket.timeline, newEntry];

  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    updatedAt: serverTimestamp(),
    updatedAtMs: nowMs,
    timeline: nextTimeline,
    assignedAdminUid: adminUser.uid,
    assignedAdminEmail: adminEmail,
  };

  if (nextStatus === 'Resolved') {
    updatePayload.resolutionNote = transition.cleanedResolutionNote;
    updatePayload.resolvedAt = serverTimestamp();
    updatePayload.resolvedAtMs = nowMs;
  }

  const path = `tickets/${ticket.id}`;
  try {
    await updateDoc(doc(db, 'tickets', ticket.id), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
