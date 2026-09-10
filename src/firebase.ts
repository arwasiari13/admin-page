import { FirebaseApp, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * ⚠️ ضع هنا إعدادات مشروع Firebase الخاص بك.
 * Firebase Console → Project settings → Your apps → Web app → Config
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDnHp0Gy2e60deAjOOtZF1NRWhz_AAN304',
  authDomain: 'time-up-12d2a.firebaseapp.com',
  projectId: 'time-up-12d2a',
  storageBucket: 'time-up-12d2a.firebasestorage.app',
  messagingSenderId: '764058533164',
  appId: '1:764058533164:web:909a7146022e57086ac089',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * نسخة ثانية من التطبيق تُستخدم فقط لإنشاء المستخدمين.
 * بدونها، إنشاء مستخدم جديد يسجّل دخول المشرف كـ"المستخدم الجديد" ويخرجه من حسابه.
 */
let workerApp: FirebaseApp | null = null;
export const getWorkerAuth = () => {
  if (!workerApp) {
    workerApp = initializeApp(firebaseConfig, 'user-creator');
  }
  return getAuth(workerApp);
};

/** اسم المستخدم يُحوَّل إلى بريد وهمي لأن Firebase Auth يتطلب بريداً */
export const USERNAME_DOMAIN = 'timeup.app';
export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
