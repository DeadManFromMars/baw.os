/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   data.js — the visitor "fingerprint" shown in the scan phase.

   DataStore.ready[id] holds every value scan.js displays:
     browser/device facts (read immediately, all local),
     network facts (IP + geolocation from two public APIs — only
       fetched once lookupNetwork() is called, i.e. when the
       passphrase screen is shown; logged-in players skip it),
     and fake "classified" ARG values (fake1…fake25).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DataStore = (() => {

    const store = {};
    const set   = (id, value) => { store[id] = value; };


    /* ── Network: IP → geolocation (async, may fail) ── */

    const GEO_FIELDS = {          // store id → ipapi.co field
        loc: null, isp: 'org', postal: 'postal', asn: 'asn',
        region: 'region', currency: 'currency', calling: 'country_calling_code',
    };
    let lookupStarted = false;

    function lookupNetwork() {
        if (lookupStarted) return;
        lookupStarted = true;

        fetch('https://api.ipify.org?format=json')
            .then(r => r.json())
            .then(({ ip }) => { set('ip', ip); return fetch(`https://ipapi.co/${ip}/json/`); })
            .then(r => r.json())
            .then(geo => {
                for (const [id, field] of Object.entries(GEO_FIELDS)) set(id, geo[field] || 'Unknown');
                set('loc', [geo.city, geo.country_name].filter(Boolean).join(', ') || 'Unknown');
            })
            .catch(() => {
                // Blocked, offline or rate-limited — rows show a dash instead of hanging
                if (!store.ip) set('ip', 'Masked / VPN');
                for (const id of Object.keys(GEO_FIELDS)) if (!(id in store)) set(id, '—');
            });
    }


    /* ── Browser + device (sync) ── */

    const ua   = navigator.userAgent;
    const conn = navigator.connection;
    const tzOffsetH = -new Date().getTimezoneOffset() / 60;
    const has  = (value, format) => (value ? format(value) : 'Unknown');

    // Order matters: Edge's UA also says Chrome; Chrome's also says Safari
    const browser = ua.includes('Edg') ? 'Edge' : ua.includes('Chrome') ? 'Chrome'
                  : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Unknown';
    const os = ua.includes('Win') ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : ua.includes('Mac') ? 'macOS'
             : ua.includes('Android') ? 'Android' : ua.includes('Linux') ? 'Linux' : 'Unknown';

    set('tz',       `${Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace(/_/g, ' ')} (UTC${tzOffsetH >= 0 ? '+' : ''}${tzOffsetH})`);
    set('dev',      `${browser} / ${os}`);
    set('ua',       ua);
    set('conn',     conn ? (conn.effectiveType || '?').toUpperCase() + (conn.downlink ? ` — ${conn.downlink} Mbps` : '') : 'Unknown');
    set('rtt',      conn?.rtt !== undefined ? `${conn.rtt} ms RTT` : 'Unknown');
    set('online',   navigator.onLine ? 'Online' : 'Offline');
    set('langs',    (navigator.languages || [navigator.language]).slice(0, 4).join(', '));
    set('platform', navigator.platform || 'Unknown');
    set('cores',    has(navigator.hardwareConcurrency, n => `${n} logical cores`));
    set('mem',      has(navigator.deviceMemory, n => `${n} GB RAM`));
    set('disp',     `${screen.width} × ${screen.height}`);
    set('dpr',      has(window.devicePixelRatio, n => `${n}x DPR`));
    set('depth',    has(screen.colorDepth, n => `${n}-bit color`));
    set('orient',   screen.orientation?.type || 'Unknown');
    set('touch',    navigator.maxTouchPoints > 0 ? `Yes — ${navigator.maxTouchPoints} pts` : 'None');
    set('viewport', `${innerWidth} × ${innerHeight}`);
    set('cookies',  navigator.cookieEnabled ? 'Enabled' : 'Disabled');
    set('plugins',  `${navigator.plugins?.length || 0} detected`);
    set('storage',  typeof localStorage !== 'undefined' ? 'Available' : 'Blocked');
    set('webgl',    (() => { try { return document.createElement('canvas').getContext('webgl') ? 'Supported' : 'Unsupported'; } catch { return 'Unavailable'; } })());

    set('session',     'BSI-' + Math.random().toString(36).slice(2, 10).toUpperCase());
    set('time',        new Date().toISOString());
    set('ref',         document.referrer || 'Direct');
    set('history_len', `${history.length} pages`);
    set('route_depth', 'orphaned');   // the scripted sequence "fixes" this row

    set('bat', 'Unavailable');
    navigator.getBattery?.()
        .then(b => set('bat', `${Math.round(b.level * 100)}% ${b.charging ? '(Charging)' : '(On Battery)'}`))
        .catch(() => {});


    /* ── Fake ARG values ──
       fake1–10 read like data; fake11–25 are the big rows (name left, value
       right — scan.css .s-xl), all failure states. */

    ['NULL', 'UNREGISTERED', 'NOT FOUND', 'MISMATCH', 'FLAGGED', 'DRIFTING', 'EXPIRED', 'UNKNOWN',
     'PARTIAL', '0.34',
     'OVERRIDDEN', 'UNRESOLVED', 'SEVERED', 'CRITICAL', 'COLLAPSED', 'CLOSED', 'EXCEEDED',
     'DETECTED', 'CORRUPTED', 'NULL', 'REVOKED', 'FAILED', 'UNREACHABLE', 'TERMINAL', 'ABSENT',
    ].forEach((value, i) => set(`fake${i + 1}`, value));


    /* Session ID in the login screen's corner */
    document.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('sessionId');
        if (el) el.textContent = store.session;
    });

    return {
        get ready() { return store; },
        lookupNetwork,
    };
})();
