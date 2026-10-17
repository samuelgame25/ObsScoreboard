// Pubblica: serve a OBS per leggere lo stato. Non modifica nulla.
const { safe, loadState, view, onlyMethods } = require('./_lib');

module.exports = safe(async (req, res) => {
    if (!onlyMethods(req, res, ['GET'])) return;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(view(await loadState()));
});
