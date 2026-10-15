const { safe, loadState, saveState, view, THEMES, isColor, clamp, cleanName, parseBody, requireAdmin, onlyMethods } = require('./_lib');

module.exports = safe(async (req, res) => {
    if (!onlyMethods(req, res, ['POST'])) return;
    if (!(await requireAdmin(req, res))) return;
    const d = parseBody(req);
    const s = await loadState();
    if (d.homeName !== undefined) s.homeName = cleanName(d.homeName);
    if (d.awayName !== undefined) s.awayName = cleanName(d.awayName);
    if (d.homeScore !== undefined) s.homeScore = clamp(d.homeScore, 0, 99);
    if (d.awayScore !== undefined) s.awayScore = clamp(d.awayScore, 0, 99);
    if (d.injuryTime !== undefined) s.injuryTime = clamp(d.injuryTime, 0, 30);
    for (const k of ['homeKit1', 'homeKit2', 'awayKit1', 'awayKit2']) {
        if (isColor(d[k])) s[k] = d[k].toLowerCase();
    }
    if (THEMES.includes(d.theme)) s.theme = d.theme;
    if (d.wins !== undefined) s.wins = clamp(d.wins, 0, 99);
    if (d.losses !== undefined) s.losses = clamp(d.losses, 0, 99);
    if (d.futShowMatch !== undefined) s.futShowMatch = !!d.futShowMatch;
    await saveState(s);
    res.status(200).json(view(s));
});
