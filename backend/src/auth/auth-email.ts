export function normalizeAuthEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}
