type DbErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

const OPTIONAL_PRICE_COLUMNS = ['unit_price', 'over_limit', 'over_limit_reason'];

export function isMissingSubitemProgressPriceColumn(error: DbErrorLike): boolean {
  if (!error) return false;

  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const referencesOptionalColumn = OPTIONAL_PRICE_COLUMNS.some((column) => message.includes(column));
  const isMissingColumn =
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache');

  return isMissingColumn && referencesOptionalColumn;
}

export function withoutSubitemProgressPriceFields(fields: Record<string, unknown>) {
  const { unit_price, over_limit, over_limit_reason, ...legacyFields } = fields;
  return legacyFields;
}
