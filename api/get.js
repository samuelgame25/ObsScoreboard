// Pubblica: serve a OBS per leggere lo stato. Non modifica nulla.
const { loadState, view, onlyMethods } = require('./_lib');

module.exports = async (req, res) => {
    if (!onlyMethods(req, res, ['GET'])) return;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(view(await loadState()));
};
