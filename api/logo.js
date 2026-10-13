// team: home | away | center (logo centrale/competizione)
// GET    /api/logo?team=home          -> immagine PNG (pubblico)
// POST   /api/logo  {team, dataUrl}   -> carica il logo (admin)
// DELETE /api/logo?team=home          -> rimuove il logo (admin)
const { safe, redis, loadState, saveState, view, parseBody, requireAdmin, onlyMethods, logoKey } = require('./_lib');

const MAX_DATAURL = 700 * 1024; // il limite di una richiesta Redis gratuita e' 1 MB
const PREFIX = 'data:image/png;base64,';
const validTeam = t => t === 'home' || t === 'away' || t === 'center';

module.exports = safe(async (req, res) => {
    if (!onlyMethods(req, res, ['GET', 'POST', 'DELETE'])) return;

    if (req.method === 'GET') {
        const team = req.query.team;
        if (!validTeam(team)) return res.status(400).end();
        const dataUrl = await redis.get(logoKey(team));
        if (!dataUrl || typeof dataUrl !== 'string') return res.status(404).end();
        res.setHeader('Content-Type', 'image/png');
        // L'URL cambia (?v=...) a ogni nuovo upload, quindi puo' stare in cache a lungo
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.status(200).send(Buffer.from(dataUrl.slice(PREFIX.length), 'base64'));
    }

    if (!(await requireAdmin(req, res))) return;

    if (req.method === 'POST') {
        const { team, dataUrl } = parseBody(req);
        if (!validTeam(team)) return res.status(400).json({ error: 'Squadra non valida' });
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX)) {
            return res.status(415).json({ error: 'Serve un PNG' });
        }
        if (dataUrl.length > MAX_DATAURL) return res.status(413).json({ error: 'Logo troppo pesante' });
        const buf = Buffer.from(dataUrl.slice(PREFIX.length), 'base64');
        const isPng = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
        if (!isPng) return res.status(415).json({ error: 'File PNG non valido' });

        await redis.set(logoKey(team), dataUrl);
        const s = await loadState();
        s.hasLogo[team] = true; s.logoV[team] = Date.now();
        await saveState(s);
        return res.status(200).json(view(s));
    }

    // DELETE
    const team = req.query.team;
    if (!validTeam(team)) return res.status(400).json({ error: 'Squadra non valida' });
    await redis.del(logoKey(team));
    const s = await loadState();
    s.hasLogo[team] = false; s.logoV[team] = Date.now();
    await saveState(s);
    res.status(200).json(view(s));
});
