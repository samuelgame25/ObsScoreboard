// Il cronometro non conta secondo per secondo: si salvano baseMs (tempo accumulato)
// e startedAt (quando e' partito). Tempo reale = baseMs + (adesso - startedAt).
const { PERIODS, loadState, saveState, elapsedMs, setElapsed, view, clamp, parseBody, requireAdmin, onlyMethods } = require('./_lib');

module.exports = async (req, res) => {
    if (!onlyMethods(req, res, ['POST'])) return;
    if (!(await requireAdmin(req, res))) return;
    const d = parseBody(req);
    const s = await loadState();

    switch (d.action) {
        case 'start':
            if (!s.startedAt) s.startedAt = Date.now();
            break;
        case 'pause':
            s.baseMs = elapsedMs(s); s.startedAt = null;
            break;
        case 'toggle':
            if (s.startedAt) { s.baseMs = elapsedMs(s); s.startedAt = null; }
            else s.startedAt = Date.now();
            break;
        case 'reset': {
            const p = PERIODS[s.period] || {};
            s.baseMs = (p.start ?? 0) * 60000;
            s.startedAt = null;
            s.injuryTime = 0;
            break;
        }
        case 'set':
            setElapsed(s, (clamp(d.minutes, 0, 150) * 60 + clamp(d.seconds, 0, 59)) * 1000);
            break;
        case 'adjust':
            setElapsed(s, elapsedMs(s) + (parseInt(d.deltaSec, 10) || 0) * 1000);
            break;
        case 'period': {
            const p = PERIODS[d.period];
            if (!p) return res.status(400).json({ error: 'Periodo non valido' });
            s.baseMs = p.start !== undefined ? p.start * 60000 : elapsedMs(s);
            s.period = d.period;
            s.startedAt = null;
            s.injuryTime = 0;
            break;
        }
        default:
            return res.status(400).json({ error: 'Azione sconosciuta' });
    }
    await saveState(s);
    res.status(200).json(view(s));
};
