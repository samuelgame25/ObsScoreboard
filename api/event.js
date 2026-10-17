// Popup in basso a sinistra su OBS: cartellini e sostituzioni.
// POST {type:'yellow'|'red', team:'home'|'away', name}
// POST {type:'sub',          team:'home'|'away', playerIn, playerOut}
// POST {action:'hide'}  -> toglie subito il popup
const { safe, loadState, saveState, view, cleanPlayer, parseBody, requireAdmin, onlyMethods } = require('./_lib');

module.exports = safe(async (req, res) => {
    if (!onlyMethods(req, res, ['POST'])) return;
    if (!(await requireAdmin(req, res))) return;
    const d = parseBody(req);
    const s = await loadState();

    if (d.action === 'hide') {
        s.event = null;
        await saveState(s);
        return res.status(200).json(view(s));
    }

    if (!['yellow', 'red', 'sub'].includes(d.type)) return res.status(400).json({ error: 'Tipo di evento non valido' });
    if (!['home', 'away'].includes(d.team)) return res.status(400).json({ error: 'Squadra non valida' });

    const ev = { id: Math.max(Date.now(), (s.event?.id || 0) + 1), type: d.type, team: d.team, at: Date.now() };
    if (d.type === 'sub') {
        ev.playerIn = cleanPlayer(d.playerIn);
        ev.playerOut = cleanPlayer(d.playerOut);
        if (!ev.playerIn || !ev.playerOut) return res.status(400).json({ error: 'Inserisci chi entra e chi esce' });
    } else {
        ev.name = cleanPlayer(d.name);
        if (!ev.name) return res.status(400).json({ error: 'Inserisci il nome del giocatore' });
    }
    s.event = ev;
    await saveState(s);
    res.status(200).json(view(s));
});
