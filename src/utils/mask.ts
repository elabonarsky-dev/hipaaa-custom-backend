/**
 * Mask a CIN/Medicaid ID for logging — show only last 4 chars.
 */
export function maskCin(cin: string | null | undefined): string {
  if (!cin) return "[NO-CIN]";
  if (cin.length <= 4) return "****";
  return "*".repeat(cin.length - 4) + cin.slice(-4);
}
