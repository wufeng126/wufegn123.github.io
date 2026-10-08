export type ReviewStatus = 'draft' | 'reviewed' | 'voided';

export const REVIEW_STATUS = {
  DRAFT: 'draft',
  REVIEWED: 'reviewed',
  VOIDED: 'voided',
} as const;

export function normalizeReviewStatus(status?: string | null): ReviewStatus {
  switch ((status || '').trim()) {
    case REVIEW_STATUS.REVIEWED:
    case '已提交':
    case '已审核':
    case '已结算':
    case 'approved':
    case 'complete':
    case 'completed':
    case 'paid':
      return REVIEW_STATUS.REVIEWED;
    case REVIEW_STATUS.VOIDED:
    case '作废':
    case '已作废':
    case 'voided':
    case 'cancelled':
      return REVIEW_STATUS.VOIDED;
    default:
      return REVIEW_STATUS.DRAFT;
  }
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
