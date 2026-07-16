export type ReviewStatus = 'draft' | 'reviewed' | 'voided';

export const REVIEW_STATUS = {
  DRAFT: 'draft',
  REVIEWED: 'reviewed',
  VOIDED: 'voided',
} as const;

export function normalizeReviewStatus(status?: string | null): ReviewStatus {
  if (status === REVIEW_STATUS.REVIEWED || status === REVIEW_STATUS.VOIDED) {
    return status;
  }
  return REVIEW_STATUS.DRAFT;
}

export function isReviewedStatus(status?: string | null): boolean {
  return normalizeReviewStatus(status) === REVIEW_STATUS.REVIEWED;
}

export function isVoidedStatus(status?: string | null): boolean {
  return normalizeReviewStatus(status) === REVIEW_STATUS.VOIDED;
}

export function isEffectiveSupplierPaymentStatus(status?: string | null): boolean {
  return !status || status === 'completed' || isReviewedStatus(status);
}
