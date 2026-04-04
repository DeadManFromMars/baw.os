/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   data.js  —  SESSION DATA COLLECTION
   Gathers real browser/device fingerprint data and fake ARG values.
   All collected values live in the DataStore object, which is
   read by scan.js to populate the scan line display.

   WHY SEPARATE?
   Keeping data collection isolated means:
     - scan.js doesn't need to know how values are fetched
     - data.js doesn't know what the UI looks like
     - Easy to add/remove data points without touching either

   REAL DATA:
   Fetches IP, geolocation, and ISP from public APIs.
   Browser/device/hardware properties read from navigator APIs.
   All reads are synchronous except the IP fetch (which is async).

   FAKE DATA:
   Hardcoded "classified" values for the ARG narrative.
   These look like data fields but mean nothing — they're flavour.

   USAGE:
     DataStore.ready['ip']       // the collected IP address
     DataStore.set('foo', 'bar') // add a value (used internally)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DataStore = (() => {

    // The store — a plain object keyed by field name.
    // scan.js reads from this using def.id as the key.
    const store = {};

    /* ── Internal setter ──
       Using a function (rather than direct assignment) lets us
       add logging, validation, or reactivity later without
       touching every call site. */
    function set(id, value) {
        store[id] = value;
    }


    /* ════════════════════════════════════════════════════════
       ASYNC: IP + GEOLOCATION
       Two-step fetch: get IP first, then use it for geo lookup.
       On failure, populate with placeholder strings so the scan
       lines still resolve (just show dashes instead of crashing).
    ════════════════════════════════════════════════════════ */

    fetch('https://api.ipify.org?format=json')
        .then(r => r.json())
        .then(d => {
            set('ip', d.ip);
            return fetch(`https://ipapi.co/${d.ip}/json/`);
        })
        .then(r => r.json())
        .then(d => {
            set('loc',          [d.city, d.country_name].filter(Boolean).join(', ') || 'Unknown');
            set('isp',          d.org                        || 'Unknown');
            set('postal',       d.postal                     || 'Unknown');
            set('asn',          d.asn                        || 'Unknown');
            set('region',       d.region                     || 'Unknown');
            set('currency',     d.currency                   || 'Unknown');
            set('calling',      d.country_calling_code       || 'Unknown');
            set('country_area', d.country_area
                ? d.country_area.toLocaleString() + ' km²'
                : 'Unknown');
            set('country_pop',  d.country_population
                ? Number(d.country_population).toLocaleString()
                : 'Unknown');
        })
        .catch(() => {
            /* Network failure or API rate limit.
               Fill every geo field with a consistent fallback. */
            const geoFields = ['ip', 'loc', 'isp', 'postal', 'asn', 'region',
                               'currency', 'calling', 'country_area', 'country_pop'];
            for (const k of geoFields) {
                set(k, k === 'ip' ? 'Masked / VPN' : '—');
            }
        });


    /* ════════════════════════════════════════════════════════
       SYNC: TIMEZONE
    ════════════════════════════════════════════════════════ */

    const tz        = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzOffset  = -new Date().getTimezoneOffset();  // minutes from UTC
    const tzSign    = tzOffset >= 0 ? '+' : '';
    const tzHours   = Math.floor(Math.abs(tzOffset) / 60);
    set('tz', `${tz.split('/').pop().replace(/_/g, ' ')} (UTC${tzSign}${tzHours})`);


    /* ════════════════════════════════════════════════════════
       SYNC: BROWSER + OS
    ════════════════════════════════════════════════════════ */

    const ua = navigator.userAgent;

    // Detect browser — order matters: Edge contains 'Chrome', so check Edge first
    const browser = ua.includes('Edg')     ? 'Edge'
                  : ua.includes('Chrome')  ? 'Chrome'
                  : ua.includes('Firefox') ? 'Firefox'
                  : ua.includes('Safari')  ? 'Safari'
                  : 'Unknown';

    const os = ua.includes('Win')                         ? 'Windows'
             : ua.includes('Mac')                         ? 'macOS'
             : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS'
             : ua.includes('Android')                     ? 'Android'
             : ua.includes('Linux')                       ? 'Linux'
             : 'Unknown';

    set('dev', `${browser} / ${os}`);
    set('ua',  navigator.userAgent.slice(0, 52) + '...');


    /* ════════════════════════════════════════════════════════
       SYNC: NETWORK
    ════════════════════════════════════════════════════════ */

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    set('conn', conn
        ? (conn.effectiveType || '?').toUpperCase() + (conn.downlink ? ` — ${conn.downlink} Mbps` : '')
        : 'Unknown');
    set('rtt', conn?.rtt !== undefined ? conn.rtt + ' ms RTT' : 'Unknown');
    set('online', navigator.onLine ? 'Online' : 'Offline');


    /* ════════════════════════════════════════════════════════
       SYNC: HARDWARE + DISPLAY
    ════════════════════════════════════════════════════════ */

    set('locale',    navigator.language               || 'Unknown');
    set('langs',     (navigator.languages || [navigator.language]).slice(0, 4).join(', '));
    set('platform',  navigator.platform               || 'Unknown');
    set('cores',     navigator.hardwareConcurrency
                         ? navigator.hardwareConcurrency + ' logical cores'
                         : 'Unknown');
    set('mem',       navigator.deviceMemory
                         ? navigator.deviceMemory + ' GB RAM'
                         : 'Unknown');
    set('disp',      `${screen.width} × ${screen.height}`);
    set('dpr',       window.devicePixelRatio          ? window.devicePixelRatio + 'x DPR'  : 'Unknown');
    set('depth',     screen.colorDepth                ? screen.colorDepth + '-bit color'    : 'Unknown');
    set('orient',    screen.orientation?.type         || 'Unknown');
    set('touch',     navigator.maxTouchPoints > 0     ? `Yes — ${navigator.maxTouchPoints} pts` : 'None');
    set('viewport',  `${window.innerWidth} × ${window.innerHeight}`);


    /* ════════════════════════════════════════════════════════
       SYNC: BROWSER CAPABILITIES
    ════════════════════════════════════════════════════════ */

    set('cookies', navigator.cookieEnabled ? 'Enabled' : 'Disabled');
    set('plugins', navigator.plugins?.length
                       ? navigator.plugins.length + ' detected'
                       : '0 detected');
    set('storage', typeof localStorage !== 'undefined' ? 'Available' : 'Blocked');

    // WebGL support — wrapped in try/catch because some security settings throw
    set('webgl', (() => {
        try {
            return document.createElement('canvas').getContext('webgl')
                ? 'Supported'
                : 'Unsupported';
        } catch {
            return 'Unavailable';
        }
    })());


    /* ════════════════════════════════════════════════════════
       SYNC: SESSION METADATA
    ════════════════════════════════════════════════════════ */

    set('session',      'BSI-' + Math.random().toString(36).substr(2, 8).toUpperCase());
    set('time',         new Date().toISOString());
    set('ref',          document.referrer || 'Direct');
    set('history_len',  history.length + ' pages');
    set('route_depth',  'orphaned');   // intentionally flagged — the conductor will "fix" this


    /* ════════════════════════════════════════════════════════
       ASYNC: BATTERY
       getBattery() is async and not available everywhere.
    ════════════════════════════════════════════════════════ */

    set('bat',      'Unavailable');
    set('charging', 'Unknown');

    if (navigator.getBattery) {
        navigator.getBattery()
            .then(b => {
                set('bat',      Math.round(b.level * 100) + '% ' + (b.charging ? '(Charging)' : '(On Battery)'));
                set('charging', b.charging ? 'Yes' : 'No');
            })
            .catch(() => { /* getBattery may be blocked in some browsers */ });
    }


    /* ════════════════════════════════════════════════════════
       FAKE ARG DATA
       These look like real surveillance metrics but are
       entirely fabricated for the ARG narrative. Values are
       hardcoded because they're always "classified" or "broken".
    ════════════════════════════════════════════════════════ */

    const fakeFields = {
        fake1:  'NULL',          fake2:  'UNREGISTERED',  fake3:  'NOT FOUND',
        fake4:  'MISMATCH',      fake5:  'FLAGGED',        fake6:  'DRIFTING',
        fake7:  'EXPIRED',       fake8:  'UNKNOWN',        fake9:  'PARTIAL',
        fake10: '0.34',          fake11: 'INACTIVE',       fake12: 'CLASSIFIED',
        fake13: 'SEVERED',       fake14: '7.4 / 10',       fake15: 'DEGRADED',
        fake16: '72h',           fake17: '0.91',           fake18: 'DETECTED',
        fake19: '0x4F3A',        fake20: 'NULL',           fake21: 'REVOKED',
        fake22: 'IMMINENT',      fake23: 'DEEP',           fake24: 'ACTIVE',
        fake25: 'LOST',
    };

    for (const [k, v] of Object.entries(fakeFields)) set(k, v);


    /* ════════════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════════════ */

    return {
        /* The raw store — scan.js reads values directly from here.
           Read-only outside this module (we never expose set()). */
        get ready() { return store; },

        /* Check if a specific field has been populated yet.
           Useful for async fields like 'ip' or 'bat'. */
        has(id) { return id in store; },
    };

})();


/* ── Populate session ID in the login HUD ──────────────────────
   The session ID is synchronously generated above, but the DOM
   might not be ready yet when this file first runs. Use
   DOMContentLoaded to be safe. */
document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('sessionId');
    if (el) el.textContent = DataStore.ready['session'] || 'BSI-——';
});
