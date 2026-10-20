// Storage backend. Two implementations with the same small interface:
//   FirebaseBackend - Firebase Realtime Database + Firebase Auth (real classes)
//   DemoBackend     - localStorage + BroadcastChannel (one browser, for trying it out)
//
// Interface:
//   uid, isTeacher
//   signInAnon(), signInTeacher(email, pw), createTeacher(email, pw), signOut()
//   get(path), set(path, val), update(path, obj), remove(path)
//   listen(path, cb) -> unsubscribe
//   setPresence(path, val)    value removed automatically when the tab disconnects
//   claimJoin(code, pid, rec) -> 'ok' | 'denied'   (name + PIN check)
//   now()                     server-corrected clock in ms

import { FIREBASE_CONFIG, FIREBASE_VERSION } from './config.js';
import { randomId } from './util.js';

const params = new URLSearchParams(location.search);
export const DEMO =
  params.has('demo') || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('PASTE');

// Session info (game code, player id, PIN) lives in localStorage so a student
// who closes the tab or reloads is put straight back in. In demo mode each tab
// is its own "phone", so it uses sessionStorage instead.
export const sessionStore = DEMO ? sessionStorage : localStorage;

export async function createBackend() {
  return DEMO ? new DemoBackend() : FirebaseBackend.create();
}

// ---------------------------------------------------------------------------
class FirebaseBackend {
  static async create() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appM, authM, dbM] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-database.js`),
    ]);
    const b = new FirebaseBackend();
    b.A = authM; b.D = dbM;
    b.app = appM.initializeApp(FIREBASE_CONFIG);
    b.auth = authM.getAuth(b.app);
    b.db = dbM.getDatabase(b.app);
    b.offset = 0;
    dbM.onValue(dbM.ref(b.db, '.info/serverTimeOffset'), (s) => { b.offset = s.val() || 0; });
    // wait for the persisted sign-in (if any) to be restored
    await new Promise((res) => {
      const off = authM.onAuthStateChanged(b.auth, () => { off(); res(); });
    });
    return b;
  }
  get uid() { return this.auth.currentUser?.uid || null; }
  get isTeacher() { return !!this.auth.currentUser && !this.auth.currentUser.isAnonymous; }
  get email() { return this.auth.currentUser?.email || ''; }
  async signInAnon() {
    if (!this.auth.currentUser) await this.A.signInAnonymously(this.auth);
    return this.uid;
  }
  async signInTeacher(email, pw) {
    await this.A.signInWithEmailAndPassword(this.auth, email, pw);
    return this.uid;
  }
  async createTeacher(email, pw) {
    await this.A.createUserWithEmailAndPassword(this.auth, email, pw);
    return this.uid;
  }
  async resetPassword(email) { await this.A.sendPasswordResetEmail(this.auth, email); }
  async signOut() { await this.A.signOut(this.auth); }
  r(path) { return this.D.ref(this.db, path); }
  async get(path) { return (await this.D.get(this.r(path))).val(); }
  set(path, v) { return this.D.set(this.r(path), v); }
  update(path, obj) { return this.D.update(this.r(path), obj); }
  remove(path) { return this.D.remove(this.r(path)); }
  listen(path, cb, onErr) {
    return this.D.onValue(this.r(path), (s) => cb(s.val()), (e) => (onErr ? onErr(e) : console.warn(path, e)));
  }
  async setPresence(path, val) {
    const node = this.r(path);
    // re-register after every reconnect
    this.D.onValue(this.r('.info/connected'), async (s) => {
      if (s.val() !== true) return;
      try {
        await this.D.onDisconnect(node).remove();
        await this.D.set(node, val);
      } catch (e) { /* removed from game */ }
    });
  }
  async claimJoin(code, pid, rec) {
    // Security rules allow this write only if the name is new or the PIN matches.
    try {
      await this.set(`games/${code}/joins/${pid}`, rec);
      return 'ok';
    } catch (e) {
      if (String(e?.code || e?.message).toLowerCase().includes('permission')) return 'denied';
      throw e;
    }
  }
  now() { return Date.now() + this.offset; }
}

// ---------------------------------------------------------------------------
const DEMO_KEY = 'eegame-demo-db';

class DemoBackend {
  constructor() {
    this.listeners = new Set();
    this.chan = 'BroadcastChannel' in window ? new BroadcastChannel('eegame-demo') : null;
    if (this.chan) this.chan.onmessage = () => this.fire();
    window.addEventListener('storage', (e) => { if (e.key === DEMO_KEY) this.fire(); });
    this._uid = sessionStorage.getItem('eegame-demo-uid');
    this.presence = [];
    window.addEventListener('pagehide', () => {
      for (const p of this.presence) this.write((root) => setAt(root, p, null), true);
    });
  }
  get uid() { return this._uid; }
  get isTeacher() { return this._uid === 'demo-teacher'; }
  get email() { return 'demo@example.com'; }
  setUid(u) { this._uid = u; sessionStorage.setItem('eegame-demo-uid', u); }
  async signInAnon() { if (!this._uid || this.isTeacher) this.setUid(`anon-${randomId(8)}`); return this._uid; }
  async signInTeacher() { this.setUid('demo-teacher'); return this._uid; }
  async createTeacher() { return this.signInTeacher(); }
  async resetPassword() {}
  async signOut() { sessionStorage.removeItem('eegame-demo-uid'); this._uid = null; }
  read() { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || {}; } catch { return {}; } }
  write(fn, quiet) {
    const root = this.read();
    fn(root);
    localStorage.setItem(DEMO_KEY, JSON.stringify(root));
    if (this.chan) this.chan.postMessage(1);
    if (!quiet) queueMicrotask(() => this.fire());
  }
  async get(path) { return clone(getAt(this.read(), path)); }
  async set(path, v) { this.write((root) => setAt(root, path, clone(v))); }
  async update(path, obj) {
    this.write((root) => {
      for (const [k, v] of Object.entries(obj)) setAt(root, `${path}/${k}`, clone(v));
    });
  }
  async remove(path) { this.write((root) => setAt(root, path, null)); }
  listen(path, cb) {
    const l = { path, cb, last: undefined };
    this.listeners.add(l);
    this.deliver(l, this.read());
    return () => this.listeners.delete(l);
  }
  deliver(l, root) {
    const v = getAt(root, l.path);
    const s = JSON.stringify(v ?? null);
    if (s === l.last) return;
    l.last = s;
    l.cb(v == null ? null : JSON.parse(s));
  }
  fire() { const root = this.read(); for (const l of [...this.listeners]) this.deliver(l, root); }
  async setPresence(path, val) { this.presence.push(path); await this.set(path, val); }
  async claimJoin(code, pid, rec) {
    // Same rule as the Firebase security rules: new name, or matching PIN.
    const cur = await this.get(`games/${code}/joins/${pid}`);
    const meta = await this.get(`games/${code}/meta`);
    if (!meta) return 'denied';
    if (cur ? cur.pinHash !== rec.pinHash : meta.allowJoin !== true) return 'denied';
    await this.set(`games/${code}/joins/${pid}`, rec);
    return 'ok';
  }
  now() { return Date.now(); }
}

function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
function parts(path) { return String(path).split('/').filter(Boolean); }
function getAt(root, path) {
  let n = root;
  for (const p of parts(path)) { if (n == null || typeof n !== 'object') return null; n = n[p]; }
  return n ?? null;
}
// Mirrors Realtime Database: null deletes, empty objects disappear.
function setAt(root, path, v) {
  const ps = parts(path);
  const chain = [root];
  let n = root;
  for (const p of ps.slice(0, -1)) {
    if (n[p] == null || typeof n[p] !== 'object') n[p] = {};
    n = n[p];
    chain.push(n);
  }
  const last = ps[ps.length - 1];
  if (v == null || (typeof v === 'object' && !Object.keys(v).length)) delete n[last];
  else n[last] = prune(v);
  for (let i = chain.length - 1; i > 0; i--) {
    if (!Object.keys(chain[i]).length) delete chain[i - 1][ps[i - 1]];
  }
}
function prune(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(prune);
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    const y = prune(x);
    if (y == null || (typeof y === 'object' && !Array.isArray(y) && !Object.keys(y).length)) continue;
    o[k] = y;
  }
  return o;
}
