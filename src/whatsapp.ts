/**
 * إرسال بيانات الدخول عبر واتساب.
 *
 * ملاحظة: المتصفح لا يستطيع إرسال رسالة واتساب تلقائياً — هذا يتطلب
 * WhatsApp Business API (اشتراك مدفوع وموافقة من Meta).
 * ما نفعله هنا: فتح واتساب برسالة جاهزة، والمشرف يضغط "إرسال".
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

interface CredentialsMessage {
  fullName: string;
  username: string;
  code: string;
}

/** نص الرسالة بالعربية */
export const buildCredentialsMessage = ({
  fullName,
  username,
  code,
}: CredentialsMessage): string =>
  [
    `مرحباً ${fullName}،`,
    '',
    'تم إنشاء حسابك في تطبيق TIME UP ⏰',
    '',
    `👤 اسم المستخدم: ${username}`,
    `🔑 رمز الدخول: ${code}`,
    '',
    'استعمل هذه البيانات لتسجيل الدخول إلى التطبيق.',
    'يرجى الاحتفاظ بها وعدم مشاركتها مع أي شخص.',
  ].join('\n');

/** رابط واتساب مع الرسالة الجاهزة */
export const whatsappLink = (phone: string, message: string): string | null => {
  const number = toInternational(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};
