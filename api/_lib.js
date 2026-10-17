// Logica condivisa da tutte le funzioni. I file che iniziano con "_" non diventano rotte.
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const DB_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const DB_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = new Redis({ url: DB_URL, token: DB_TOKEN });

// Avvolge ogni funzione: errori leggibili in JSON invece di una pagina 500 generica
const safe = fn => async (req, res) => {
    if (!DB_URL || !DB_TOKEN) {
        return res.status(500).json({ error: 'Database non collegato: mancano le variabili KV_REST_API_URL / KV_REST_API_TOKEN. Collega Upstash al progetto e fai Redeploy.' });
    }
    try { await fn(req, res); }
    catch (e) {
        console.error(e);   // il dettaglio resta nei log di Vercel, al client va un messaggio generico
        if (!res.headersSent) res.status(500).json({ error: 'Errore interno del server' });
    }
};

const STATE_KEY = 'scoreboard:state';
const EVENT_MS = 7000;          // quanto resta in onda il popup (cartellini / sostituzioni)
const logoKey = team => 'scoreboard:logo:' + team;

// start/end in minuti. INT e FIN non toccano il cronometro.
const PERIODS = {
    '1T':  { start: 0,   end: 45 },
    'INT': {},
    '2T':  { start: 45,  end: 90 },
    '1TS': { start: 90,  end: 105 },
    '2TS': { start: 105, end: 120 },
    'FIN': {}
};

const DEFAULT_STATE = {
    homeName: 'INT', awayName: 'MIL',
    homeScore: 0, awayScore: 0,
    period: '1T', injuryTime: 0,
    theme: 'seriea',            // 'seriea' | 'champions' | 'fut'
    wins: 0, losses: 0,         // record per la grafica FUT
    futShowMatch: true,         // mostra punteggio/tempo partita nella grafica FUT
    rev: 0,                     // versione dello stato: cresce a ogni scrittura
    event: null,                // ultimo popup: { id, type: 'yellow'|'red'|'sub', team, name | playerIn+playerOut, at }
    baseMs: 0, startedAt: null,
    // colori maglia (due per squadra) usati dai trattini/barre sotto il nome
    homeKit1: '#22d3ee', homeKit2: '#22d3ee',
    awayKit1: '#f59e0b', awayKit2: '#f59e0b',
    // un logo per squadra + uno per ogni competizione (resta salvato quando cambi grafica)
    hasLogo: { home: false, away: false, seriea: false, champions: false, fut: false },
    logoV: { home: 0, away: 0, seriea: 0, champions: 0, fut: 0 }
};

async function loadState() {
    const s = (await redis.get(STATE_KEY)) || {};
    return {
        ...DEFAULT_STATE, ...s,
        hasLogo: { ...DEFAULT_STATE.hasLogo, ...(s.hasLogo || {}) },
        logoV: { ...DEFAULT_STATE.logoV, ...(s.logoV || {}) }
    };
}
// Ogni scrittura aumenta "rev": i client la usano per scartare risposte vecchie arrivate in ritardo
const saveState = s => {
    s.rev = Math.max(Date.now(), (Number(s.rev) || 0) + 1);
    return redis.set(STATE_KEY, s);
};

const elapsedMs = s => s.baseMs + (s.startedAt ? Date.now() - s.startedAt : 0);

function setElapsed(s, ms) {
    s.baseMs = Math.max(0, Math.round(ms));
    if (s.startedAt) s.startedAt = Date.now();
}

function view(s) {
    const p = PERIODS[s.period] || {};
    // Il popup scade lato server: ageMs lo calcola il server, cosi' non servono orologi sincronizzati
    const age = s.event ? Date.now() - s.event.at : Infinity;
    const event = age < EVENT_MS ? { ...s.event, ageMs: age, durationMs: EVENT_MS } : null;
    return {
        event,
        homeName: s.homeName, awayName: s.awayName,
        homeScore: s.homeScore, awayScore: s.awayScore,
        period: s.period, injuryTime: s.injuryTime,
        homeKit1: s.homeKit1, homeKit2: s.homeKit2, awayKit1: s.awayKit1, awayKit2: s.awayKit2,
        rev: s.rev,
        theme: s.theme, wins: s.wins, losses: s.losses, futShowMatch: s.futShowMatch,
        elapsedMs: elapsedMs(s), running: !!s.startedAt,
        periodStart: p.start ?? null, periodEnd: p.end ?? null,
        hasLogo: s.hasLogo, logoV: s.logoV
    };
}

const THEMES = ['seriea', 'champions', 'fut'];
const isColor = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const clamp = (v, min, max) => Math.min(max, Math.max(min, parseInt(v, 10) || 0));
const cleanName = v => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, 20);
const cleanPlayer = v => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, 28);

function parseBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

// ---------------------------------------------------------------- AUTENTICAZIONE
// La password NON e' nel codice: sta nella variabile d'ambiente ADMIN_PASSWORD su Vercel.
function sha(x) { return crypto.createHash('sha256').update(String(x)).digest(); }

async function requireAdmin(req, res) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
        res.status(500).json({ error: 'ADMIN_PASSWORD non configurata su Vercel' });
        return false;
    }
    const given = req.headers['x-admin-password'] || '';
    // Password giusta: nessun comando Redis in piu'.
    if (crypto.timingSafeEqual(sha(given), sha(expected))) return true;

    // Password errata: conta il tentativo (INCR + EXPIRE NX in un solo round-trip).
    // x-vercel-forwarded-for lo imposta Vercel e il client non puo' falsificarlo.
    const ip = String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
    const rlKey = 'scoreboard:fail:' + ip;
    const [fails] = await redis.pipeline().incr(rlKey).expire(rlKey, 600, 'NX').exec();
    if (Number(fails) > 15) {
        res.status(429).json({ error: 'Troppi tentativi. Riprova tra qualche minuto.' });
    } else {
        res.status(401).json({ error: 'Password errata' });
    }
    return false;
}

function onlyMethods(req, res, methods) {
    if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        res.status(405).json({ error: 'Metodo non consentito' });
        return false;
    }
    return true;
}

module.exports = {
    safe, redis, PERIODS, loadState, saveState, elapsedMs, setElapsed, view,
    EVENT_MS, THEMES, isColor, clamp, cleanName, cleanPlayer, parseBody, requireAdmin, onlyMethods, logoKey
};
