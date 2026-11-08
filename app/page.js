'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { generateDriverPdf, generateCarPdf, downloadOrSharePdf } from '../lib/pdf';

const local = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const rs = (n) => 'Rs ' + Math.round(n || 0).toLocaleString('en-US');
const days = (a, b) => { const o = []; for (let t = Date.parse(a); t <= Date.parse(b); t += 864e5) o.push(new Date(t).toISOString().slice(0, 10)); return o; };
const OIL_INTERVAL_KM = 5000;
const km = (n) => Number(n || 0).toLocaleString('en-US');

const api = async (m, p, b) => {
  const r = await fetch('/api/' + p, {
    method: m,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: b && JSON.stringify(b)
  });
  if (r.status === 401) throw new Error('auth');
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || 'Server error ' + r.status);
  }
  return r.json();
};

const CATS = ['Fuel', 'Oil change', 'Repair', 'Service', 'Tyres', 'Challan', 'Insurance', 'Token/Tax', 'Other'].map((c) => [c, c]);

function Count({ v, pre = 'Rs ' }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let f, t0; const from = n;
    const step = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / 700); setN(from + (v - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) f = requestAnimationFrame(step); };
    f = requestAnimationFrame(step);
    return () => cancelAnimationFrame(f);
  }, [v]);
  return <>{pre}{Math.round(n).toLocaleString('en-US')}</>;
}

const P = { calendar: 'M4 7h16v13H4zM4 11h16M8 3v4M16 3v4', entry: 'M12 5v14M5 12h14', reports: 'M5 20V10M12 20V4M19 20v-7', cars: 'M5 16l1.5-5a2 2 0 011.9-1.4h7.2a2 2 0 011.9 1.4L19 16M4 16h16v3H4zM7 19v1.5M17 19v1.5', drivers: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', more: 'M6 12h.01M12 12h.01M18 12h.01', oil: 'M8 3h8l1 5-5 13-5-13z', lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4', pin: 'M12 15v2M8 11V8a4 4 0 018 0v3M6 11h12v10H6z' };
const Ico = ({ k }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={P[k]} /></svg>;

function getPinStrength(p) {
  if (!p || p.length < 4) return { level: 'weak', label: 'Weak' };
  const allSame = /^(.)\1+$/.test(p);
  const common = ['123456', '654321', '12345678', 'password', 'admin123', '000000', '111111'];
  if (allSame || common.includes(p.toLowerCase())) {
    return { level: 'weak', label: 'Too weak' };
  }
  const hasLetter = /[a-zA-Z]/.test(p);
  const hasNum = /[0-9]/.test(p);
  const hasSpecial = /[^a-zA-Z0-9]/.test(p);
  if (p.length >= 8 && ((hasLetter && hasNum) || hasSpecial)) {
    return { level: 'strong', label: 'Strong' };
  }
  return { level: 'okay', label: 'Okay' };
}

function Form({ fields, init, onSave, onCancel, title }) {
  const [v, setV] = useState(init);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const save = () => onSave(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fields.find((f) => f[0] === k)?.[2] === 'number' ? Number(x) || 0 : x])));
  return (
    <div className="sheet"><div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {fields.map(([k, l, t = 'text', o]) => (
        <label key={k}>{l}
          {t === 'select' ? <select value={v[k] || ''} onChange={set(k)}><option value="">Select</option>{o.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
            : t === 'textarea' ? <textarea rows={3} value={v[k] || ''} onChange={set(k)} />
            : <input type={t} inputMode={t === 'number' ? 'decimal' : undefined} value={v[k] ?? ''} onChange={set(k)} />}
        </label>
      ))}
      <div className="row"><button className="ghost" onClick={onCancel}>Cancel</button><button onClick={save}>Save</button></div>
    </div></div>
  );
}

function RecordEditor({ record, col, d, onClose, onSaved }) {
  const expense = col === 'expenses';
  const [v, setV] = useState({ ...record });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setV((old) => ({ ...old, [key]: e.target.value }));
  const isOil = expense && v.category === 'Oil change';
  const previousOil = isOil ? d.expenses
    .filter((x) => x._id !== record._id && x.carId === v.carId && x.category === 'Oil change' && x.odometer != null && x.date <= v.date)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b._id).localeCompare(String(a._id)))[0] : null;
  const readingInvalid = isOil && previousOil && v.odometer !== '' && Number(v.odometer) < Number(previousOil.odometer);

  const save = async (e) => {
    e.preventDefault();
    if (!v.carId) return setError('Please select a car');
    if (readingInvalid) return setError('Reading cannot be lower than the previous oil change reading');
    if (isOil && (v.odometer === '' || !Number.isFinite(Number(v.odometer)))) return setError('Meter reading is required');
    setSaving(true);
    setError('');
    try {
      const body = expense
        ? { carId: v.carId, date: v.date, category: v.category || 'Other', amount: Number(v.amount) || 0, note: v.note || '', ...(isOil ? { odometer: Number(v.odometer), nextDue: Number(v.nextDue) || Number(v.odometer) + OIL_INTERVAL_KM } : {}) }
        : { carId: v.carId, driverId: v.driverId || '', date: v.date, earning: Number(v.earning) || 0, note: v.note || '' };
      await api('PUT', `${col}/${record._id}`, body);
      await onSaved();
      onClose();
    } catch {
      setError('Could not update this record. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="sheet"><div className="card"><form onSubmit={save}>
    <h3 style={{ marginTop: 0 }}>Edit {expense ? 'expense' : 'earning'}</h3>
    <label>Date<input type="date" required value={v.date || ''} onChange={set('date')} /></label>
    <label>Car<select required value={v.carId || ''} onChange={set('carId')}><option value="">Select car</option>{d.cars.map((c) => <option key={c._id} value={c._id}>{c.name} {c.number || ''}</option>)}</select></label>
    {expense
      ? <label>Category<select value={v.category || 'Other'} onChange={set('category')}>{CATS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      : <label>Driver<select value={v.driverId || ''} onChange={set('driverId')}><option value="">Select driver</option>{d.drivers.map((driver) => <option key={driver._id} value={driver._id}>{driver.name}</option>)}</select></label>}
    {isOil && <>
      {previousOil && <div className="oil-info">Previous oil change: <b>{previousOil.date}</b> at <b>{km(previousOil.odometer)} km</b></div>}
      {readingInvalid && <div className="oil-status bad">Reading cannot be lower than the previous oil change reading</div>}
      <label>Car meter reading at oil change (km)<input type="number" required inputMode="decimal" value={v.odometer ?? ''} onChange={(e) => { const value = e.target.value; setV((old) => ({ ...old, odometer: value, nextDue: value === '' ? old.nextDue : String(Number(value) + OIL_INTERVAL_KM) })); }} /></label>
      <label>Next oil change due at (km)<input type="number" inputMode="decimal" value={v.nextDue ?? ''} onChange={set('nextDue')} /></label>
    </>}
    <label>{expense ? 'Amount (Rs)' : 'Rent received (Rs)'}<input type="number" inputMode="decimal" value={expense ? v.amount ?? '' : v.earning ?? ''} onChange={set(expense ? 'amount' : 'earning')} /></label>
    <label>Note<input value={v.note || ''} onChange={set('note')} /></label>
    {error && <p className="abs">{error}</p>}
    <div className="row"><button type="button" className="ghost" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" disabled={saving || readingInvalid}>{saving ? 'Saving…' : 'Save changes'}</button></div>
  </form></div></div>;
}

function ChangePinModal({ onClose }) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');

  const strength = useMemo(() => getPinStrength(newPin), [newPin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setSuccess('');

    if (newPin !== confirmPin) {
      return setErr('New PIN and confirm PIN do not match');
    }
    if (newPin.length < 4) {
      return setErr('New PIN must be at least 4 characters');
    }
    if (newPin === oldPin) {
      return setErr('New PIN must be different from old PIN');
    }

    setLoading(true);
    try {
      const r = await fetch('/api/change-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ oldPin, newPin, confirmPin })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data.error || 'Failed to change PIN');
      }
      setSuccess('PIN changed successfully ✓');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sheet">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Change Login PIN / Password</h3>
        {success ? (
          <div className="earn" style={{ fontSize: 16, textAlign: 'center', padding: '24px 0' }}>
            {success}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              Old PIN
              <div className="pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                />
              </div>
            </label>

            <label>
              New PIN / Password (min 4 characters)
              <div className="pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                />
              </div>
              {newPin.length > 0 && (
                <>
                  <div className={`meter ${strength.level}`}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div
                    className="strength-text"
                    style={{
                      color:
                        strength.level === 'weak'
                          ? 'var(--bad)'
                          : strength.level === 'okay'
                          ? 'var(--sun)'
                          : 'var(--earn)'
                    }}
                  >
                    Strength: {strength.label}
                  </div>
                </>
              )}
            </label>

            <label>
              Confirm New PIN
              <div className="pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                />
              </div>
            </label>

            <div style={{ margin: '4px 0 14px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0, fontSize: 12 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto', margin: 0 }}
                  checked={showPw}
                  onChange={(e) => setShowPw(e.target.checked)}
                />
                Show PINs
              </label>
            </div>

            {err && <p className="abs" style={{ margin: '0 0 12px 0' }}>{err}</p>}

            <div className="row">
              <button type="button" className="ghost" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" disabled={loading}>
                {loading ? 'Saving…' : 'Save PIN'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('entry');
  const [d, setD] = useState({ cars: [], drivers: [], entries: [], expenses: [] });
  const [locked, setLocked] = useState(false);
  const [form, setForm] = useState(null);
  const [recordEditor, setRecordEditor] = useState(null);
  const [pinSheet, setPinSheet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [pre, setPre] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreView, setMoreView] = useState(null);
  const [previousTab, setPreviousTab] = useState('entry');

  // Health and PWA states
  const [healthInfo, setHealthInfo] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const pinInputRef = useRef(null);

  // Request counter to prevent stale async responses from overriding state
  const reqIdRef = useRef(0);

  useEffect(() => {
    // Register Service Worker in production
    if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // PWA beforeinstallprompt
    const installHandler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', installHandler);
    window.addEventListener('appinstalled', () => setDeferredPrompt(null));

    return () => {
      window.removeEventListener('beforeinstallprompt', installHandler);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const checkConnection = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json().catch(() => ({ ok: false }));
      setHealthInfo({ ok: res.ok && data.ok === true });
    } catch {
      setHealthInfo({ ok: false });
    } finally {
      setCheckingHealth(false);
    }
  };

  const load = async () => {
    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const [cars, drivers, entries, expenses] = await Promise.all(
        ['cars', 'drivers', 'entries', 'expenses'].map((c) => api('GET', c))
      );
      if (currentReqId === reqIdRef.current) {
        setD({ cars, drivers, entries, expenses });
        setLocked(false);
        setErr('');
      }
    } catch (e) {
      if (currentReqId === reqIdRef.current) {
        if (e.message === 'auth') {
          setLocked(true);
        } else {
          setErr('Could not load your records. Please try again.');
        }
      }
    } finally {
      if (currentReqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (locked) return;
    checkConnection();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') checkConnection(); }, 60000);
    const visible = () => { if (document.visibilityState === 'visible') checkConnection(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [locked]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErr('');
    setHealthInfo(null);
    const pinVal = pinInputRef.current ? pinInputRef.current.value : e.target.pin?.value;
    if (!pinVal) return;

    setLoggingIn(true);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ pin: pinVal })
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        // Unlock immediately on successful login
        setLocked(false);
        setErr('');
        setTab('entry');
        setMoreOpen(false);
        setMoreView(null);
        load();
        checkConnection();
      } else {
        if (r.status === 429) {
          setErr(data.error || 'Too many attempts. Locked for 15 minutes.');
        } else {
          setErr(data.error || 'Wrong PIN');
        }
        if (pinInputRef.current) {
          pinInputRef.current.value = '';
          pinInputRef.current.focus();
        }
      }
    } catch {
      setErr('No connection, try again');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLock = async () => {
    await fetch('/api/login', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' });
    setLocked(true);
    setTab('entry');
    setMoreOpen(false);
    setMoreView(null);
    setD({ cars: [], drivers: [], entries: [], expenses: [] });
  };

  const car = (id) => d.cars.find((c) => c._id === id)?.name || '—';
  const drv = (id) => d.drivers.find((c) => c._id === id)?.name || '—';
  const carOpts = d.cars.map((c) => [c._id, `${c.name} ${c.number || ''}`]);
  const drvOpts = d.drivers.map((c) => [c._id, c.name]);
  const t0 = local();
  const todayE = d.entries.filter((e) => e.date === t0).reduce((a, e) => a + e.earning, 0);
  const monNet = d.entries.filter((e) => e.date.slice(0, 7) === t0.slice(0, 7)).reduce((a, e) => a + e.earning, 0) - d.expenses.filter((e) => e.date.slice(0, 7) === t0.slice(0, 7)).reduce((a, e) => a + e.amount, 0);
  const del = async (col, id, message = 'Delete this record?') => { if (confirm(message)) { await api('DELETE', `${col}/${id}`); load(); } };
  const upsert = async (col, v) => { v._id ? await api('PUT', `${col}/${v._id}`, v) : await api('POST', col, v); setForm(null); load(); };

  if (locked) return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-visual" aria-hidden="true">
          <span className="login-orb login-orb-one" />
          <span className="login-orb login-orb-two" />
          <div className="login-brand-mark">CR</div>
          <div className="login-copy">
            <span className="login-kicker">SMART FLEET LEDGER</span>
            <h1>CarRent</h1>
            <p>Har gaari. Har hisaab.<br />Aik mehfooz jagah.</p>
          </div>
          <div className="login-road">
            <img src="/suzuki-alto-vxr-2026.svg" alt="" />
            <span />
          </div>
        </div>

        <div className="login-panel">
          <div className="login-welcome">
            <span className="login-lock"><Ico k="lock" /></span>
            <div><span>Welcome back</span><h2>Unlock your logbook</h2></div>
          </div>
          <p className="login-helper">Apna PIN ya password enter karein.</p>
          <form onSubmit={handleLogin}>
            <label className="login-label" htmlFor="login-pin">Login PIN</label>
            <div className="pw-wrap login-pin-wrap">
          <input
            id="login-pin"
            ref={pinInputRef}
            name="pin"
            type={showLoginPw ? 'text' : 'password'}
            autoFocus
            placeholder="Enter your PIN"
            autoComplete="current-password"
            disabled={loggingIn}
          />
          <button
            type="button"
            className="pin-toggle"
            onClick={() => setShowLoginPw(!showLoginPw)}
          >
            {showLoginPw ? 'Hide' : 'Show'}
          </button>
        </div>
        {err && <p className="login-error" role="alert">{err}</p>}
        <button className="login-submit" disabled={loggingIn}>
          {loggingIn ? 'Checking…' : <>Open logbook <span aria-hidden="true">→</span></>}
        </button>
      </form>

      {deferredPrompt && (
        <button className="login-install" onClick={handleInstallApp} aria-label="Install CarRent" title="Install CarRent">
          <span aria-hidden="true">↓</span> Add CarRent to home screen
        </button>
      )}
          <div className="developer-credit">
            <span>Designed &amp; developed by</span>
            <img src="/zee-technologies-logo-transparent.png" alt="Zee Technologies — Ideas into Solutions" />
          </div>
        </div>
      </section>
    </main>
  );

  const CARF = [['name', 'Car name'], ['number', 'Number plate'], ['make', 'Make'], ['model', 'Model'], ['year', 'Year', 'number'], ['color', 'Color'], ['chassis', 'Chassis no.'], ['engine', 'Engine no.'], ['purchaseDate', 'Purchase date', 'date'], ['cost', 'Car cost (Rs)', 'number'], ['startDate', 'Rent start date', 'date'], ['driverId', 'Current driver', 'select', drvOpts], ['regExpiry', 'Registration expiry', 'date'], ['insExpiry', 'Insurance expiry', 'date'], ['notes', 'Notes', 'textarea']];
  const DRVF = [['name', 'Driver name'], ['phone', 'Phone', 'tel'], ['cnic', 'CNIC'], ['license', 'License no.'], ['address', 'Address'], ['joinDate', 'Joining date', 'date'], ['dailyRent', 'Daily rent (Rs)', 'number'], ['notes', 'Notes', 'textarea']];

  return (
    <>
      <header className="hero">
        {/* Compact status toolbar */}
        <div className="hero-top-toolbar">
          {deferredPrompt && (
            <button className="hero-btn install-btn" onClick={handleInstallApp} title="Install CarRent" aria-label="Install CarRent">
              📲
            </button>
          )}
          <button
            className={`health-dot ${checkingHealth || healthInfo === null ? 'checking' : healthInfo.ok ? 'connected' : 'disconnected'}`}
            onClick={() => { if (!checkingHealth && healthInfo?.ok === false) checkConnection(); }}
            aria-label={checkingHealth || healthInfo === null ? 'Checking' : healthInfo.ok ? 'Connected' : 'Not connected'}
            title={checkingHealth || healthInfo === null ? 'Checking' : healthInfo.ok ? 'Connected' : 'Not connected'}
          />
        </div>

        {/* Branding logo */}
        <img className="hero-logo" src="/zee-technologies-logo.png" alt="Zee Technologies" />

        {/* Stats row with responsive flex-wrap & clamp sizes */}
        <div className="hrow">
          <div className="stat-block">
            <small>Aaj ki earning</small>
            <strong className="stat-num"><Count v={todayE} /></strong>
          </div>
          <div className="stat-block r">
            <small>Is mahine ka total</small>
            <b className="stat-num"><Count v={monNet} /></b>
          </div>
        </div>

        {/* Road with HTML wind lines and Pakistani Suzuki Alto SVG */}
        <div className="road">
          <div className="wind-lines" aria-hidden="true">
            <span className="wline wline-1" />
            <span className="wline wline-2" />
            <span className="wline wline-3" />
          </div>

          <img className="car" src="/suzuki-alto-vxr-2026.svg" alt="White Suzuki Alto VXR 2026 driving right" />
          <svg className="legacy-car" viewBox="0 0 140 56" aria-hidden="true">
            <defs>
              <linearGradient id="altoGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#9fd3dc" />
                <stop offset="100%" stopColor="#7fbcc8" />
              </linearGradient>
              <linearGradient id="headBeam" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fff6c9" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#fff6c9" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Soft dark shadow */}
            <ellipse cx="71" cy="48.5" rx="55" ry="3.2" fill="rgba(10,47,61,0.4)" />

            {/* Headlight beam */}
            <polygon points="123,28 142,21 142,37 123,33" fill="url(#headBeam)" />

            {/* Rear wheel arch inner */}
            <path d="M 26,41 A 10 10 0 0 1 46,41 Z" fill="#0d1b2a" />
            {/* Front wheel arch inner */}
            <path d="M 94,41 A 10 10 0 0 1 114,41 Z" fill="#0d1b2a" />

            {/* Alto Main Body (White) */}
            <path d="M 20,40.5 L 26,40.5 A 10 10 0 0 1 46,40.5 L 94,40.5 A 10 10 0 0 1 114,40.5 L 121,40.5 Q 124,40 124,37 L 124.5,33 Q 124,29.5 120,29 L 96,25 L 75,13 Q 73,11.5 69,11.5 L 29,12 Q 24,12.5 23.5,16 L 20,32 Q 19.5,37 20,40.5 Z" fill="var(--car-color, #f4f6f8)" />

            {/* Lower body shading */}
            <path d="M 20,38 L 26,38 A 10 10 0 0 1 46,38 L 94,38 A 10 10 0 0 1 114,38 L 121,38 Q 124,38 124,37 L 124.5,35 L 121,35 L 114,35 A 10 10 0 0 0 94,35 L 46,35 A 10 10 0 0 0 26,35 L 20,35 Z" fill="#e2e6eb" />

            {/* Shoulder character line */}
            <path d="M 21,30 L 121,28" stroke="#d3d9e0" strokeWidth="0.8" fill="none" />

            {/* Black window frame / pillars */}
            <path d="M 27,14 L 73,13.5 L 93,24.5 L 25,25 Z" fill="#1f2933" />

            {/* Front Window */}
            <polygon points="57,15 72,14.5 90,23.5 57,23.5" fill="url(#altoGlass)" />

            {/* Alto Rear Window with signature upswept rear sill */}
            <polygon points="28,15 54,15 54,23.5 40,23.5 28,19" fill="url(#altoGlass)" />

            {/* Door shut lines */}
            <line x1="55.5" y1="13.5" x2="55.5" y2="40" stroke="#d3d9e0" strokeWidth="0.8" />
            <line x1="86" y1="24.5" x2="86" y2="40" stroke="#d3d9e0" strokeWidth="0.8" />
            <line x1="26" y1="24.5" x2="26" y2="38" stroke="#d3d9e0" strokeWidth="0.8" />

            {/* Door handles */}
            <rect x="58" y="26.5" width="4.5" height="1.2" rx="0.6" fill="#1f2933" />
            <rect x="36" y="26.5" width="4.5" height="1.2" rx="0.6" fill="#1f2933" />

            {/* Side mirror */}
            <path d="M 87,24 L 92,23 Q 93,23 93,24.5 L 89,25.5 Z" fill="var(--car-color, #f4f6f8)" />
            <rect x="87" y="24" width="2" height="1.5" fill="#1f2933" />

            {/* Front Headlight (swept-back pale yellow) */}
            <polygon points="113,27 121.5,29 123.5,33 118,33 113,30" fill="#fff6c9" stroke="#cfd8dc" strokeWidth="0.5" />

            {/* Front Grille slot & mesh intake */}
            <rect x="122.5" y="32" width="2" height="1.5" rx="0.5" fill="#1f2933" />
            <path d="M 116,36 L 123,36 L 122,39 L 115,39 Z" fill="#1f2933" />

            {/* Front & rear lower bumper trim */}
            <rect x="119" y="39.5" width="4" height="1.5" rx="0.5" fill="#1f2933" />
            <rect x="19" y="38" width="3" height="2" rx="0.5" fill="#1f2933" />

            {/* Rear Taillight */}
            <rect x="19.2" y="26" width="2.5" height="7.5" rx="1" fill="#e5484d" />

            {/* STATIC Rear Wheel (13-inch steel/alloy look) */}
            <g>
              <circle cx="36" cy="40.5" r="7.5" fill="#0d1b2a" />
              <circle cx="36" cy="40.5" r="5.2" fill="#cfd8dc" />
              <circle cx="36" cy="40.5" r="2.2" fill="#90a4ae" />
              <circle cx="36" cy="40.5" r="1.1" fill="#0d1b2a" />
              <circle cx="36" cy="37.8" r="0.6" fill="#0d1b2a" />
              <circle cx="38.7" cy="40.5" r="0.6" fill="#0d1b2a" />
              <circle cx="36" cy="43.2" r="0.6" fill="#0d1b2a" />
              <circle cx="33.3" cy="40.5" r="0.6" fill="#0d1b2a" />
            </g>

            {/* STATIC Front Wheel (13-inch steel/alloy look) */}
            <g>
              <circle cx="104" cy="40.5" r="7.5" fill="#0d1b2a" />
              <circle cx="104" cy="40.5" r="5.2" fill="#cfd8dc" />
              <circle cx="104" cy="40.5" r="2.2" fill="#90a4ae" />
              <circle cx="104" cy="40.5" r="1.1" fill="#0d1b2a" />
              <circle cx="104" cy="37.8" r="0.6" fill="#0d1b2a" />
              <circle cx="106.7" cy="40.5" r="0.6" fill="#0d1b2a" />
              <circle cx="104" cy="43.2" r="0.6" fill="#0d1b2a" />
              <circle cx="101.3" cy="40.5" r="0.6" fill="#0d1b2a" />
            </g>
          </svg>
          <div className="lane" />
        </div>
      </header>

      <main key={`${tab}-${moreView || ''}`}>
        {loading && <p className="mute">Loading…</p>}
        {err && (
          <div className="card" style={{ background: '#fff5f5', border: '1.5px solid #f6c9cb' }}>
            <p className="abs" style={{ margin: 0 }}>Could not load your records.</p>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={{ fontSize: 13, padding: '7px 14px' }} onClick={load} disabled={loading}>
                {loading ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          </div>
        )}

        {moreView && <button className="back-btn ghost" onClick={() => { setMoreView(null); setTab(previousTab); }}>‹ Back</button>}
        {moreView === 'calendar' && <Cal d={d} go={(x) => { setPre(x); setMoreView(null); setTab('entry'); }} />}
        {moreView === 'oil' && <OilHistory d={d} load={load} del={del} edit={(record) => setRecordEditor({ col: 'expenses', record })} add={(carId) => { setPre({ mode: 'expense', category: 'Oil change', carId }); setMoreView(null); setTab('entry'); }} />}
        {!moreView && tab === 'entry' && <Entry {...{ d, car, drv, carOpts, drvOpts, load, del, pre }} edit={(col, record) => setRecordEditor({ col, record })} />}
        {!moreView && tab === 'reports' && <Reports {...{ d, car, drv }} />}
        {!moreView && tab === 'cars' && <>
          <button style={{ width: '100%', marginBottom: 10 }} onClick={() => setForm({ col: 'cars', init: {}, title: 'New car' })}>+ Add car</button>
          {d.cars.length === 0 && <p className="mute">No cars yet. Add your first car.</p>}
          {d.cars.map((c) => {
            const earn = d.entries.filter((e) => e.carId === c._id).reduce((s, e) => s + e.earning, 0);
            const exp = d.expenses.filter((e) => e.carId === c._id).reduce((s, e) => s + e.amount, 0);
            const lastOil = c.lastOilReading != null ? { date: c.lastOilDate, odometer: c.lastOilReading, nextDue: c.nextOilDue } : d.expenses
              .filter((e) => e.carId === c._id && e.category === 'Oil change' && e.odometer != null)
              .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : String(b._id).localeCompare(String(a._id))))[0];
            return (
              <div className="card" key={c._id}>
                <div className="between"><div className="who"><i className="av">{(c.name || '?')[0]}</i><b>{c.name}<br /><span className="mute">{c.number}</span></b></div>
                  <span><button className="ghost" onClick={() => setForm({ col: 'cars', init: c, title: 'Edit car' })}>Edit</button> <button className="del" onClick={() => del('cars', c._id)}>Delete</button></span></div>
                <div className="mute">{[c.make, c.model, c.year, c.color].filter(Boolean).join(' ')} · Driver: {drv(c.driverId)}</div>
                <div className="mute">Cost {rs(c.cost)} · Earned {rs(earn)} · Expense {rs(exp)}</div>
                {lastOil && (
                  <div className="mute">
                    Last oil change: {lastOil.date} at {km(lastOil.odometer)} km
                    {lastOil.nextDue ? ` · Next due: ${km(lastOil.nextDue)} km` : ''}<br />
                    Last known reading: {km(lastOil.odometer)} km
                  </div>
                )}
                {c.cost > 0 && <><div className="earn">Recovered {Math.max(0, Math.round(((earn - exp) / c.cost) * 100))}% of cost</div><div className="bar"><span style={{ width: Math.min(100, Math.max(2, Math.round(((earn - exp) / c.cost) * 100))) + '%' }} /></div></>}
              </div>
            );
          })}
        </>}
        {!moreView && tab === 'drivers' && <>
          <button style={{ width: '100%', marginBottom: 10 }} onClick={() => setForm({ col: 'drivers', init: {}, title: 'New driver' })}>+ Add driver</button>
          {d.drivers.length === 0 && <p className="mute">No drivers yet. Add your first driver.</p>}
          {d.drivers.map((c) => (
            <div className="card" key={c._id}>
              <div className="between"><div className="who"><i className="av">{(c.name || '?')[0]}</i><b>{c.name}</b></div>
                <span><button className="ghost" onClick={() => setForm({ col: 'drivers', init: c, title: 'Edit driver' })}>Edit</button> <button className="del" onClick={() => del('drivers', c._id)}>Delete</button></span></div>
              <div className="mute">{c.phone} · CNIC {c.cnic || '—'} · License {c.license || '—'}</div>
              <div className="mute">Daily rent {rs(c.dailyRent)}</div>
            </div>
          ))}
        </>}
      </main>

      {form && <Form title={form.title} init={form.init} fields={form.col === 'cars' ? CARF : DRVF} onCancel={() => setForm(null)} onSave={(v) => upsert(form.col, v)} />}
      {recordEditor && <RecordEditor col={recordEditor.col} record={recordEditor.record} d={d} onClose={() => setRecordEditor(null)} onSaved={load} />}
      {pinSheet && <ChangePinModal onClose={() => { setPinSheet(false); setMoreView(null); setTab(previousTab); }} />}
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} openView={(view) => { setMoreOpen(false); setMoreView(view); }} changePin={() => { setMoreOpen(false); setMoreView('pin'); setPinSheet(true); }} lock={handleLock} />}
      <nav>{[['reports', 'Reports'], ['cars', 'Cars'], ['entry', 'Entry'], ['drivers', 'Drivers'], ['more', 'More']].map(([k, l]) => <button key={k} className={(k === 'more' ? moreOpen || !!moreView : !moreOpen && !moreView && tab === k) ? 'on' : ''} onClick={() => { if (k === 'more') { setPreviousTab(tab); setMoreOpen(true); } else { setMoreOpen(false); setMoreView(null); setPre(null); setTab(k); } }}><Ico k={k} />{l}</button>)}</nav>
    </>
  );
}

function Entry({ d, car, drv, carOpts, drvOpts, load, del, pre, edit }) {
  const [mode, setMode] = useState(pre?.mode || 'earning');
  const [date, setDate] = useState(pre?.date || local());
  const [v, setV] = useState({ carId: pre?.carId, driverId: pre?.driverId, category: pre?.category || 'Fuel' });
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const dayE = d.entries.filter((e) => e.date === date);
  const absent = d.cars.filter((c) => !dayE.some((e) => e.carId === c._id));

  const isOil = mode === 'expense' && v.category === 'Oil change';

  const prevOil = useMemo(() => {
    if (!v.carId || !isOil) return null;
    const list = d.expenses
      .filter((e) => e.carId === v.carId && e.category === 'Oil change' && e.odometer != null && e.date <= date)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : (b.odometer || 0) - (a.odometer || 0)));
    return list[0] || null;
  }, [d.expenses, v.carId, isOil, date]);

  const curOdoNum = v.odometer !== undefined && v.odometer !== '' ? Number(v.odometer) : null;
  const isOdoInvalid = isOil && prevOil && curOdoNum !== null && !isNaN(curOdoNum) && curOdoNum < Number(prevOil.odometer);
  const kmRun = isOil && prevOil && curOdoNum !== null && !isNaN(curOdoNum) && curOdoNum >= prevOil.odometer ? curOdoNum - prevOil.odometer : null;

  const save = async () => {
    if (!v.carId) return alert('Select a car');
    if (mode === 'earning') {
      const body = { carId: v.carId, driverId: v.driverId || d.cars.find((c) => c._id === v.carId)?.driverId || '', date, earning: Number(v.amount) || 0, note: v.note || '' };
      const old = dayE.find((e) => e.carId === v.carId);
      old ? await api('PUT', `entries/${old._id}`, body) : await api('POST', 'entries', body);
    } else {
      if (v.category === 'Oil change') {
        if (v.odometer === undefined || v.odometer === '' || isNaN(Number(v.odometer))) {
          return alert('Car meter reading at oil change (km) is required');
        }
        const curOdo = Number(v.odometer);
        if (prevOil && curOdo < prevOil.odometer) {
          return alert('Reading cannot be lower than the last oil change reading');
        }
      }
      const expBody = {
        carId: v.carId,
        date,
        category: v.category || 'Other',
        amount: Number(v.amount) || 0,
        note: v.note || ''
      };
      if (v.category === 'Oil change') {
        expBody.odometer = Number(v.odometer);
        if (v.nextDue !== undefined && v.nextDue !== '') {
          expBody.nextDue = Number(v.nextDue);
        } else {
          expBody.nextDue = Number(v.odometer) + OIL_INTERVAL_KM;
        }
      }
      await api('POST', 'expenses', expBody);
    }
    setV({ carId: v.carId, category: v.category });
    setOk(true);
    setTimeout(() => setOk(false), 1300);
    load();
  };

  return (
    <>
      <div className="row seg" style={{ marginBottom: 10 }}>
        <button className={mode === 'earning' ? 'on' : ''} onClick={() => setMode('earning')}>Daily earning</button>
        <button className={mode === 'expense' ? 'on' : ''} onClick={() => setMode('expense')}>Expense</button>
      </div>
      <div className="card">
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Car<select value={v.carId || ''} onChange={set('carId')}><option value="">Select car</option>{carOpts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></label>
        {mode === 'earning'
          ? <label>Driver<select value={v.driverId || ''} onChange={set('driverId')}><option value="">Car's current driver</option>{drvOpts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></label>
          : <label>Category<select value={v.category || 'Fuel'} onChange={set('category')}>{CATS.map(([a, b]) => <option key={a}>{b}</option>)}</select></label>}

        {isOil && v.carId && (
          <div className="oil-info">
            {prevOil ? (
              <>
                <div>Last oil change: <b>{prevOil.date}</b> at <b>{km(prevOil.odometer)} km</b></div>
                <div>Expected next oil change at <b>{km(Number(prevOil.odometer) + OIL_INTERVAL_KM)} km</b> ({km(OIL_INTERVAL_KM)} km interval)</div>
              </>
            ) : (
              <div>First oil change for this car</div>
            )}
          </div>
        )}

        {isOil && (
          <>
            {curOdoNum !== null && prevOil && (
              <div className={`oil-status ${isOdoInvalid ? 'bad' : kmRun > OIL_INTERVAL_KM ? 'warn' : 'good'}`}>
                {isOdoInvalid
                  ? 'Reading cannot be lower than the last oil change reading'
                  : kmRun > OIL_INTERVAL_KM
                    ? `Car ran ${km(kmRun)} km on the last oil (${km(kmRun - OIL_INTERVAL_KM)} km over the ${km(OIL_INTERVAL_KM)} km limit)`
                    : `Car ran ${km(kmRun)} km on the last oil (${km(OIL_INTERVAL_KM - kmRun)} km before the ${km(OIL_INTERVAL_KM)} km limit)`}
              </div>
            )}
            <label>Car meter reading at oil change (km) *
              <input
                type="number"
                inputMode="decimal"
                placeholder="e.g. 85000"
                value={v.odometer ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const num = Number(val);
                  setV((old) => ({
                    ...old,
                    odometer: val,
                    nextDue: val !== '' && !isNaN(num) ? String(num + OIL_INTERVAL_KM) : old.nextDue || ''
                  }));
                }}
              />
            </label>
            <label>Next oil change due at (km) (optional)
              <input
                type="number"
                inputMode="decimal"
                placeholder="e.g. 90000"
                value={v.nextDue ?? ''}
                onChange={(e) => setV({ ...v, nextDue: e.target.value })}
              />
            </label>
          </>
        )}

        <label>{mode === 'earning' ? 'Rent received (Rs)' : 'Amount (Rs)'}<input type="number" inputMode="decimal" value={v.amount ?? ''} onChange={set('amount')} /></label>
        <label>Note<input value={v.note || ''} onChange={set('note')} /></label>
        <button
          className={'cta' + (ok ? ' ok' : '')}
          disabled={isOdoInvalid}
          onClick={save}
          style={isOdoInvalid ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
        >
          {ok ? 'Saved ✓' : mode === 'earning' ? 'Save earning' : 'Save expense'}
        </button>
      </div>
      {absent.length > 0 && <div className="card"><b className="abs">No record on {date}</b>
        <div className="chips">{absent.map((c) => <button key={c._id} className="chip" onClick={() => { setMode('earning'); setV({ ...v, carId: c._id }); }}>{c.name}</button>)}</div></div>}
      {dayE.map((e) => <div className="card between" key={e._id}><span><b>{car(e.carId)}</b> <span className="mute">{drv(e.driverId)}{e.note ? ` · ${e.note}` : ''}</span></span><span className="record-actions"><span className="earn">{rs(e.earning)}</span><button className="ghost record-edit" onClick={() => edit('entries', e)}>Edit</button><button className="del" onClick={() => del('entries', e._id, 'Delete this earning record?')}>Delete</button></span></div>)}
      {d.expenses.filter((e) => e.date === date).map((e) => (
        <div className="card between" key={e._id}>
          <span>
            <b>{car(e.carId)}</b>{' '}
            <span className="mute">
              {e.category}{e.odometer != null ? ` (${Number(e.odometer).toLocaleString('en-US')} km)` : ''}{e.note ? ` · ${e.note}` : ''}
            </span>
          </span>
          <span>
            <span className="record-actions"><span className="exp">{rs(e.amount)}</span><button className="ghost record-edit" onClick={() => edit('expenses', e)}>Edit</button><button className="del" onClick={() => del('expenses', e._id, 'Delete this expense record?')}>Delete</button></span>
          </span>
        </div>
      ))}
    </>
  );
}

function MoreSheet({ onClose, openView, changePin, lock }) {
  const rows = [
    ['calendar', 'Calendar', () => openView('calendar')],
    ['oil', 'Oil change history', () => openView('oil')],
    ['pin', 'Change PIN', changePin],
    ['lock', 'Lock', lock]
  ];
  return <div className="sheet more-sheet" onClick={onClose}><div className="card" onClick={(e) => e.stopPropagation()}>
    <div className="between"><h3>More</h3><button className="ghost close-more" onClick={onClose} aria-label="Close">×</button></div>
    <div className="more-list">{rows.map(([icon, label, action]) => <button key={label} className="more-row" onClick={action}><Ico k={icon} /><span>{label}</span><b>›</b></button>)}</div>
  </div></div>;
}

function OilHistory({ d, del, edit, add }) {
  const [carId, setCarId] = useState(d.cars[0]?._id || '');
  const oils = d.expenses
    .filter((e) => e.carId === carId && e.category === 'Oil change' && e.odometer != null)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b._id).localeCompare(String(a._id)));
  const chronological = [...oils].reverse();
  const previousById = new Map(chronological.map((item, i) => [item._id, i ? Number(chronological[i - 1].odometer) : null]));
  const selectedCar = d.cars.find((c) => c._id === carId);
  const latest = oils[0];
  const lastReading = selectedCar?.lastOilReading ?? latest?.odometer;
  const nextDue = selectedCar?.nextOilDue ?? latest?.nextDue ?? (lastReading != null ? Number(lastReading) + OIL_INTERVAL_KM : null);
  return <>
    <div className="card">
      <label>Car<select value={carId} onChange={(e) => setCarId(e.target.value)}><option value="">Select car</option>{d.cars.map((c) => <option key={c._id} value={c._id}>{c.name} {c.number || ''}</option>)}</select></label>
      <button className="cta" disabled={!carId} onClick={() => add(carId)}>+ Add oil change</button>
    </div>
    {carId && <div className="tot oil-summary"><div><small className="mute">Last reading</small><b>{lastReading != null ? `${km(lastReading)} km` : '—'}</b></div><div><small className="mute">Next due</small><b>{nextDue != null ? `${km(nextDue)} km` : '—'}</b></div><div><small className="mute">Oil changes</small><b>{oils.length}</b></div></div>}
    {carId && oils.length === 0 && <div className="card mute">No oil change recorded for this car</div>}
    {oils.map((item) => {
      const previous = previousById.get(item._id);
      const ran = previous == null ? null : Number(item.odometer) - previous;
      return <div className="card oil-history-item" key={item._id}>
        <div className="between"><b>{item.date}</b><span className="exp">{rs(item.amount)}</span></div>
        <div className="mute">Meter reading: {km(item.odometer)} km</div>
        {ran != null && <div className={ran > OIL_INTERVAL_KM ? 'oil-run warn' : ran >= 0 ? 'oil-run good' : 'oil-run bad'}>Ran {km(ran)} km on this oil{ran > OIL_INTERVAL_KM ? ` · ${km(ran - OIL_INTERVAL_KM)} km over limit` : ran >= 0 ? ` · ${km(OIL_INTERVAL_KM - ran)} km before limit` : ''}</div>}
        {item.note && <div className="mute">{item.note}</div>}
        <div className="oil-actions"><button className="ghost record-edit" onClick={() => edit(item)}>Edit</button><button className="del" onClick={() => del('expenses', item._id, 'Delete this oil change record?')}>Delete</button></div>
      </div>;
    })}
  </>;
}

function Reports({ d, car, drv }) {
  const [p, setP] = useState('month');
  const [val, setVal] = useState({ day: local(), month: local().slice(0, 7), year: local().slice(0, 4) });
  const [by, setBy] = useState('car');
  const [pdfType, setPdfType] = useState('driver');
  const [pdfTarget, setPdfTarget] = useState('');
  const [pdfMonth, setPdfMonth] = useState(local().slice(0, 7));
  const [pdfLoading, setPdfLoading] = useState(false);

  const [s, e] = useMemo(() => {
    const x = val[p];
    if (p === 'day') return [x, x];
    if (p === 'year') return [`${x}-01-01`, `${x}-12-31`];
    const [y, m] = x.split('-').map(Number);
    return [`${x}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)];
  }, [p, val]);
  const inR = (r) => r.date >= s && r.date <= e;
  const ent = d.entries.filter(inR), exp = d.expenses.filter(inR);
  const t = local();
  const rows = by === 'car'
    ? d.cars.map((c) => {
        const ce = ent.filter((x) => x.carId === c._id);
        const from = [s, c.startDate || c.purchaseDate || s].sort().pop(), to = e < t ? e : t;
        const have = new Set(ce.map((x) => x.date));
        const absent = from <= to ? days(from, to).filter((x) => !have.has(x)).length : 0;
        const earning = ce.reduce((a, x) => a + x.earning, 0), expense = exp.filter((x) => x.carId === c._id).reduce((a, x) => a + x.amount, 0);
        return { id: c._id, name: c.name, earning, expense, days: have.size, absent };
      })
    : d.drivers.map((c) => {
        const ce = ent.filter((x) => x.driverId === c._id);
        return { id: c._id, name: c.name, earning: ce.reduce((a, x) => a + x.earning, 0), days: new Set(ce.map((x) => x.date)).size };
      });
  const E = ent.reduce((a, x) => a + x.earning, 0), X = exp.reduce((a, x) => a + x.amount, 0);
  const byCat = Object.entries(exp.reduce((o, x) => ((o[x.category] = (o[x.category] || 0) + x.amount), o), {}));

  const handleGeneratePdf = async (isShare = false) => {
    const targetList = pdfType === 'driver' ? d.drivers : d.cars;
    const targetId = pdfTarget || targetList[0]?._id;
    if (!targetId) return alert(`Please add and select a ${pdfType} first`);

    setPdfLoading(true);
    try {
      let doc, fileName;
      if (pdfType === 'driver') {
        const drvObj = d.drivers.find((x) => x._id === targetId);
        fileName = `${(drvObj?.name || 'Driver').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_${pdfMonth}.pdf`;
        doc = generateDriverPdf({ d, driverId: targetId, month: pdfMonth });
      } else {
        const carObj = d.cars.find((x) => x._id === targetId);
        fileName = `${(carObj?.name || 'Car').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_${pdfMonth}.pdf`;
        doc = generateCarPdf({ d, carId: targetId, month: pdfMonth });
      }
      await downloadOrSharePdf(doc, fileName, isShare);
    } catch (err) {
      alert('Error generating PDF: ' + (err.message || err));
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <>
      <div className="row seg" style={{ marginBottom: 8 }}>{[['day', 'Daily'], ['month', 'Monthly'], ['year', 'Yearly']].map(([k, l]) => <button key={k} className={p === k ? 'on' : ''} onClick={() => setP(k)}>{l}</button>)}</div>
      <div className="card">
        {p === 'year'
          ? <input type="number" value={val.year} onChange={(x) => setVal({ ...val, year: x.target.value })} />
          : <input type={p === 'day' ? 'date' : 'month'} value={val[p]} onChange={(x) => setVal({ ...val, [p]: x.target.value })} />}
      </div>
      <div className="tot"><div><small className="mute">Earning</small><b className="earn"><Count v={E} /></b></div><div><small className="mute">Expense</small><b className="exp"><Count v={X} /></b></div><div><small className="mute">Net</small><b><Count v={E - X} /></b></div></div>
      <div className="row seg" style={{ marginBottom: 8 }}><button className={by === 'car' ? 'on' : ''} onClick={() => setBy('car')}>Car-wise</button><button className={by === 'driver' ? 'on' : ''} onClick={() => setBy('driver')}>Driver-wise</button></div>
      {rows.length === 0 && <p className="mute">Add a {by} first.</p>}
      {rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="between"><b>{r.name}</b><span className="earn">{rs(r.earning)}</span></div>
          <div className="mute">Worked {r.days} days{by === 'car' && <> · <span className="abs">Absent {r.absent} days</span> · Expense {rs(r.expense)} · Net {rs(r.earning - r.expense)}</>}</div>
        </div>
      ))}
      {byCat.length > 0 && <div className="card"><b>Expense by category</b>{byCat.map(([k, a]) => <div className="between mute" key={k}><span>{k}</span><span>{rs(a)}</span></div>)}</div>}

      <div className="card" style={{ marginTop: 14 }}>
        <b style={{ fontSize: 16 }}>Download Monthly PDF Report</b>
        <div className="row seg" style={{ margin: '10px 0 8px' }}>
          <button className={pdfType === 'driver' ? 'on' : ''} onClick={() => { setPdfType('driver'); setPdfTarget(''); }}>Driver-wise</button>
          <button className={pdfType === 'car' ? 'on' : ''} onClick={() => { setPdfType('car'); setPdfTarget(''); }}>Car-wise</button>
        </div>
        <label>
          {pdfType === 'driver' ? 'Select Driver' : 'Select Car'}
          <select value={pdfTarget || (pdfType === 'driver' ? d.drivers[0]?._id : d.cars[0]?._id) || ''} onChange={(e) => setPdfTarget(e.target.value)}>
            {(pdfType === 'driver' ? d.drivers : d.cars).map((x) => (
              <option key={x._id} value={x._id}>{x.name} {x.number ? `(${x.number})` : ''}</option>
            ))}
          </select>
        </label>
        <label>
          Select Month
          <input type="month" value={pdfMonth} onChange={(e) => setPdfMonth(e.target.value)} />
        </label>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="cta" onClick={() => handleGeneratePdf(false)} disabled={pdfLoading}>
            {pdfLoading ? 'Generating…' : 'Download PDF'}
          </button>
          <button className="ghost" onClick={() => handleGeneratePdf(true)} disabled={pdfLoading} title="Share via WhatsApp or Apps">
            Share
          </button>
        </div>
      </div>

    </>
  );
}

const short = (n) => (n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : n);
function Cal({ d, go }) {
  const [by, setBy] = useState('driver');
  const [id, setId] = useState('');
  const [m, setM] = useState(local().slice(0, 7));
  const list = by === 'driver' ? d.drivers : d.cars;
  const sel = id || list[0]?._id;
  const o = list.find((x) => x._id === sel) || {};
  const mine = d.entries.filter((e) => e[by === 'driver' ? 'driverId' : 'carId'] === sel);
  const sum = {};
  mine.forEach((e) => (sum[e.date] = (sum[e.date] || 0) + e.earning));
  const first = mine.map((e) => e.date).sort()[0];
  const start = (by === 'driver' ? o.joinDate : o.startDate || o.purchaseDate) || first || '9999';
  const [y, mo] = m.split('-').map(Number);
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const t = local();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: new Date(y, mo, 0).getDate() }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`)];
  const cls = (dt) => { const a = sum[dt]; if (a > 0) return 'ok'; if (dt > t || dt < start) return 'na'; return a === 0 ? 'zero' : 'no'; };
  const cnt = (c) => cells.filter((x) => x && cls(x) === c).length;
  const tot = cells.reduce((a, x) => a + (x ? sum[x] || 0 : 0), 0);
  const shift = (k) => { const x = new Date(y, mo - 1 + k, 1); setM(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); };
  const pick = (dt) => go(by === 'driver'
    ? { date: dt, driverId: sel, carId: d.cars.find((c) => c.driverId === sel)?._id || mine[0]?.carId }
    : { date: dt, carId: sel, driverId: o.driverId });
  return (
    <>
      <div className="row seg" style={{ marginBottom: 8 }}>
        <button className={by === 'driver' ? 'on' : ''} onClick={() => { setBy('driver'); setId(''); }}>Driver</button>
        <button className={by === 'car' ? 'on' : ''} onClick={() => { setBy('car'); setId(''); }}>Car</button>
      </div>
      {list.length === 0 ? <p className="mute">Add a {by} first.</p> : <>
        <div className="card">
          <select value={sel || ''} onChange={(e) => setId(e.target.value)}>{list.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>
          <div className="between" style={{ marginTop: 10 }}>
            <button className="ghost" onClick={() => shift(-1)}>‹</button>
            <b>{new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</b>
            <button className="ghost" onClick={() => shift(1)}>›</button>
          </div>
        </div>
        <div className="tot"><div><small className="mute">Present</small><b className="earn">{cnt('ok')}</b></div><div><small className="mute">Absent</small><b className="exp">{cnt('no') + cnt('zero')}</b></div><div><small className="mute">Received</small><b><Count v={tot} /></b></div></div>
        <div className="card">
          <div className="cal">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <i key={w} className="wd">{w}</i>)}
            {cells.map((dt, i) => dt
              ? <button key={dt} className={'day ' + cls(dt)} onClick={() => pick(dt)}><b>{+dt.slice(8)}</b><small>{sum[dt] > 0 ? short(sum[dt]) : ''}</small></button>
              : <i key={'e' + i} />)}
          </div>
          <div className="legend"><span><i style={{ background: '#0f9d6a' }} />Present (money received)</span><span><i style={{ background: '#e5484d' }} />Absent (no entry)</span><span><i style={{ background: '#ffe8b8' }} />Entry with Rs 0</span></div>
          <p className="mute" style={{ marginBottom: 0 }}>Kisi din par tap karo, us din ki entry khul jayegi.</p>
        </div>
      </>}
    </>
  );
}
