import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

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

/** تحويل الاسم إلى قاعدة صالحة لاسم مستخدم */
const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 14);

export const usernameExists = async (username: string): Promise<boolean> => {
  const snapshot = await getDocs(
    query(collection(db, 'users'), where('username', '==', username.trim().toLowerCase()))
  );
  return !snapshot.empty;
};

/** قواعد اسم المستخدم: حروف إنجليزية صغيرة وأرقام و . _ فقط، من 3 إلى 20 خانة */
export const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;

export const validateUsername = (username: string): string | null => {
  const value = username.trim().toLowerCase();
  if (!value) return 'Username is required.';
  if (value.length < 3) return 'Username must be at least 3 characters.';
  if (value.length > 20) return 'Username must be at most 20 characters.';
  if (!USERNAME_PATTERN.test(value))
    return 'Only lowercase letters, numbers, dot and underscore are allowed.';
  return null;
};

/** اقتراح اسم مستخدم من الاسم واللقب — للزر "Suggest" */
export const suggestUsername = async (firstName: string, lastName: string): Promise<string> => {
  const base = slugify(`${firstName}${lastName}`) || 'user';

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}${Math.floor(100 + Math.random() * 900)}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await usernameExists(candidate))) return candidate;
  }

  return `${base}${Date.now().toString().slice(-6)}`;
};
