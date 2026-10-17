const { safe, loadState, saveState, view, clamp, parseBody, requireAdmin, onlyMethods } = require('./_lib');

module.exports = safe(async (req, res) => {
    if (!onlyMethods(req, res, ['POST'])) return;
    if (!(await requireAdmin(req, res))) return;
    const d = parseBody(req);
    const s = await loadState();
    const KEYS = { home: 'homeScore', away: 'awayScore', wins: 'wins', losses: 'losses' };
    if (!KEYS[d.team]) return res.status(400).json({ error: 'Campo team non valido' });
    const key = KEYS[d.team];
    s[key] = clamp(s[key] + (parseInt(d.delta, 10) || 0), 0, 99);
    await saveState(s);
    res.status(200).json(view(s));
});
