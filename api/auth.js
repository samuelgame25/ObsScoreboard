// Controlla solo se la password e' corretta (usata dal login del pannello).
const { requireAdmin, onlyMethods } = require('./_lib');

module.exports = async (req, res) => {
    if (!onlyMethods(req, res, ['POST'])) return;
    if (!(await requireAdmin(req, res))) return;
    res.status(200).json({ ok: true });
};
