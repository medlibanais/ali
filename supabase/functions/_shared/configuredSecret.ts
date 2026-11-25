// The retired local default is public and must never authorize a request.
const RETIRED_DEV_SECRET = 'prayerlock-dev-cron-secret';

export function matchesConfiguredSecret(
  supplied: string | null,
  configured: string | undefined,
): boolean {
  if (
    !configured?.trim() ||
    configured === RETIRED_DEV_SECRET ||
    supplied === null ||
    supplied.length !== configured.length
  ) return false;

  let difference = 0;
  for (let i = 0; i < configured.length; i += 1) {
    difference |= supplied.charCodeAt(i) ^ configured.charCodeAt(i);
  }
  return difference === 0;
}
