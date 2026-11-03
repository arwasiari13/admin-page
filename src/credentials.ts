/**
 * توليد الرمز.
 * نتجنّب الحروف/الأرقام المتشابهة (0/O، 1/I/l) حتى لا يخطئ المستخدم عند الإدخال.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const generateCode = (length = 8): string => {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
};

/**
 * مدد الاشتراك المتاحة عند توليد كود أو التجديد.
 * المدة = أشهر + أيام (الأسبوع = 0 شهر + 7 أيام).
 */
export interface Duration {
  key: string;
  months: number;
  days: number;
}

export const DURATIONS: Duration[] = [
  { key: '1w', months: 0, days: 7 },
  { key: '1m', months: 1, days: 0 },
  { key: '2m', months: 2, days: 0 },
  { key: '3m', months: 3, days: 0 },
  { key: '6m', months: 6, days: 0 },
  { key: '12m', months: 12, days: 0 },
];

export const findDuration = (key: string): Duration =>
  DURATIONS.find((d) => d.key === key) || DURATIONS[1];

export const durationLabel = (months = 0, days = 0): string => {
  const parts: string[] = [];
  if (months === 12) parts.push('1 year');
  else if (months === 1) parts.push('1 month');
  else if (months > 0) parts.push(`${months} months`);
  if (days === 7) parts.push('1 week');
  else if (days === 1) parts.push('1 day');
  else if (days > 0) parts.push(`${days} days`);
  return parts.join(' + ') || '—';
};

/** إضافة أشهر لتاريخ — 31 جانفي + شهر = آخر يوم من فيفري */
export const addMonths = (from: Date, months: number): Date => {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
};

/** تاريخ النهاية = البداية + أشهر + أيام */
export const addDuration = (from: Date, months = 0, days = 0): Date => {
  const d = addMonths(from, months);
  d.setDate(d.getDate() + days);
  return d;
};

/** رقم التواصل لتجديد الاشتراك (يظهر للمستخدم في التطبيقات) */
export const SUPPORT_PHONE = '0675423237';
