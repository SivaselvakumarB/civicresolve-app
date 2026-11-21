import test from 'node:test';
import assert from 'node:assert/strict';
import { triageCivicReport } from './triage.ts';
import { PENDING_REVIEW_LABEL } from '../src/shared/civicDomain.ts';

const SAMPLE_REPORT = {
  title: 'Broken street lamp at 5th & Pine',
  description: 'The overhead LED streetlight has been completely dark for three evenings, leaving the crosswalk unlit.',
  location: 'Corner of 5th Ave and Pine St',
  selectedCategory: 'Auto-detect' as const,
};

test('triageCivicReport calls model once, validates output, and maps fixed department', async () => {
  let callCount = 0;
  const result = await triageCivicReport(SAMPLE_REPORT, {
    caller: async () => {
      callCount += 1;
      return JSON.stringify({
        category: 'Streetlight & Electrical',
        urgency: 'High',
        reason: 'Unlit crosswalk streetlight creates a nighttime pedestrian visibility hazard.',
      });
    },
  });

  assert.equal(callCount, 1);
  assert.equal(result.fallbackReasonCode, undefined);
  assert.equal(result.recommendation.triageStatus, 'completed');
  assert.equal(result.recommendation.recommendedCategory, 'Streetlight & Electrical');
  assert.equal(result.recommendation.recommendedDepartment, 'Public Lighting & Electrical Services');
  assert.equal(result.recommendation.urgency, 'High');
});

test('triageCivicReport falls back to Pending review when GEMINI_API_KEY is missing', async () => {
  const result = await triageCivicReport(SAMPLE_REPORT, { apiKey: '' });
  assert.equal(result.fallbackReasonCode, 'MISSING_API_KEY');
  assert.equal(result.recommendation.triageStatus, 'pending_review');
  assert.equal(result.recommendation.recommendedCategory, PENDING_REVIEW_LABEL);
  assert.equal(result.recommendation.recommendedDepartment, PENDING_REVIEW_LABEL);
  assert.equal(result.recommendation.urgency, PENDING_REVIEW_LABEL);
});

test('triageCivicReport falls back to Pending review when Gemini throws or is unavailable', async () => {
  const result = await triageCivicReport(SAMPLE_REPORT, {
    caller: async () => {
      throw new Error('503 Service Unavailable');
    },
  });

  assert.equal(result.fallbackReasonCode, 'UPSTREAM_ERROR');
  assert.equal(result.recommendation.triageStatus, 'pending_review');
  assert.equal(result.recommendation.recommendedDepartment, PENDING_REVIEW_LABEL);
});

test('triageCivicReport falls back to Pending review when Gemini returns invalid category or bad JSON', async () => {
  const badCategory = await triageCivicReport(SAMPLE_REPORT, {
    caller: async () =>
      JSON.stringify({
        category: 'Invented Department',
        urgency: 'High',
        reason: 'Invalid category test.',
      }),
  });
  assert.equal(badCategory.fallbackReasonCode, 'INVALID_MODEL_OUTPUT');
  assert.equal(badCategory.recommendation.triageStatus, 'pending_review');

  const badJson = await triageCivicReport(SAMPLE_REPORT, {
    caller: async () => 'not json at all',
  });
  assert.equal(badJson.fallbackReasonCode, 'INVALID_MODEL_OUTPUT');
  assert.equal(badJson.recommendation.triageStatus, 'pending_review');
});
