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
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { Fragment, useEffect, useState } from 'react';
import { addMonths, DURATIONS, durationLabel, generateCode } from './credentials';
import { auth, db, getWorkerAuth } from './firebase';
import { buildCodeMessage, whatsappLink } from './whatsapp';

interface AppUser {
  id: string;
  username: string;
  password?: string;
  code?: string;
  durationMonths?: number;
  expiresAt?: Timestamp | null;
  active: boolean;
  createdAt?: any;
  // حقول الحسابات القديمة (المُنشأة يدوياً من اللوحة)
  firstName?: string;
  lastName?: string;
  fullName?: string;
  age?: string;
  address?: string;
  wilaya?: string;
  nin?: string;
  phone?: string;
}

interface AccessCode {
  id: string;
  durationMonths: number;
  note?: string;
  used: boolean;
  usedBy?: string;
  usedByUsername?: string;
  usedAt?: any;
  createdAt?: any;
  createdBy?: string;
}

const DAY = 24 * 60 * 60 * 1000;

const formatDate = (ts: any) => (ts?.toDate ? ts.toDate().toLocaleDateString() : '—');

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

/** زر واتساب: رابط حقيقي <a> لأن متصفحات الهاتف تحجب window.open */
function WhatsAppButton({ code, months, label = 'WhatsApp' }: { code: string; months: number; label?: string }) {
  return (
    <a
      className="btn whatsapp"
      href={whatsappLink(buildCodeMessage(code, durationLabel(months)))}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  );
}

const copy = (text: string) => navigator.clipboard.writeText(text);

function AdminPanel() {
  return (
    <div className="page">
      <header>
        <h1>Time Up — Admin</h1>
        <button onClick={() => signOut(auth)}>Sign out</button>
      </header>

      <CodesCard />
      <UsersCard />
      <FeedbackCard />
      <AdminsCard />
    </div>
  );
}

/**
 * الأكواد: المشرف يولّد كوداً بمدة معيّنة ويرسله للمستخدم.
 * المستخدم يدخله في التطبيق (لدي كود) ثم ينشئ اسم المستخدم وكلمة المرور،
 * فيصبح حسابه صالحاً للمدة المختارة. الكود يُستعمل مرة واحدة فقط.
 */
function CodesCard() {
  const me = auth.currentUser;
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loadError, setLoadError] = useState('');
  const [months, setMonths] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justCreated, setJustCreated] = useState<{ code: string; months: number } | null>(null);
  const [show, setShow] = useState<'unused' | 'used' | 'all'>('unused');

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'codes'), orderBy('createdAt', 'desc')),
        (snap) => {
          setLoadError('');
          setCodes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        },
        (err) => setLoadError(err.code === 'permission-denied' ? RULES_MSG : err.message)
      ),
    []
  );

  const generate = async () => {
    setError('');
    setJustCreated(null);
    setBusy(true);
    try {
      // احتمال التكرار شبه معدوم، لكن نتأكد
      let code = generateCode();
      for (let i = 0; i < 5 && (await getDoc(doc(db, 'codes', code))).exists(); i += 1) {
        code = generateCode();
      }
      await setDoc(doc(db, 'codes', code), {
        durationMonths: months,
        note: note.trim(),
        used: false,
        createdAt: serverTimestamp(),
        createdBy: me?.email || me?.uid || '',
      });
      setJustCreated({ code, months });
      setNote('');
    } catch (err: any) {
      setError(err?.code === 'permission-denied' ? RULES_MSG : err?.message || 'Could not generate.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: AccessCode) => {
    const msg = c.used
      ? `Delete code ${c.id}?\n\nIt was already used by ${c.usedByUsername || 'a user'} — their account is not affected.`
      : `Delete code ${c.id}?\n\nNobody will be able to use it.`;
    if (!confirm(msg)) return;
    try {
      await deleteDoc(doc(db, 'codes', c.id));
    } catch (err: any) {
      alert(err?.code === 'permission-denied' ? RULES_MSG : err?.message || 'Could not delete.');
    }
  };

  const unusedCount = codes.filter((c) => !c.used).length;
  const visible = codes.filter((c) => (show === 'all' ? true : show === 'used' ? c.used : !c.used));

  return (
    <div className="card">
      <h2>Generate a code</h2>
      <p className="muted">
        Choose how long the subscription lasts, then send the code to the user. In the app they tap
        “I have a code”, enter it, and create their own username and password. Each code works once.
      </p>

      <div className="row" style={{ marginTop: 4 }}>
        <div>
          <label>Duration</label>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {durationLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="grow">
          <label>Note (optional — who it is for)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ahmed — gym Cité Boussouf" />
        </div>
        <button type="button" className="primary" onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate code'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {justCreated && (
        <div className="created">
          <b>Code created</b> ({durationLabel(justCreated.months)}). Send it to the user:
          <div className="creds">
            <code style={{ fontSize: 20, letterSpacing: 3 }}>{justCreated.code}</code>
            <button onClick={() => copy(justCreated.code)}>Copy</button>
            <WhatsAppButton code={justCreated.code} months={justCreated.months} label="Send on WhatsApp" />
          </div>
        </div>
      )}

      <div className="row between" style={{ marginTop: 22 }}>
        <h2>
          Codes ({codes.length} · {unusedCount} unused)
        </h2>
        <select style={{ width: 'auto' }} value={show} onChange={(e) => setShow(e.target.value as any)}>
          <option value="unused">Unused</option>
          <option value="used">Used</option>
          <option value="all">All</option>
        </select>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      {visible.length === 0 ? (
        <p className="muted">No codes here.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Duration</th>
              <th>Note</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className={c.used ? 'inactive' : ''}>
                <td>
                  <code>{c.id}</code>
                </td>
                <td>{durationLabel(c.durationMonths)}</td>
                <td>{c.note || '—'}</td>
                <td>
                  {c.used ? (
                    <span className="pill off">Used by {c.usedByUsername || '?'}</span>
                  ) : (
                    <span className="pill on">Unused</span>
                  )}
                </td>
                <td>{formatDate(c.createdAt)}</td>
                <td className="actions">
                  {!c.used && (
                    <>
                      <WhatsAppButton code={c.id} months={c.durationMonths} />
                      <button onClick={() => copy(c.id)}>Copy</button>
                    </>
                  )}
                  <button className="danger" onClick={() => remove(c)}>
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

/** حالة اشتراك المستخدم */
const subscriptionState = (u: AppUser): { label: string; on: boolean; daysLeft: number | null } => {
  if (u.active === false) return { label: 'Disabled', on: false, daysLeft: null };
  const expires = u.expiresAt?.toDate?.();
  if (!expires) return { label: 'Active · no end date', on: true, daysLeft: null };
  const daysLeft = Math.ceil((expires.getTime() - Date.now()) / DAY);
  if (daysLeft <= 0) return { label: 'Expired', on: false, daysLeft };
  return { label: `Active · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, on: true, daysLeft };
};

function UsersCard() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  // مدة التجديد المختارة لكل مستخدم
  const [renewMonths, setRenewMonths] = useState<Record<string, number>>({});

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (snap) => {
        setUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }),
    []
  );

  const toggleActive = async (u: AppUser) => {
    await updateDoc(doc(db, 'users', u.id), { active: !u.active });
  };

  /** التجديد يبدأ من تاريخ الانتهاء إن لم ينتهِ بعد، وإلا من اليوم */
  const renew = async (u: AppUser) => {
    const months = renewMonths[u.id] || 1;
    const current = u.expiresAt?.toDate?.();
    const base = current && current.getTime() > Date.now() ? current : new Date();
    const next = addMonths(base, months);
    if (
      !confirm(
        `Renew ${u.username} for ${durationLabel(months)}?\n\nNew end date: ${next.toLocaleDateString()}`
      )
    )
      return;
    await updateDoc(doc(db, 'users', u.id), {
      expiresAt: Timestamp.fromDate(next),
      active: true,
    });
  };

  const removeUser = async (u: AppUser) => {
    if (!confirm(`Delete ${u.username}?\n\nThis removes their record and data.`)) return;
    await deleteDoc(doc(db, 'users', u.id));
    alert(
      'Record deleted.\n\nNote: the login account itself must be removed in Firebase Console → Authentication (until then the username stays taken).'
    );
  };

  const displayName = (u: AppUser) =>
    u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '';

  const visible = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username?.toLowerCase().includes(q) ||
      displayName(u).toLowerCase().includes(q) ||
      u.code?.toLowerCase().includes(q) ||
      u.phone?.includes(q)
    );
  });

  return (
    <div className="card">
      <div className="row between">
        <h2>Users ({users.length})</h2>
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search username, name, code…"
        />
      </div>

      {visible.length === 0 ? (
        <p className="muted">No users yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Password</th>
              <th>Ends</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => {
              const state = subscriptionState(u);
              return (
                <Fragment key={u.id}>
                  <tr className={state.on ? '' : 'inactive'}>
                    <td>
                      <button className="link" onClick={() => setExpanded(expanded === u.id ? null : u.id)}>
                        {u.username}
                      </button>
                      {displayName(u) && <div className="muted">{displayName(u)}</div>}
                    </td>
                    <td>{u.password ? <code>{u.password}</code> : '—'}</td>
                    <td>{formatDate(u.expiresAt)}</td>
                    <td>
                      <span className={state.on ? 'pill on' : 'pill off'}>{state.label}</span>
                    </td>
                    <td className="actions">
                      <select
                        style={{ width: 'auto' }}
                        value={renewMonths[u.id] || 1}
                        onChange={(e) =>
                          setRenewMonths((prev) => ({ ...prev, [u.id]: Number(e.target.value) }))
                        }
                      >
                        {DURATIONS.map((m) => (
                          <option key={m} value={m}>
                            +{durationLabel(m)}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => renew(u)}>Renew</button>
                      <button onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                      <button className="danger" onClick={() => removeUser(u)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expanded === u.id && (
                    <tr className="details">
                      <td colSpan={5}>
                        <div className="detailgrid">
                          <span>
                            <b>Code used</b> {u.code ? <code>{u.code}</code> : '—'}
                          </span>
                          <span>
                            <b>Plan</b> {u.durationMonths ? durationLabel(u.durationMonths) : '—'}
                          </span>
                          <span>
                            <b>Joined</b> {formatDate(u.createdAt)}
                          </span>
                          <span>
                            <b>Login</b> <code>{u.username}@timeup.app</code>
                          </span>
                          {u.phone && (
                            <span>
                              <b>Phone</b> {u.phone}
                            </span>
                          )}
                          {u.wilaya && (
                            <span>
                              <b>Wilaya</b> {u.wilaya}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
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
        Admins can open this panel, generate codes, manage users, and add or remove other admins. They sign in
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
