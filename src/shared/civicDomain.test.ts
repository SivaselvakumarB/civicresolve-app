import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_TO_DEPARTMENT,
  LIMITS,
  MUNICIPAL_CATEGORIES,
  PENDING_REVIEW_LABEL,
  buildPendingReviewTriage,
  extractInlineImageParts,
  generateTicketId,
  getNextAdminStatus,
  mapCategoryToDepartment,
  sortTicketsNewestFirst,
  validateGeminiTriageOutput,
  validateReportInput,
  validateStatusTransition,
} from './civicDomain.ts';

test('every municipal category maps deterministically to a fixed department', () => {
  for (const cat of MUNICIPAL_CATEGORIES) {
    const dept = mapCategoryToDepartment(cat);
    assert.ok(dept && dept.length > 5);
    assert.equal(dept, CATEGORY_TO_DEPARTMENT[cat]);
  }
});

test('validateGeminiTriageOutput accepts valid payload and maps fixed department', () => {
  const result = validateGeminiTriageOutput({
    category: 'Water & Drainage',
    urgency: 'High',
    reason: 'Active water main leak flooding roadway and risking sinkhole formation.',
  });
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.recommendation.triageStatus, 'completed');
    assert.equal(result.recommendation.recommendedCategory, 'Water & Drainage');
    assert.equal(result.recommendation.recommendedDepartment, 'Water & Sewer Authority');
    assert.equal(result.recommendation.urgency, 'High');
  }
});

test('validateGeminiTriageOutput rejects unknown category, invalid urgency, or empty reason', () => {
  assert.equal(
    validateGeminiTriageOutput({
      category: 'Alien Invasion',
      urgency: 'High',
      reason: 'Not a real municipal category.',
    }).valid,
    false
  );
  assert.equal(
    validateGeminiTriageOutput({
      category: 'Road & Sidewalk',
      urgency: 'SuperExtreme',
      reason: 'Invalid urgency value.',
    }).valid,
    false
  );
  assert.equal(
    validateGeminiTriageOutput({
      category: 'Road & Sidewalk',
      urgency: 'Medium',
      reason: '   ',
    }).valid,
    false
  );
  assert.equal(validateGeminiTriageOutput(null).valid, false);
});

test('buildPendingReviewTriage returns Pending review fallback structure', () => {
  const fallback = buildPendingReviewTriage();
  assert.equal(fallback.triageStatus, 'pending_review');
  assert.equal(fallback.recommendedCategory, PENDING_REVIEW_LABEL);
  assert.equal(fallback.recommendedDepartment, PENDING_REVIEW_LABEL);
  assert.equal(fallback.urgency, PENDING_REVIEW_LABEL);
});

test('validateReportInput enforces required fields and optional image data URL pattern', () => {
  const invalid = validateReportInput({
    title: 'Hi',
    description: 'short',
    location: '1',
    selectedCategory: 'Unknown',
    imageDataUrl: 'javascript:alert(1)',
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.title);
  assert.ok(invalid.errors.description);
  assert.ok(invalid.errors.location);
  assert.ok(invalid.errors.selectedCategory);
  assert.ok(invalid.errors.imageDataUrl);

  const valid = validateReportInput({
    title: 'Deep pothole outside Oak Elementary',
    description: 'Two-foot wide pothole in the northbound bicycle lane causing cyclists to swerve.',
    location: '420 Oak Avenue near 4th St crosswalk',
    selectedCategory: 'Auto-detect',
    imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.data?.selectedCategory, 'Auto-detect');
});

test('status transition state machine enforces Reported -> In Progress -> Resolved with required note', () => {
  assert.equal(getNextAdminStatus('Reported'), 'In Progress');
  assert.equal(getNextAdminStatus('In Progress'), 'Resolved');
  assert.equal(getNextAdminStatus('Resolved'), null);

  // Reported -> In Progress OK
  assert.equal(validateStatusTransition('Reported', 'In Progress').valid, true);

  // State shortcutting blocked
  assert.equal(
    validateStatusTransition('Reported', 'Resolved', 'Trying to skip directly to resolved.').valid,
    false
  );

  // Resolve without resolution note blocked
  assert.equal(validateStatusTransition('In Progress', 'Resolved', '').valid, false);
  assert.equal(validateStatusTransition('In Progress', 'Resolved', 'Done').valid, false);

  // Resolve with valid note OK
  const resolved = validateStatusTransition(
    'In Progress',
    'Resolved',
    'Crew patched asphalt pothole and inspected surrounding lane markings.'
  );
  assert.equal(resolved.valid, true);

  // Terminal state mutation blocked
  assert.equal(validateStatusTransition('Resolved', 'In Progress').valid, false);
});

test('generateTicketId adheres to Firestore safe ID regex and sortTicketsNewestFirst orders desc', () => {
  const id = generateTicketId(new Date('2026-11-21T00:00:00Z'));
  assert.match(id, /^CR-2026-[A-Z0-9]{6}$/);
  assert.match(id, LIMITS.TICKET_ID_REGEX);

  const sorted = sortTicketsNewestFirst([
    { id: 'a', createdAtMs: 100 },
    { id: 'b', createdAtMs: 300 },
    { id: 'c', createdAtMs: 200 },
  ]);
  assert.deepEqual(
    sorted.map((x) => x.id),
    ['b', 'c', 'a']
  );
});

test('extractInlineImageParts parses safe base64 image data URLs and rejects unsafe schemes', () => {
  const parsed = extractInlineImageParts('data:image/png;base64,iVBORw0KGgo=');
  assert.deepEqual(parsed, { mimeType: 'image/png', data: 'iVBORw0KGgo=' });
  assert.equal(extractInlineImageParts('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(extractInlineImageParts('https://example.com/photo.jpg'), null);
});
