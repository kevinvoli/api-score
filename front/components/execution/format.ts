/**
 * Formatage d'affichage uniquement. Les montants restent des chaînes décimales venues du
 * backend : on remplace le séparateur, on ne convertit jamais en nombre.
 */
export const fmtMoney = (value: string | null | undefined, currency: string): string => {
  if (value === null || value === undefined || value === '') return '—';
  return `${value.replace('.', ',')} ${currency}`;
};

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const fmtOdd = (odd: number | null | undefined): string =>
  odd === null || odd === undefined ? '—' : odd.toFixed(2).replace('.', ',');

export const fmtPct = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${value.toFixed(1).replace('.', ',')} %`;

export const shortId = (value: string | null | undefined, length = 8): string =>
  value ? (value.length > length ? `${value.slice(0, length)}…` : value) : '—';
