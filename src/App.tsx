import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Fragment, useEffect, useState } from 'react';
import {
  generateCode,
  suggestUsername,
  usernameExists,
  validateUsername,
} from './credentials';
import { auth, db, getWorkerAuth, usernameToEmail } from './firebase';
import { WILAYAS } from './wilayas';
import { buildCredentialsMessage, whatsappLink } from './whatsapp';

interface AppUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  age: string;
  address: string;
  wilaya: string;
  nin: string;
  phone: string;
  code: string;
  active: boolean;
  createdAt?: any;
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  age: '',
  address: '',
  wilaya: '',
  nin: '',
  phone: '',
  username: '',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (next) => {
        setUser(next);
        if (next) {
          const adminDoc = await getDoc(doc(db, 'admins', next.uid));
          setIsAdmin(adminDoc.exists());
        } else {
          setIsAdmin(null);
        }
        setChecking(false);
      }),
    []
  );

  if (checking) return <div className="center muted">Loading…</div>;
  if (!user) return <LoginScreen />;
  if (isAdmin === false) return <NotAdmin email={user.email} />;
  return <AdminPanel />;
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      setError(err?.code === 'auth/invalid-credential' ? 'Wrong email or password.' : err.message);
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <h1>Time Up — Admin</h1>
        <p className="muted">Sign in with your admin account.</p>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function NotAdmin({ email }: { email: string | null }) {
  return (
    <div className="center">
      <div className="card narrow">
        <h1>Not an admin</h1>
        <p className="muted">
          <b>{email}</b> is signed in, but is not an admin. Ask an existing admin to add you
          from the <b>Admins</b> section of this panel.
        </p>
        <button onClick={() => signOut(auth)}>Sign out</button>
      </div>
    </div>
  );
}

function AdminPanel() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justCreated, setJustCreated] = useState<
    { username: string; code: string; fullName: string; phone: string } | null
  >(null);
  const [suggesting, setSuggesting] = useState(false);
  // رقم يُدخل يدوياً لو لم يُحفظ رقم للمستخدم
  const [manualPhone, setManualPhone] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (snap) => {
        setUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }),
    []
  );

  const set = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const suggest = async () => {
    if (!form.firstName.trim() && !form.lastName.trim()) {
      setError('Enter the first and last name first.');
      return;
    }
    setError('');
    setSuggesting(true);
    try {
      const suggestion = await suggestUsername(form.firstName, form.lastName);
      set('username', suggestion);
    } catch (err: any) {
      // أغلب الأخطاء هنا سببها قواعد الأمان غير المنشورة
      setError(
        err?.code === 'permission-denied'
          ? 'Cannot check usernames: publish the Firestore security rules first.'
          : err?.message || 'Could not suggest a username.'
      );
    } finally {
      setSuggesting(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setJustCreated(null);

    // التحقق من الحقول المطلوبة
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    const usernameError = validateUsername(form.username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    setBusy(true);
    const username = form.username.trim().toLowerCase();

    try {
      if (await usernameExists(username)) {
        setError(`Username "${username}" is already taken.`);
        setBusy(false);
        return;
      }

      const code = generateCode();

      // نسخة ثانية من Firebase حتى لا يخرج المشرف من حسابه
      const workerAuth = getWorkerAuth();
      const created = await createUserWithEmailAndPassword(
        workerAuth,
        usernameToEmail(username),
        code
      );
      const uid = created.user.uid;
      await signOut(workerAuth);

      await setDoc(doc(db, 'users', uid), {
        username,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
        age: form.age.trim(),
        address: form.address.trim(),
        wilaya: form.wilaya,
        nin: form.nin.trim(),
        phone: form.phone.trim(),
        code, // محفوظ ليتمكن المشرف من إرساله مجدداً
        active: true,
        role: 'user',
        createdAt: serverTimestamp(),
      });

      setJustCreated({
        username,
        code,
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
        phone: form.phone.trim(),
      });
      setForm({ ...EMPTY_FORM });
      setManualPhone('');
    } catch (err: any) {
      setError(
        err?.code === 'auth/email-already-in-use'
          ? `Username "${username}" already has a login account.`
          : err?.message || 'Could not create the user.'
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u: AppUser) => {
    await updateDoc(doc(db, 'users', u.id), { active: !u.active });
  };

  const regenerateCode = async (u: AppUser) => {
    alert(
      `The access code can only be changed from Firebase Console → Authentication → ${u.username}@timeup.app → Reset password.\n\nThe browser SDK cannot change another account's password.`
    );
  };

  const removeUser = async (u: AppUser) => {
    if (!confirm(`Delete ${u.firstName} ${u.lastName} (${u.username})?\n\nThis removes their record and data.`))
      return;
    await deleteDoc(doc(db, 'users', u.id));
    alert(
      'Record deleted.\n\nNote: the login account itself must be removed in Firebase Console → Authentication.'
    );
  };

  const copy = (text: string) => navigator.clipboard.writeText(text);

  /**
   * زر واتساب.
   * نستعمل رابطاً حقيقياً <a> وليس window.open لأن متصفحات الهاتف
   * تحجب النوافذ المنبثقة، فلا يحدث شيء عند الضغط.
   */
  const WhatsAppButton = ({
    fullName,
    username,
    code,
    phone,
    label = 'WhatsApp',
  }: {
    fullName: string;
    username: string;
    code: string;
    phone: string;
    label?: string;
  }) => {
    const link = phone
      ? whatsappLink(phone, buildCredentialsMessage({ fullName, username, code }))
      : null;

    if (!link) {
      return (
        <button type="button" className="whatsapp" disabled title="No valid phone number">
          {label}
        </button>
      );
    }

    return (
      <a className="btn whatsapp" href={link} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  };

  const visible = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.phone?.includes(q) ||
      u.nin?.includes(q) ||
      u.wilaya?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <header>
        <h1>Time Up — Admin</h1>
        <button onClick={() => signOut(auth)}>Sign out</button>
      </header>

      <div className="card">
        <h2>Add a user</h2>
        <p className="muted">
          You choose the username. The access code is generated automatically — send both to the
          user.
        </p>

        <form onSubmit={createUser}>
          <div className="grid">
            <div>
              <label>First name *</label>
              <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </div>
            <div>
              <label>Last name *</label>
              <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </div>
            <div>
              <label>Age</label>
              <input
                value={form.age}
                onChange={(e) => set('age', e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                placeholder="32"
              />
            </div>
            <div>
              <label>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                placeholder="0555555555"
              />
            </div>
            <div>
              <label>Wilaya</label>
              <select value={form.wilaya} onChange={(e) => set('wilaya', e.target.value)}>
                <option value="">— Select —</option>
                {WILAYAS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>NIN (national ID)</label>
              <input
                value={form.nin}
                onChange={(e) => set('nin', e.target.value.replace(/[^0-9]/g, '').slice(0, 18))}
                placeholder="18 digits"
              />
            </div>
            <div className="span2">
              <label>Address</label>
              <input
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Cité ..., Constantine"
              />
            </div>
            <div className="span2">
              <label>Username *</label>
              <div className="row">
                <input
                  className="grow"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value.toLowerCase())}
                  placeholder="ahmedbenali"
                />
                <button type="button" onClick={suggest} disabled={suggesting}>
                  {suggesting ? 'Checking…' : 'Suggest'}
                </button>
              </div>
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </form>

        {justCreated && (
          <div className="created">
            <b>User created.</b> Send these to them:
            <div className="creds">
              <span>
                Username: <code>{justCreated.username}</code>
              </span>
              <span>
                Code: <code>{justCreated.code}</code>
              </span>
              <button
                onClick={() =>
                  copy(`Username: ${justCreated.username}\nCode: ${justCreated.code}`)
                }
              >
                Copy both
              </button>
              <WhatsAppButton
                fullName={justCreated.fullName}
                username={justCreated.username}
                code={justCreated.code}
                phone={justCreated.phone || manualPhone}
                label="Send on WhatsApp"
              />
            </div>

            {!justCreated.phone && (
              <div className="row" style={{ marginTop: 10 }}>
                <div className="grow">
                  <label style={{ marginTop: 0 }}>
                    No phone was saved for this user — type one to send:
                  </label>
                  <input
                    placeholder="0555555555"
                    value={manualPhone}
                    onChange={(e) =>
                      setManualPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row between">
          <h2>Users ({users.length})</h2>
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, username, phone, NIN…"
          />
        </div>

        {visible.length === 0 ? (
          <p className="muted">No users yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Code</th>
                <th>Wilaya</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <Fragment key={u.id}>
                  <tr className={u.active ? '' : 'inactive'}>
                    <td>
                      <button
                        className="link"
                        onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                      >
                        {u.firstName} {u.lastName}
                      </button>
                    </td>
                    <td>
                      <code>{u.username}</code>
                    </td>
                    <td>
                      <code>{u.code}</code>
                    </td>
                    <td>{u.wilaya || '—'}</td>
                    <td>
                      <span className={u.active ? 'pill on' : 'pill off'}>
                        {u.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="actions">
                      <WhatsAppButton
                        fullName={`${u.firstName} ${u.lastName}`}
                        username={u.username}
                        code={u.code}
                        phone={u.phone}
                      />
                      <button onClick={() => copy(`Username: ${u.username}\nCode: ${u.code}`)}>
                        Copy
                      </button>
                      <button onClick={() => toggleActive(u)}>
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                      <button className="danger" onClick={() => removeUser(u)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expanded === u.id && (
                    <tr className="details">
                      <td colSpan={6}>
                        <div className="detailgrid">
                          <span>
                            <b>Age</b> {u.age || '—'}
                          </span>
                          <span>
                            <b>Phone</b> {u.phone || '—'}
                          </span>
                          <span>
                            <b>NIN</b> {u.nin || '—'}
                          </span>
                          <span className="span2">
                            <b>Address</b> {u.address || '—'}
                          </span>
                          <span>
                            <b>Login</b> <code>{u.username}@timeup.app</code>
                          </span>
                          <span>
                            <button onClick={() => regenerateCode(u)}>Reset code…</button>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FeedbackCard />

      <AdminsCard />
    </div>
  );
}

interface FeedbackRecord {
  id: string;
  message: string;
  rating?: number | null;
  platform?: string;
  appVersion?: string;
  read?: boolean;
  createdAt?: any;
}

/** ملاحظات المستخدمين المرسلة من التطبيق (الإعدادات ← أرسل ملاحظاتك) */
function FeedbackCard() {
  const [items, setItems] = useState<FeedbackRecord[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'feedback'), orderBy('createdAt', 'desc')),
        (snap) => {
          setLoadError('');
          setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        },
        (err) => setLoadError(err.code === 'permission-denied' ? RULES_MSG : err.message)
      ),
    []
  );

  const unread = items.filter((f) => !f.read).length;

  const toggleRead = async (f: FeedbackRecord) => {
    try {
      await updateDoc(doc(db, 'feedback', f.id), { read: !f.read });
    } catch (err: any) {
      alert(err?.code === 'permission-denied' ? RULES_MSG : err?.message || 'Could not update.');
    }
  };

  const remove = async (f: FeedbackRecord) => {
    if (!confirm('Delete this feedback?')) return;
    try {
      await deleteDoc(doc(db, 'feedback', f.id));
    } catch (err: any) {
      alert(err?.code === 'permission-denied' ? RULES_MSG : err?.message || 'Could not delete.');
    }
  };

  const formatDate = (ts: any) => (ts?.toDate ? ts.toDate().toLocaleString() : '—');

  return (
    <div className="card">
      <h2>
        Feedback ({items.length}
        {unread > 0 ? ` · ${unread} new` : ''})
      </h2>
      <p className="muted">
        Anonymous messages sent from the app (Settings → Send feedback). The sender&apos;s name is
        not stored.
      </p>

      {loadError && <p className="error">{loadError}</p>}

      {items.length === 0 ? (
        <p className="muted">No feedback yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rating</th>
              <th>Message</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id} className={f.read ? 'inactive' : ''}>
                <td>{f.rating ? '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) : '—'}</td>
                <td style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{f.message}</td>
                <td>{formatDate(f.createdAt)}</td>
                <td className="actions">
                  <button onClick={() => toggleRead(f)}>{f.read ? 'Mark unread' : 'Mark read'}</button>
                  <button className="danger" onClick={() => remove(f)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface AdminRecord {
  id: string;
  email?: string;
  name?: string;
  addedBy?: string;
  createdAt?: any;
}

const RULES_MSG =
  'Permission denied: publish the latest Firestore rules (admin/firestore.rules) to manage admins and feedback.';

/**
 * المشرفون: قائمة + إضافة مشرف جديد + سحب صلاحية مشرف.
 * لا يمكن للمشرف حذف نفسه، فتبقى اللوحة دائماً بمشرف واحد على الأقل.
 */
function AdminsCard() {
  const me = auth.currentUser;
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'admins'),
        (snap) => {
          setLoadError('');
          setAdmins(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        },
        (err) => setLoadError(err.code === 'permission-denied' ? RULES_MSG : err.message)
      ),
    []
  );

  // سجل المشرف الحالي قد يكون بدون بريد (أُنشئ يدوياً من Firebase Console) — نكمله
  useEffect(() => {
    if (!me?.email) return;
    const mine = admins.find((a) => a.id === me.uid);
    if (mine && !mine.email) {
      setDoc(doc(db, 'admins', me.uid), { email: me.email }, { merge: true }).catch(() => {});
    }
  }, [admins, me]);

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreated(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('The password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    // نسخة ثانية من Firebase حتى لا يخرج المشرف الحالي من حسابه
    const workerAuth = getWorkerAuth();
    try {
      let uid = '';
      try {
        const cred = await createUserWithEmailAndPassword(workerAuth, cleanEmail, password);
        uid = cred.user.uid;
      } catch (err: any) {
        if (err?.code !== 'auth/email-already-in-use') throw err;
        // الحساب موجود مسبقاً — نرقّيه إلى مشرف إذا كانت كلمة المرور صحيحة
        try {
          const cred = await signInWithEmailAndPassword(workerAuth, cleanEmail, password);
          uid = cred.user.uid;
        } catch {
          throw new Error(
            'This email already has an account. Enter its current password to make it an admin.'
          );
        }
      }

      if (admins.some((a) => a.id === uid)) {
        setError(`${cleanEmail} is already an admin.`);
        return;
      }

      await setDoc(doc(db, 'admins', uid), {
        email: cleanEmail,
        name: name.trim(),
        addedBy: me?.email || me?.uid || '',
        createdAt: serverTimestamp(),
      });

      setCreated({ email: cleanEmail, password });
      setName('');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setError(
        err?.code === 'permission-denied'
          ? RULES_MSG
          : err?.code === 'auth/weak-password'
          ? 'The password is too weak (at least 6 characters).'
          : err?.message || 'Could not add the admin.'
      );
    } finally {
      await signOut(workerAuth).catch(() => {});
      setBusy(false);
    }
  };

  const removeAdmin = async (a: AdminRecord) => {
    if (a.id === me?.uid) return;
    if (
      !confirm(
        `Remove admin rights from ${a.name || a.email || a.id}?\n\nTheir login account stays, but they can no longer open this panel.`
      )
    )
      return;
    try {
      await deleteDoc(doc(db, 'admins', a.id));
    } catch (err: any) {
      alert(err?.code === 'permission-denied' ? RULES_MSG : err?.message || 'Could not remove.');
    }
  };

  return (
    <div className="card">
      <h2>Admins ({admins.length})</h2>
      <p className="muted">
        Admins can open this panel, create users, and add or remove other admins. They sign in
        here with their email and password.
      </p>

      {loadError && <p className="error">{loadError}</p>}

      {admins.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Added by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.name || '—'}</td>
                <td>
                  <code>{a.email || a.id}</code>
                </td>
                <td>{a.addedBy || '—'}</td>
                <td className="actions">
                  {a.id === me?.uid ? (
                    <span className="pill on">You</span>
                  ) : (
                    <button className="danger" onClick={() => removeAdmin(a)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 20 }}>Add an admin</h2>
      <form onSubmit={addAdmin}>
        <div className="grid">
          <div>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmed" />
          </div>
          <div>
            <label>Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="off"
            />
          </div>
          <div className="span2">
            <label>Password *</label>
            <div className="row">
              <input
                className="grow"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
              {/* 10 خانات للمشرفين — صلاحياتهم أكبر من المستخدمين */}
              <button type="button" onClick={() => setPassword(generateCode(10))}>
                Generate
              </button>
            </div>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add admin'}
        </button>
      </form>

      {created && (
        <div className="created">
          <b>Admin added.</b> They sign in to this panel with:
          <div className="creds">
            <span>
              Email: <code>{created.email}</code>
            </span>
            <span>
              Password: <code>{created.password}</code>
            </span>
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  `Email: ${created.email}\nPassword: ${created.password}`
                )
              }
            >
              Copy both
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
