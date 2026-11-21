# CivicResolve Security Specification (Phase 0 TDD)

## 1. Core Data Invariants

1. **Owner-Only Citizen Isolation**: Citizens may create tickets only for themselves (`ownerId == request.auth.uid`, `ownerEmail == request.auth.token.email`, `email_verified == true`) and may only read (`get` or `list`) tickets where `resource.data.ownerId == request.auth.uid`.
2. **Console-Managed Admin Allowlist (`/admins/{uid}`)**: Admin privileges are derived solely from document existence at `/databases/$(database)/documents/admins/$(request.auth.uid)`. Clients may check only their own document (`get` where `request.auth.uid == uid`). All `list`, `create`, `update`, and `delete` operations on `/admins` are strictly denied.
3. **Admin-Only Forward Status Machine**: Only allowlisted admins may update tickets. Transitions are strictly linear: `Reported` -> `In Progress` -> `Resolved`. Skipping states (`Reported` -> `Resolved`) or modifying a `Resolved` ticket is denied.
4. **Required Resolution Note**: Moving a ticket from `In Progress` to `Resolved` requires `resolutionNote` (10–1000 chars) and `resolvedAt == request.time`.
5. **Immutable Citizen Evidence & Triage Record**: Once created, `id`, `ownerId`, `ownerEmail`, `ownerName`, `title`, `description`, `location`, `selectedCategory`, `triageStatus`, `recommendedCategory`, `recommendedDepartment`, `urgency`, `triageReason`, `triageModel`, `imageDataUrl`, and `createdAt` cannot be modified.
6. **Zero Shadow Fields & Bounded Sizes**: Every string, array, document ID, and optional image data URL is bounded in size and validated against strict `hasAll` / `hasOnly` / `affectedKeys().hasOnly()` checks.
7. **Temporal Integrity**: `createdAt`, `updatedAt`, and `resolvedAt` must match `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Identity Spoofing on Create**: Citizen A creates a ticket with `ownerId: "citizen-B"`.
2. **Unverified Email Create**: User with `email_verified: false` attempts to create a ticket.
3. **Shadow / Ghost Field Injection on Create**: Citizen adds `isAdminApproved: true` or `priorityOverride: 99` to ticket payload.
4. **Initial Status Tampering**: Citizen creates a ticket with `status: "Resolved"` or `status: "In Progress"`.
5. **Cross-Owner Citizen Read (`get`)**: Citizen A tries to `get` Citizen B's ticket.
6. **Unfiltered Citizen List Query (`list`)**: Citizen A runs `collection('tickets')` without `where('ownerId', '==', uid)`.
7. **Self-Promotion to Admin**: Citizen A tries to `setDoc(doc(db, 'admins', uid), { role: 'admin' })`.
8. **Admin Enumeration**: Any signed-in user tries to `list` the `/admins` collection.
9. **Citizen Self-Update**: Citizen A tries to update `status` on their own ticket.
10. **Admin State Shortcutting**: Admin attempts to move a ticket directly from `Reported` to `Resolved` (skipping `In Progress`).
11. **Admin Resolve Without Required Note**: Admin attempts to move `In Progress` -> `Resolved` with an empty or `< 10` character `resolutionNote`.
12. **Terminal State Mutation / Value Poisoning**: Admin attempts to modify a `Resolved` ticket or alter citizen's `description` / inject a 2MB `imageDataUrl` or invalid `ticketId` containing slashes/spaces.
