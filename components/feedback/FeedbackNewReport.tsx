'use client';

/**
 * FeedbackNewReport (ADR-018 §3) — the New Report tab.
 *
 * Type radios, title, description, up to 3 screenshot attachments via
 * drag-and-drop, click, or paste. Auto-captures URL / user agent /
 * viewport / property modal context at submit time and persists them on
 * the report row. Success state appears for 3 seconds then transitions
 * the drawer to "Meine Berichte".
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  uploadFeedbackAttachment,
  createFeedbackReport,
  type FeedbackType,
  type UploadAttachmentResponse,
} from '@/lib/api';

const MAX_ATTACHMENTS = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

interface Props {
  onDirtyChange: (dirty: boolean) => void;
  onSubmitSuccess: () => void;
  onTransitionToMine: () => void;
  /** ADR-008 PT3 — opens with a pre-selected type (e.g. 'feature'). */
  initialType?: FeedbackType;
  /** ADR-008 PT3 — opens with a pre-filled description body. */
  initialDescription?: string;
}

interface PendingAttachment {
  file: File;
  preview: string;
  uploaded?: UploadAttachmentResponse;
  uploading?: boolean;
  error?: string;
}

function captureContext(): {
  contextUrl: string;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  propertyId: string | null;
  propertyTitle: string | null;
} {
  const ctx = {
    contextUrl: window.location.href,
    userAgent: navigator.userAgent,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    propertyId: null as string | null,
    propertyTitle: null as string | null,
  };
  // Property modal context — the modal sets data-property-id /
  // data-property-title on its outer element so we can scrape it without
  // plumbing a context provider just for this. If no modal is open,
  // we fall back to nulls and the description text remains the source
  // of truth (per ADR §12 risks).
  const modal = document.querySelector('[data-property-modal-open]');
  if (modal) {
    ctx.propertyId = modal.getAttribute('data-property-id');
    ctx.propertyTitle = modal.getAttribute('data-property-title');
  }
  return ctx;
}

export default function FeedbackNewReport({
  onDirtyChange,
  onSubmitSuccess,
  onTransitionToMine,
  initialType,
  initialDescription,
}: Props) {
  const t = useTranslations('feedback');

  // initialType / initialDescription are used as the seed values only —
  // not re-applied on prop change, so the user is free to clear the
  // prefill and the parent's prefill stays stable across re-renders.
  const [type, setType] = useState<FeedbackType | null>(initialType ?? null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dirty tracking — drives the discard-confirm guard in the drawer.
  useEffect(() => {
    const dirty =
      type !== null ||
      title.trim().length > 0 ||
      description.trim().length > 0 ||
      attachments.length > 0;
    onDirtyChange(dirty);
  }, [type, title, description, attachments, onDirtyChange]);

  // Clipboard paste handler — only active while this form is mounted.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && ALLOWED_TYPES.includes(item.type)) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  function addFiles(files: File[]) {
    setError(null);
    const newAttachments = [...attachments];
    for (const file of files) {
      if (newAttachments.length >= MAX_ATTACHMENTS) {
        setError(t('new.attachments.error.tooMany'));
        break;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(t('new.attachments.error.wrongType'));
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(t('new.attachments.error.tooBig'));
        continue;
      }
      const preview = URL.createObjectURL(file);
      newAttachments.push({ file, preview, uploading: true });
    }
    setAttachments(newAttachments);
    // Kick off uploads for any not-yet-uploaded entries.
    const toUpload = newAttachments.filter((a) => a.uploading && !a.uploaded);
    void uploadAll(toUpload, newAttachments);
  }

  async function uploadAll(
    toUpload: PendingAttachment[],
    snapshot: PendingAttachment[],
  ) {
    for (const att of toUpload) {
      try {
        const response = await uploadFeedbackAttachment(att.file);
        const idx = snapshot.indexOf(att);
        if (idx >= 0) {
          snapshot[idx] = { ...att, uploaded: response, uploading: false };
        }
      } catch (e) {
        const idx = snapshot.indexOf(att);
        if (idx >= 0) {
          snapshot[idx] = {
            ...att,
            uploading: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      // Snapshot React state on each upload completion.
      setAttachments([...snapshot]);
    }
  }

  function removeAttachment(att: PendingAttachment) {
    URL.revokeObjectURL(att.preview);
    setAttachments(attachments.filter((a) => a !== att));
  }

  function validate(): string | null {
    if (!type) return t('new.validation.titleRequired'); // type is implicitly required upstream
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    if (!trimmedTitle) return t('new.validation.titleRequired');
    if (trimmedTitle.length > 120) return t('new.validation.titleTooLong');
    if (!trimmedDesc) return t('new.validation.descriptionRequired');
    if (trimmedDesc.length > 4000) return t('new.validation.descriptionTooLong');
    return null;
  }

  async function handleSubmit() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (attachments.some((a) => a.uploading)) {
      setError(t('new.error.uploadFailed'));
      return;
    }
    if (attachments.some((a) => a.error)) {
      setError(t('new.error.uploadFailed'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ctx = captureContext();
      const attachmentKeys = attachments
        .filter((a) => a.uploaded)
        .map((a) => a.uploaded!.storageKey);
      await createFeedbackReport({
        type: type!,
        title: title.trim(),
        description: description.trim(),
        ...ctx,
        attachmentKeys,
      });
      setSuccess(true);
      onSubmitSuccess();
      // After 3s auto-transition to Meine Berichte tab.
      setTimeout(() => {
        onTransitionToMine();
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('new.error.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="p-6 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl mb-3">
          ✓
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-1">
          {t('new.success.title')}
        </h3>
        <p className="text-sm text-slate-600 mb-4">{t('new.success.body')}</p>
        <button
          type="button"
          onClick={onTransitionToMine}
          className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
        >
          {t('new.success.close')}
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* Type radios */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          {t('new.type.label')} *
        </label>
        <div className="flex gap-2 flex-wrap">
          {(['bug', 'feature', 'improvement'] as FeedbackType[]).map((opt) => {
            const active = type === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setType(opt)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {t(`new.type.${opt}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          {t('new.title.label')} *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder={t('new.title.placeholder')}
          className="w-full text-sm px-3 py-2 rounded border border-slate-300 focus:outline-none focus:border-teal-500"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          {t('new.description.label')} *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder={t('new.description.placeholder')}
          className="w-full text-sm px-3 py-2 rounded border border-slate-300 focus:outline-none focus:border-teal-500 resize-y"
        />
        <p className="text-[10px] text-slate-400 mt-1">
          {description.length}/4000
        </p>
      </div>

      {/* Attachments */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          {t('new.attachments.label')}
        </label>
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="relative w-16 h-16 rounded border border-slate-200 overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.preview}
                  alt=""
                  className="w-full h-full object-cover"
                />
                {att.uploading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-[10px] text-slate-500">
                    …
                  </div>
                )}
                {att.error && (
                  <div className="absolute inset-0 bg-red-100/70 flex items-center justify-center text-[10px] text-red-700 px-1 text-center">
                    !
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(att)}
                  aria-label="remove"
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 hover:bg-black/80 text-white text-[10px] leading-none flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {attachments.length < MAX_ATTACHMENTS && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files);
              addFiles(files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer text-xs ${
              dragOver
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-slate-300 text-slate-500 hover:border-slate-400'
            }`}
          >
            {t('new.attachments.dropZone')}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            addFiles(files);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="text-sm px-4 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? '…' : t('new.submit')}
        </button>
      </div>
    </div>
  );
}
