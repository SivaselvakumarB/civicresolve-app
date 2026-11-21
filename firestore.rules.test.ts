import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Security rules structural & Dirty Dozen invariant verification suite.
 * Verifies the hardened Firestore rules file covers all 8 Pillars and all 12
 * adversarial scenarios defined in security_spec.md.
 */
const rulesPath = fs.existsSync(path.resolve('firestore.rules'))
  ? path.resolve('firestore.rules')
  : path.resolve('DRAFT_firestore.rules');

const rulesSource = fs.readFileSync(rulesPath, 'utf8');

test('rules use rules_version 2 and start with default-deny catch-all', () => {
  assert.match(rulesSource, /rules_version\s*=\s*'2';/);
  assert.match(rulesSource, /match\s+\/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;\s*\}/);
});

test('admins/{uid} allowlist is strictly console-managed with self-only get', () => {
  assert.match(
    rulesSource,
    /match\s+\/admins\/\{uid\}\s*\{[\s\S]*?allow get:\s*if isSignedIn\(\) && isValidId\(uid\) && request\.auth\.uid == uid;[\s\S]*?allow list:\s*if false;[\s\S]*?allow create:\s*if false;[\s\S]*?allow update:\s*if false;[\s\S]*?allow delete:\s*if false;/
  );
  assert.match(
    rulesSource,
    /function isAdmin\(\)\s*\{\s*return isVerifiedUser\(\) && exists\(\/databases\/\$\(database\)\/documents\/admins\/\$\(request\.auth\.uid\)\);\s*\}/
  );
});

test('tickets enforce owner-only citizen reads and rule-side list scoping', () => {
  assert.match(
    rulesSource,
    /allow get:\s*if isSignedIn\(\)\s*&& isValidId\(ticketId\)\s*&& \(existing\(\)\.ownerId == request\.auth\.uid \|\| isAdmin\(\)\);/
  );
  assert.match(
    rulesSource,
    /allow list:\s*if isSignedIn\(\)\s*&& \(existing\(\)\.ownerId == request\.auth\.uid \|\| isAdmin\(\)\);/
  );
});

test('tickets create enforces verified email, ownerId match, Reported status, and request.time', () => {
  assert.match(rulesSource, /allow create:\s*if isVerifiedUser\(\)/);
  assert.match(rulesSource, /incoming\(\)\.ownerId == request\.auth\.uid/);
  assert.match(rulesSource, /incoming\(\)\.ownerEmail == request\.auth\.token\.email/);
  assert.match(rulesSource, /incoming\(\)\.status == 'Reported'/);
  assert.match(rulesSource, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesSource, /!\('resolutionNote' in incoming\(\)\)/);
});

test('tickets update enforces admin-only, strict linear transitions, required resolutionNote, and terminal state lock', () => {
  assert.match(rulesSource, /allow update:\s*if isVerifiedUser\(\)[\s\S]*?&& isValidTicket\(incoming\(\)\)[\s\S]*?&& isAdmin\(\)/);
  assert.match(rulesSource, /existing\(\)\.status != 'Resolved'/);
  assert.match(rulesSource, /existing\(\)\.status == 'Reported'\s*&& incoming\(\)\.status == 'In Progress'/);
  assert.match(
    rulesSource,
    /existing\(\)\.status == 'In Progress'\s*&& incoming\(\)\.status == 'Resolved'\s*&& 'resolutionNote' in incoming\(\)/
  );
  assert.match(rulesSource, /incoming\(\)\.resolutionNote\.size\(\) >= 10/);
  assert.match(rulesSource, /incoming\(\)\.resolvedAt == request\.time/);
  assert.match(rulesSource, /immutableTicketFieldsUnchanged\(\)/);
  assert.match(rulesSource, /allow delete:\s*if false;/);
});

test('Dirty Dozen anti-shadow-field and anti-poisoning guards are present', () => {
  assert.match(rulesSource, /data\.keys\(\)\.hasAll\(/);
  assert.match(rulesSource, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesSource, /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(/);
  assert.match(rulesSource, /data\.imageDataUrl\.size\(\) <= 180000/);
  assert.match(rulesSource, /request\.auth\.token\.email_verified == true/);
});
