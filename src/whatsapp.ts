/**
 * إرسال كود الاشتراك عبر واتساب.
 *
 * ملاحظة: المتصفح لا يستطيع إرسال رسالة واتساب تلقائياً — هذا يتطلب
 * WhatsApp Business API (اشتراك مدفوع وموافقة من Meta).
 * ما نفعله هنا: فتح واتساب برسالة جاهزة، والمشرف يختار جهة الاتصال ويضغط "إرسال".
 */

/** تحويل الرقم الجزائري المحلي إلى صيغة دولية: 0555555555 → 213555555555 */
export const toInternational = (phone: string): string | null => {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;

  // 213xxxxxxxxx — أصلاً بصيغة دولية
  if (digits.startsWith('213')) return digits;
  // 0xxxxxxxxx — نحذف الصفر ونضيف 213
  if (digits.startsWith('0')) return `213${digits.slice(1)}`;
  // xxxxxxxxx — 9 خانات بدون صفر
  if (digits.length === 9) return `213${digits}`;

  return digits;
};

/** نص الرسالة بالعربية */
export const buildCodeMessage = (code: string, durationText: string): string =>
  [
    'مرحباً،',
    '',
    `كود اشتراكك في تطبيق TIME UP ⏰ (${durationText}):`,
    '',
    `🔑 ${code}`,
    '',
    'افتح التطبيق، اختر "لدي كود"، أدخل الكود ثم أنشئ اسم المستخدم وكلمة المرور.',
    'الكود صالح لمرة واحدة فقط.',
  ].join('\n');

/** رابط واتساب مع الرسالة الجاهزة — بدون رقم يفتح واتساب لاختيار جهة الاتصال */
export const whatsappLink = (message: string, phone?: string): string => {
  const number = phone ? toInternational(phone) : null;
  return number
    ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
};
