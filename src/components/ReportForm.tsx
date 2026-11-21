import React, { useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import {
  CATEGORY_OPTIONS,
  CATEGORY_TO_DEPARTMENT,
  LIMITS,
  isMunicipalCategory,
  validateReportInput,
  type CivicTicket,
  type SelectedCategory,
} from '../shared/civicDomain';
import { compressImageToDataUrl, type SubmittedReportPayload } from '../lib/ticketService';

interface ReportFormProps {
  onSubmitReport: (payload: SubmittedReportPayload) => Promise<CivicTicket>;
  onNavigateToMyReports: (ticketId: string) => void;
}

export function ReportForm({ onSubmitReport, onNavigateToMyReports }: ReportFormProps) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory>('Auto-detect');
  const [description, setDescription] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<CivicTicket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImageToDataUrl(file);
      setImageDataUrl(compressed);
      setImageName(file.name);
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.imageDataUrl;
        return next;
      });
    } catch (err) {
      setImageDataUrl(undefined);
      setImageName(null);
      setImageError(err instanceof Error ? err.message : 'Unable to attach image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setImageDataUrl(undefined);
    setImageName(null);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReset = () => {
    setTitle('');
    setLocation('');
    setSelectedCategory('Auto-detect');
    setDescription('');
    handleRemoveImage();
    setFieldErrors({});
    setSubmitError(null);
    setCreatedTicket(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const validation = validateReportInput({
      title,
      description,
      location,
      selectedCategory,
      imageDataUrl,
    });

    if (!validation.ok || !validation.data) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const saved = await onSubmitReport(validation.data);
      setCreatedTicket(saved);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to save your report. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (createdTicket) {
    const isPendingTriage = createdTicket.triageStatus === 'pending_review';
    return (
      <section
        aria-labelledby="ticket-confirmation-heading"
        className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
      >
        <div className="flex items-start gap-3 pb-5 border-b border-slate-200">
          <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-xs font-mono text-slate-500 tabular-nums">
              Ticket {createdTicket.id} · Status: {createdTicket.status}
            </p>
            <h2
              id="ticket-confirmation-heading"
              className="text-xl font-semibold text-slate-900"
            >
              Report submitted and logged
            </h2>
            <p className="text-sm text-slate-600">
              Your ticket is saved with status <strong className="font-semibold text-slate-900">Reported</strong> and is visible in My Reports.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Issue Title</p>
            <p className="text-sm font-medium text-slate-900">{createdTicket.title}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Location</p>
            <p className="text-sm font-medium text-slate-900">{createdTicket.location}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Citizen Selection</p>
            <p className="text-sm text-slate-800">{createdTicket.selectedCategory}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Current Status</p>
            <p className="text-sm font-semibold text-blue-700">{createdTicket.status}</p>
          </div>
        </div>

        <div
          className={`rounded-lg border p-5 space-y-3 ${
            isPendingTriage
              ? 'bg-amber-50/60 border-amber-200'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {isPendingTriage
                ? 'Triage Status: Pending review'
                : 'AI Triage Recommendation (Advisory)'}
            </h3>
            <span className="text-xs font-mono text-slate-500">
              {isPendingTriage ? 'Manual triage queue' : `Model: ${createdTicket.triageModel}`}
            </span>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div>
              <dt className="text-xs text-slate-500">Recommended Category</dt>
              <dd className="text-sm font-medium text-slate-900 mt-0.5">
                {createdTicket.recommendedCategory}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Recommended Department</dt>
              <dd className="text-sm font-medium text-slate-900 mt-0.5">
                {createdTicket.recommendedDepartment}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Recommended Urgency</dt>
              <dd
                className={`text-sm font-semibold mt-0.5 ${
                  createdTicket.urgency === 'Critical' || createdTicket.urgency === 'High'
                    ? 'text-red-700'
                    : createdTicket.urgency === 'Medium'
                      ? 'text-amber-700'
                      : 'text-slate-700'
                }`}
              >
                {createdTicket.urgency}
              </dd>
            </div>
          </dl>

          <p className="text-sm text-slate-700 leading-relaxed pt-2 border-t border-slate-200/80">
            {createdTicket.triageReason}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => onNavigateToMyReports(createdTicket.id)}
            className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            View in My Reports
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Submit Another Report
          </button>
        </div>
      </section>
    );
  }

  const mappedDeptHint = isMunicipalCategory(selectedCategory)
    ? CATEGORY_TO_DEPARTMENT[selectedCategory]
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="border-b border-slate-200 pb-5 mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Submit a Civic Issue Report</h1>
          <p className="text-sm text-slate-600 mt-1">
            Provide clear location and issue details. Our server calls live Gemini triage once upon
            submission to recommend a department and urgency level.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {submitError && (
            <div
              role="alert"
              className="p-3.5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg"
            >
              {submitError}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="report-title" className="text-sm font-medium text-slate-900">
                Issue Title
              </label>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {title.trim().length}/{LIMITS.TITLE_MAX}
              </span>
            </div>
            <input
              id="report-title"
              name="title"
              type="text"
              required
              maxLength={LIMITS.TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Flickering crosswalk streetlight at 5th & Pine"
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'report-title-error' : undefined}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
            />
            {fieldErrors.title && (
              <p id="report-title-error" className="text-xs text-red-700">
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="report-location" className="text-sm font-medium text-slate-900">
                Location or Intersection
              </label>
              <input
                id="report-location"
                name="location"
                type="text"
                required
                maxLength={LIMITS.LOCATION_MAX}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., 420 Oak Ave near crosswalk"
                aria-invalid={Boolean(fieldErrors.location)}
                aria-describedby={fieldErrors.location ? 'report-location-error' : undefined}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
              />
              {fieldErrors.location && (
                <p id="report-location-error" className="text-xs text-red-700">
                  {fieldErrors.location}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="report-category" className="text-sm font-medium text-slate-900">
                Category
              </label>
              <select
                id="report-category"
                name="selectedCategory"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as SelectedCategory)}
                aria-invalid={Boolean(fieldErrors.selectedCategory)}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'Auto-detect' ? 'Auto-detect (Recommended via Gemini)' : option}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                {mappedDeptHint
                  ? `Fixed department map: ${mappedDeptHint}`
                  : 'Gemini will classify and map your report to a fixed municipal department.'}
              </p>
              {fieldErrors.selectedCategory && (
                <p className="text-xs text-red-700">{fieldErrors.selectedCategory}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="report-description" className="text-sm font-medium text-slate-900">
                Description
              </label>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {description.trim().length}/{LIMITS.DESCRIPTION_MAX}
              </span>
            </div>
            <textarea
              id="report-description"
              name="description"
              required
              rows={5}
              maxLength={LIMITS.DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened, safety impact, and any visible damage or pole/drain identifiers..."
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? 'report-description-error' : undefined}
              className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700 leading-relaxed"
            />
            {fieldErrors.description && (
              <p id="report-description-error" className="text-xs text-red-700">
                {fieldErrors.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="report-image" className="block text-sm font-medium text-slate-900">
              Photo Evidence <span className="font-normal text-slate-500">(Optional)</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                id="report-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <ImagePlus className="w-4 h-4 text-slate-500" aria-hidden="true" />
                {imageDataUrl ? 'Replace Photo' : 'Attach Photo'}
              </button>
              <span className="text-xs text-slate-500">
                JPEG, PNG, or WebP · Automatically resized for ticket attachment &amp; AI inspection
              </span>
            </div>

            {(imageError || fieldErrors.imageDataUrl) && (
              <p className="text-xs text-red-700">{imageError || fieldErrors.imageDataUrl}</p>
            )}

            {imageDataUrl && (
              <div className="mt-3 flex items-start gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <img
                  src={imageDataUrl}
                  alt="Attached civic issue preview"
                  referrerPolicy="no-referrer"
                  className="w-24 h-20 object-cover rounded border border-slate-200 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {imageName || 'Attached photo'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Compressed for ticket storage and included in server-side Gemini triage.
                  </p>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-800 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Remove photo
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              Saved immediately with status <strong className="text-slate-700">Reported</strong>.
              Triage falls back to <strong className="text-slate-700">Pending review</strong> if
              Gemini is unavailable.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>{submitting ? 'Running Triage & Saving…' : 'Submit Report'}</span>
            </button>
          </div>
        </form>
      </section>

      <aside className="lg:col-span-4 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">How Ticket Triage Works</h2>
          <ol className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <li>
              <span className="font-mono text-xs text-slate-500 mr-2">01.</span>
              Your report is validated and sent once to the server triage route.
            </li>
            <li>
              <span className="font-mono text-xs text-slate-500 mr-2">02.</span>
              Live Gemini returns a category, urgency, and concise reason. The server strictly
              validates all three fields.
            </li>
            <li>
              <span className="font-mono text-xs text-slate-500 mr-2">03.</span>
              The validated category maps to a fixed municipal department displayed as an advisory
              recommendation.
            </li>
            <li>
              <span className="font-mono text-xs text-slate-500 mr-2">04.</span>
              If Gemini cannot be reached, your ticket still saves with status{' '}
              <strong className="text-slate-900">Reported</strong> and{' '}
              <strong className="text-slate-900">Pending review</strong> for triage.
            </li>
          </ol>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Privacy &amp; Access</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Your reports are visible only to your signed-in account and allowlisted municipal triage
            administrators. Track every update and resolution note in My Reports.
          </p>
        </div>
      </aside>
    </div>
  );
}
