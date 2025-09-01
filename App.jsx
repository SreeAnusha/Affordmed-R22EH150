import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'urlshort:v3';

function loadLinks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveLinks(links) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

function isValidUrl(u) {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
function sanitizeCode(code) {
  return (code || '').replace(/[^0-9A-Za-z_-]/g, '').trim();
}
function randomCode(len = 6) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const arr = new Uint8Array(len);
  window.crypto.getRandomValues(arr);
  return Array.from(arr).map(n => chars[n % chars.length]).join('');
}
function now() { return Date.now(); }
function fmt(ts) { return ts ? new Date(ts).toLocaleString() : '—'; }

function deviceMeta() {
  const ua = navigator.userAgent.toLowerCase();
  const os = /windows/.test(ua) ? 'Windows' : /mac/.test(ua) ? 'macOS' :
             /android/.test(ua) ? 'Android' : /iphone|ipad|ipod/.test(ua) ? 'iOS' :
             /linux/.test(ua) ? 'Linux' : 'Other';
  return {
    os,
    lang: navigator.language || 'en',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    screen: `${window.screen?.width || '?'}x${window.screen?.height || '?'}`,
  };
}

async function submitToBackend(batch) {
  await new Promise(r => setTimeout(r, 300));
  return {
    success: true,
    created: batch.map(item => {
      const code = item.preferredCode || randomCode(6);
      const createdAt = now();
      const expiryTs = item.validityMinutes ? createdAt + item.validityMinutes * 60000 : null;
      return { code, longUrl: item.longUrl, createdAt, expiryTs, visits: [] };
    })
  };
}

function handleRedirect() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const match = hash.match(/^r\/(.+)$/);
  if (!match) return;
  const code = match[1];
  const links = loadLinks();
  const link = links.find(l => l.code === code);
  if (!link) return;
  link.visits.push({ ts: now(), ref: document.referrer || '(direct)', ...deviceMeta() });
  saveLinks(links);
  window.location.replace(link.longUrl);
}

export default function App() {
  const [links, setLinks] = useState(() => loadLinks());
  const [rows, setRows] = useState([{ longUrl: '', validityMinutes: '', preferredCode: '', errors: {} }]);
  const [tab, setTab] = useState('shorten');
  const [createdBatch, setCreatedBatch] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => { handleRedirect(); }, []);
  useEffect(() => { saveLinks(links); }, [links]);

  function setRow(i, patch) {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  }
  function addRow() {
    if (rows.length < 5) setRows(r => [...r, { longUrl: '', validityMinutes: '', preferredCode: '', errors: {} }]);
  }
  function removeRow(i) {
    setRows(r => r.filter((_, idx) => idx !== i));
  }

  function validate(row, existing) {
    const e = {};
    if (!isValidUrl(row.longUrl)) e.longUrl = 'Invalid URL';
    if (row.validityMinutes) {
      const v = Number(row.validityMinutes);
      if (!Number.isInteger(v) || v <= 0) e.validityMinutes = 'Must be positive integer';
    }
    if (row.preferredCode) {
      const sc = sanitizeCode(row.preferredCode);
      if (!sc) e.preferredCode = 'Invalid characters';
      else if (existing.has(sc.toLowerCase())) e.preferredCode = 'Code taken';
    }
    return e;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const existing = new Set(links.map(l => l.code.toLowerCase()));
    const validated = rows.map(r => ({ ...r, errors: validate(r, existing) }));
    setRows(validated);
    if (validated.some(r => Object.keys(r.errors).length)) return alert('Fix errors first.');
    const batch = validated.map(r => ({
      longUrl: r.longUrl.trim(),
      validityMinutes: r.validityMinutes ? Number(r.validityMinutes) : null,
      preferredCode: sanitizeCode(r.preferredCode) || null
    }));
    setCreating(true);
    const resp = await submitToBackend(batch);
    if (resp.success) {
      setLinks([...resp.created, ...links]);
      setCreatedBatch(resp.created);
      setRows([{ longUrl: '', validityMinutes: '', preferredCode: '', errors: {} }]);
    }
    setCreating(false);
  }

  const stats = useMemo(() => {
    const total = links.length;
    const active = links.filter(l => !l.expiryTs || l.expiryTs > now()).length;
    const expired = total - active;
    const clicks = links.reduce((s, l) => s + (l.visits?.length || 0), 0);
    return { total, active, expired, clicks };
  }, [links]);

  return (
    <div style={{ padding: 20 }}>
      <h1>URL Shortener</h1>
      <nav>
        <button onClick={() => setTab('shorten')}>Shorten</button>
        <button onClick={() => setTab('stats')}>Statistics</button>
      </nav>

      {tab === 'shorten' && (
        <form onSubmit={onSubmit}>
          {rows.map((r, i) => (
            <div key={i} style={{ border: '1px solid #ccc', margin: 8, padding: 8 }}>
              <input
                placeholder="Long URL"
                value={r.longUrl}
                onChange={e => setRow(i, { longUrl: e.target.value })}
                style={{ width: '100%' }}
              />
              {r.errors.longUrl && <div style={{ color: 'red' }}>{r.errors.longUrl}</div>}
              <input
                placeholder="Validity (minutes)"
                value={r.validityMinutes}
                onChange={e => setRow(i, { validityMinutes: e.target.value })}
              />
              {r.errors.validityMinutes && <div style={{ color: 'red' }}>{r.errors.validityMinutes}</div>}
              <input
                placeholder="Preferred shortcode"
                value={r.preferredCode}
                onChange={e => setRow(i, { preferredCode: e.target.value })}
              />
              {r.errors.preferredCode && <div style={{ color: 'red' }}>{r.errors.preferredCode}</div>}
              {rows.length > 1 && <button type="button" onClick={() => removeRow(i)}>Remove</button>}
            </div>
          ))}
          {rows.length < 5 && <button type="button" onClick={addRow}>Add another</button>}
          <button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create'}</button>
        </form>
      )}

      {createdBatch.length > 0 && (
        <div>
          <h3>Created Links</h3>
          {createdBatch.map(l => (
            <div key={l.code}>
              <div>Short: <a href={`#/r/${l.code}`} target="_blank" rel="noreferrer">#/r/{l.code}</a></div>
              <div>Original: {l.longUrl}</div>
              <div>Expiry: {l.expiryTs ? fmt(l.expiryTs) : 'Never'}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'stats' && (
        <div>
          <h2>Stats</h2>
          <p>Total: {stats.total}</p>
          <p>Active: {stats.active}</p>
          <p>Expired: {stats.expired}</p>
          <p>Clicks: {stats.clicks}</p>
        </div>
      )}
    </div>
  );
}
