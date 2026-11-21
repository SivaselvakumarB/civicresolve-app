import type { CivicTicket } from '../shared/civicDomain';

export type SandboxRole = 'citizen' | 'admin' | null;

export function getSandboxRoleFromUrl(): SandboxRole {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('demo');
  if (mode === 'citizen' || mode === 'admin') {
    return mode;
  }
  return null;
}

export function getSandboxInitialTickets(): CivicTicket[] {
  const now = Date.now();
  return [
    {
      id: 'CR-2026-K9M4P2',
      ownerId: 'sandbox-citizen-uid',
      ownerEmail: 'maya.patel@civic-preview.local',
      ownerName: 'Maya Patel',
      title: 'Dark crosswalk streetlight at 5th & Pine',
      description:
        'Overhead LED streetlight pole #412 has been completely dark for three evenings, leaving the east crosswalk poorly visible after sunset.',
      location: 'Corner of 5th Ave & Pine St',
      selectedCategory: 'Auto-detect',
      status: 'In Progress',
      triageStatus: 'completed',
      recommendedCategory: 'Streetlight & Electrical',
      recommendedDepartment: 'Public Lighting & Electrical Services',
      urgency: 'High',
      triageReason:
        'Unlit arterial pedestrian crosswalk presents an immediate nighttime safety risk requiring electrical crew dispatch.',
      triageModel: 'gemini-4-hydrogen',
      assignedAdminUid: 'sandbox-admin-uid',
      assignedAdminEmail: 'ops.dispatcher@civic-preview.local',
      timeline: [
        {
          status: 'Reported',
          timestampMs: now - 1000 * 60 * 60 * 14,
          actor: 'Maya Patel',
          note: 'Report filed. AI triage recommended Public Lighting & Electrical Services (High urgency).',
        },
        {
          status: 'In Progress',
          timestampMs: now - 1000 * 60 * 60 * 3,
          actor: 'Ops Dispatcher',
          note: 'Assigned for municipal crew dispatch to Public Lighting & Electrical Services.',
        },
      ],
      createdAtMs: now - 1000 * 60 * 60 * 14,
      updatedAtMs: now - 1000 * 60 * 60 * 3,
    },
    {
      id: 'CR-2026-R4T8W1',
      ownerId: 'sandbox-citizen-uid',
      ownerEmail: 'maya.patel@civic-preview.local',
      ownerName: 'Maya Patel',
      title: 'Clogged storm drain pooling across bike lane',
      description:
        'Leaves and construction silt have blocked the curb inlet, creating a 12-foot puddle across the northbound bike lane after rain.',
      location: '1180 Cedar Blvd, northbound curb',
      selectedCategory: 'Water & Drainage',
      status: 'Resolved',
      triageStatus: 'completed',
      recommendedCategory: 'Water & Drainage',
      recommendedDepartment: 'Water & Sewer Authority',
      urgency: 'Medium',
      triageReason:
        'Blocked storm inlet causes standing water in the cycling corridor and potential runoff pooling.',
      triageModel: 'gemini-4-hydrogen',
      assignedAdminUid: 'sandbox-admin-uid',
      assignedAdminEmail: 'ops.dispatcher@civic-preview.local',
      resolutionNote:
        'Stormwater crew cleared compacted debris from inlet grate #1180-N and confirmed full drainage flow.',
      timeline: [
        {
          status: 'Reported',
          timestampMs: now - 1000 * 60 * 60 * 52,
          actor: 'Maya Patel',
          note: 'Report filed. AI triage recommended Water & Sewer Authority (Medium urgency).',
        },
        {
          status: 'In Progress',
          timestampMs: now - 1000 * 60 * 60 * 36,
          actor: 'Ops Dispatcher',
          note: 'Assigned for municipal crew dispatch to Water & Sewer Authority.',
        },
        {
          status: 'Resolved',
          timestampMs: now - 1000 * 60 * 60 * 20,
          actor: 'Ops Dispatcher',
          note: 'Stormwater crew cleared compacted debris from inlet grate #1180-N and confirmed full drainage flow.',
        },
      ],
      createdAtMs: now - 1000 * 60 * 60 * 52,
      updatedAtMs: now - 1000 * 60 * 60 * 20,
      resolvedAtMs: now - 1000 * 60 * 60 * 20,
    },
    {
      id: 'CR-2026-V2N7X5',
      ownerId: 'other-citizen-uid',
      ownerEmail: 'daniel.cho@civic-preview.local',
      ownerName: 'Daniel Cho',
      title: 'Fallen oak limb blocking park footpath',
      description:
        'A large oak branch cracked during overnight wind gusts and is resting across the main gravel loop path near the south footbridge.',
      location: 'Riverside Park, South Footbridge Trail',
      selectedCategory: 'Parks & Trees',
      status: 'Reported',
      triageStatus: 'pending_review',
      recommendedCategory: 'Pending review',
      recommendedDepartment: 'Pending review',
      urgency: 'Pending review',
      triageReason:
        'Live AI triage was unavailable at submission. Ticket is queued for manual triage review.',
      triageModel: 'unavailable',
      timeline: [
        {
          status: 'Reported',
          timestampMs: now - 1000 * 60 * 50,
          actor: 'Daniel Cho',
          note: 'Report filed. Triage queued as Pending review.',
        },
      ],
      createdAtMs: now - 1000 * 60 * 50,
      updatedAtMs: now - 1000 * 60 * 50,
    },
  ];
}
