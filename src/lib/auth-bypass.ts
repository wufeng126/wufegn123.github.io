export function isDevelopmentAuthBypassEnabled(): boolean {
  const requested = process.env.ENABLE_AUTH_BYPASS === 'true';
  if (!requested) return false;

  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProductionEnv = process.env.COZE_PROJECT_ENV === 'PROD';

  if (!isDevelopment || isProductionEnv) {
    console.warn('[Auth] ENABLE_AUTH_BYPASS is set but only allowed in NODE_ENV=development and non-PROD environments');
    return false;
  }

  return true;
}
