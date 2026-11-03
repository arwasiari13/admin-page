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

/** مدد الاشتراك المتاحة عند توليد كود (بالأشهر) */
export const DURATIONS = [1, 2, 3, 6, 12];

export const durationLabel = (months: number) =>
  months === 12 ? '1 year' : months === 1 ? '1 month' : `${months} months`;

/** إضافة أشهر لتاريخ — 31 جانفي + شهر = آخر يوم من فيفري */
export const addMonths = (from: Date, months: number): Date => {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
};

/** رقم التواصل لتجديد الاشتراك (يظهر للمستخدم في التطبيقات) */
export const SUPPORT_PHONE = '0675423237';
