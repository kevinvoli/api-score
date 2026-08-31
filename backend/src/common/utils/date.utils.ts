/** Formate une date en `YYYY-MM-DD` (fuseau local), format attendu par les
 * paramètres `from`/`to` d'apifootball. Partagé entre ApiFootballClient et
 * HistoryImportService. */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Ajoute `minutes` à une date et retourne une nouvelle instance. */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
