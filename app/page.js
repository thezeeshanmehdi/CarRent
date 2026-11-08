'use client';
import { useState, useEffect, useMemo } from 'react';
import { generateDriverPdf, generateCarPdf, downloadOrSharePdf } from '../lib/pdf';

const local = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const rs = (n) => 'Rs ' + Math.round(n || 0).toLocaleString('en-US');
const days = (a, b) => { const o = []; for (let t = Date.parse(a); t <= Date.parse(b); t += 864e5) o.push(new Date(t).toISOString().slice(0, 10)); return o; };
const api = async (m, p, b) => {
  const r = await fetch('/api/' + p, { method: m, headers: { 'content-type': 'application/json' }, body: b && JSON.stringify(b) });
  if (r.status === 401) throw new Error('auth');
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Server error ' + r.status);
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
const P = { calendar: 'M4 7h16v13H4zM4 11h16M8 3v4M16 3v4', entry: 'M12 5v14M5 12h14', reports: 'M5 20V10M12 20V4M19 20v-7', cars: 'M5 16l1.5-5a2 2 0 011.9-1.4h7.2a2 2 0 011.9 1.4L19 16M4 16h16v3H4zM7 19v1.5M17 19v1.5', drivers: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0' };
const Ico = ({ k }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={P[k]} /></svg>;

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

export default function App() {
  const [tab, setTab] = useState('entry');
  const [d, setD] = useState({ cars: [], drivers: [], entries: [], expenses: [] });
  const [locked, setLocked] = useState(false);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [pre, setPre] = useState(null);

  const load = async () => {
    try {
      const [cars, drivers, entries, expenses] = await Promise.all(['cars', 'drivers', 'entries', 'expenses'].map((c) => api('GET', c)));
      setD({ cars, drivers, entries, expenses }); setLocked(false); setErr('');
    } catch (e) { if (e.message === 'auth') setLocked(true); else setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const car = (id) => d.cars.find((c) => c._id === id)?.name || '—';
  const drv = (id) => d.drivers.find((c) => c._id === id)?.name || '—';
  const carOpts = d.cars.map((c) => [c._id, `${c.name} ${c.number || ''}`]);
  const drvOpts = d.drivers.map((c) => [c._id, c.name]);
  const t0 = local();
  const todayE = d.entries.filter((e) => e.date === t0).reduce((a, e) => a + e.earning, 0);
  const monNet = d.entries.filter((e) => e.date.slice(0, 7) === t0.slice(0, 7)).reduce((a, e) => a + e.earning, 0) - d.expenses.filter((e) => e.date.slice(0, 7) === t0.slice(0, 7)).reduce((a, e) => a + e.amount, 0);
  const del = async (col, id) => { if (confirm('Delete this record?')) { await api('DELETE', `${col}/${id}`); load(); } };
  const upsert = async (col, v) => { v._id ? await api('PUT', `${col}/${v._id}`, v) : await api('POST', col, v); setForm(null); load(); };

  if (locked) return (
    <main><div className="card" style={{ marginTop: 40 }}>
      <h3>Enter PIN</h3>
      <form onSubmit={async (e) => {
        e.preventDefault(); setErr('');
        const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: e.target.pin.value }) });
        if (r.ok) { setLoading(true); load(); } else setErr((await r.json().catch(() => ({}))).error || 'Login failed');
      }}>
        <input name="pin" type="password" autoFocus placeholder="PIN / password" autoComplete="current-password" />
        {err && <p className="abs">{err}</p>}
        <button style={{ marginTop: 10, width: '100%' }}>Open</button>
      </form>
    </div></main>
  );

  const CARF = [['name', 'Car name'], ['number', 'Number plate'], ['make', 'Make'], ['model', 'Model'], ['year', 'Year', 'number'], ['color', 'Color'], ['chassis', 'Chassis no.'], ['engine', 'Engine no.'], ['purchaseDate', 'Purchase date', 'date'], ['cost', 'Car cost (Rs)', 'number'], ['startDate', 'Rent start date', 'date'], ['driverId', 'Current driver', 'select', drvOpts], ['regExpiry', 'Registration expiry', 'date'], ['insExpiry', 'Insurance expiry', 'date'], ['notes', 'Notes', 'textarea']];
  const DRVF = [['name', 'Driver name'], ['phone', 'Phone', 'tel'], ['cnic', 'CNIC'], ['license', 'License no.'], ['address', 'Address'], ['joinDate', 'Joining date', 'date'], ['dailyRent', 'Daily rent (Rs)', 'number'], ['notes', 'Notes', 'textarea']];

  return (
    <>
      <header className="hero">
        <div className="hrow">
          <div><small>Aaj ki earning</small><strong><Count v={todayE} /></strong></div>
          <div className="r"><small>Is mahine ka net</small><b><Count v={monNet} /></b></div>
        </div>
        <div className="lane" />
        <button className="lock" onClick={async () => { await fetch('/api/login', { method: 'DELETE' }); setLocked(true); }}>Lock</button>
      </header>
      <main key={tab}>
        {loading && <p className="mute">Loading…</p>}
        {err && <p className="abs">{err}. MongoDB settings check karo.</p>}
        {tab === 'entry' && <Entry {...{ d, car, drv, carOpts, drvOpts, load, del, pre }} />}
        {tab === 'calendar' && <Cal d={d} go={(x) => { setPre(x); setTab('entry'); }} />}
        {tab === 'reports' && <Reports {...{ d, car, drv }} />}
        {tab === 'cars' && <>
          <button style={{ width: '100%', marginBottom: 10 }} onClick={() => setForm({ col: 'cars', init: {}, title: 'New car' })}>+ Add car</button>
          {d.cars.length === 0 && <p className="mute">No cars yet. Add your first car.</p>}
          {d.cars.map((c) => {
            const earn = d.entries.filter((e) => e.carId === c._id).reduce((s, e) => s + e.earning, 0);
            const exp = d.expenses.filter((e) => e.carId === c._id).reduce((s, e) => s + e.amount, 0);
            const carOils = d.expenses
              .filter((e) => e.carId === c._id && e.category === 'Oil change' && e.odometer != null)
              .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : (b.odometer || 0) - (a.odometer || 0)));
            const lastOil = carOils[0];
            return (
              <div className="card" key={c._id}>
                <div className="between"><div className="who"><i className="av">{(c.name || '?')[0]}</i><b>{c.name}<br /><span className="mute">{c.number}</span></b></div>
                  <span><button className="ghost" onClick={() => setForm({ col: 'cars', init: c, title: 'Edit car' })}>Edit</button> <button className="del" onClick={() => del('cars', c._id)}>Delete</button></span></div>
                <div className="mute">{[c.make, c.model, c.year, c.color].filter(Boolean).join(' ')} · Driver: {drv(c.driverId)}</div>
                <div className="mute">Cost {rs(c.cost)} · Earned {rs(earn)} · Expense {rs(exp)}</div>
                {lastOil && (
                  <div className="mute">
                    Last oil change: {lastOil.date} at {Number(lastOil.odometer).toLocaleString('en-US')} km
                    {lastOil.nextDue ? ` · Next due: ${Number(lastOil.nextDue).toLocaleString('en-US')} km` : ''}
                  </div>
                )}
                {c.cost > 0 && <><div className="earn">Recovered {Math.max(0, Math.round(((earn - exp) / c.cost) * 100))}% of cost</div><div className="bar"><span style={{ width: Math.min(100, Math.max(2, Math.round(((earn - exp) / c.cost) * 100))) + '%' }} /></div></>}
              </div>
            );
          })}
        </>}
        {tab === 'drivers' && <>
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
      <nav>{[['entry', 'Entry'], ['calendar', 'Calendar'], ['reports', 'Reports'], ['cars', 'Cars'], ['drivers', 'Drivers']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setPre(null); setTab(k); }}><Ico k={k} />{l}</button>)}</nav>
    </>
  );
}

function Entry({ d, car, drv, carOpts, drvOpts, load, del, pre }) {
  const [mode, setMode] = useState('earning');
  const [date, setDate] = useState(pre?.date || local());
  const [v, setV] = useState({ carId: pre?.carId, driverId: pre?.driverId, category: 'Fuel' });
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
  const isOdoInvalid = isOil && prevOil && curOdoNum !== null && !isNaN(curOdoNum) && curOdoNum < prevOil.odometer;
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
          return alert(`Current reading (${curOdo} km) must be greater than or equal to previous reading (${prevOil.odometer} km)`);
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
          expBody.nextDue = Number(v.odometer) + 5000;
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
          <div className="card" style={{ background: '#f0f7f9', border: '1px solid var(--line)', padding: 12, margin: '6px 0 12px' }}>
            {prevOil ? (
              <>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                  Previous oil change: <b>{prevOil.date}</b>, <b>{Number(prevOil.odometer).toLocaleString('en-US')} km</b>
                </div>
                {kmRun !== null && (
                  <div style={{ color: 'var(--earn)', fontWeight: 600, fontSize: 13, marginTop: 4 }}>
                    Car ran {kmRun.toLocaleString('en-US')} km on the last oil
                  </div>
                )}
                {isOdoInvalid && (
                  <div className="abs" style={{ fontSize: 13, marginTop: 4 }}>
                    Current reading must be ≥ previous reading ({Number(prevOil.odometer).toLocaleString('en-US')} km)
                  </div>
                )}
              </>
            ) : (
              <div className="mute" style={{ fontSize: 13 }}>First oil change recorded for this car</div>
            )}
          </div>
        )}

        {isOil && (
          <>
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
                    nextDue: val !== '' && !isNaN(num) ? String(num + 5000) : old.nextDue || ''
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
        {isOdoInvalid && <p className="abs" style={{ margin: '0 0 10px 0' }}>Current meter reading cannot be lower than previous reading ({prevOil.odometer} km).</p>}
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
      {dayE.map((e) => <div className="card between" key={e._id}><span><b>{car(e.carId)}</b> <span className="mute">{drv(e.driverId)}</span></span><span><span className="earn">{rs(e.earning)}</span> <button className="del" onClick={() => del('entries', e._id)}>×</button></span></div>)}
      {d.expenses.filter((e) => e.date === date).map((e) => (
        <div className="card between" key={e._id}>
          <span>
            <b>{car(e.carId)}</b>{' '}
            <span className="mute">
              {e.category}{e.odometer != null ? ` (${Number(e.odometer).toLocaleString('en-US')} km)` : ''}{e.note ? ` · ${e.note}` : ''}
            </span>
          </span>
          <span>
            <span className="exp">{rs(e.amount)}</span> <button className="del" onClick={() => del('expenses', e._id)}>×</button>
          </span>
        </div>
      ))}
    </>
  );
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
      <div className="tot"><div><span className="mute">Earning</span><b className="earn"><Count v={E} /></b></div><div><span className="mute">Expense</span><b className="exp"><Count v={X} /></b></div><div><span className="mute">Net</span><b><Count v={E - X} /></b></div></div>
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
        <div className="tot"><div><span className="mute">Present</span><b className="earn">{cnt('ok')}</b></div><div><span className="mute">Absent</span><b className="exp">{cnt('no') + cnt('zero')}</b></div><div><span className="mute">Received</span><b><Count v={tot} /></b></div></div>
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
