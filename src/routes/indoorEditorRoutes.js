const express = require('express');
const IndoorLayout = require('../models/IndoorLayout');

const router = express.Router();

function toJSON(doc) {
  return {
    engine: doc.engine,
    floorId: doc.floorId,
    plan: doc.plan,
    walls: doc.walls.map((w) => ({ start: w.start, end: w.end })),
    cabins: doc.cabins.map((c) => ({
      cabinId: c.cabinId,
      code: c.code,
      type: c.type,
      title: c.title,
      position: c.position,
      dimension: c.dimension,
      status: c.status,
      iot: c.iot
    })),
    savedAt: (doc.savedAt || doc.updatedAt).toISOString()
  };
}

// GET /api/map/editor/layout?floorId=NIVEAU_1_SOUSSE
router.get('/layout', async (req, res) => {
  try {
    const floorId = String(req.query.floorId || '').trim();
    if (!floorId) return res.status(400).json({ error: 'Paramètre floorId requis (ex: NIVEAU_1_SOUSSE)' });
    const doc = await IndoorLayout.findOne({ floorId });
    if (!doc) return res.status(404).json({ error: 'Plan introuvable pour le niveau ' + floorId });
    res.json({ layout: toJSON(doc) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/map/editor/layout  { floorId, layout }
router.post('/layout', async (req, res) => {
  try {
    const body = req.body || {};
    const floorId = String(body.floorId || '').trim();
    if (!floorId || floorId.length > 80) return res.status(400).json({ error: 'floorId invalide' });
    const layout = body.layout || {};
    if (!layout || typeof layout !== 'object') return res.status(400).json({ error: 'layout invalide' });

    const payload = {
      floorId,
      engine: layout.engine || 'PixMaps Editor v2.0',
      plan: {
        width: Number(layout.plan && layout.plan.width) || 40,
        height: Number(layout.plan && layout.plan.height) || 30,
        unit: (layout.plan && layout.plan.unit) || 'm',
        grid: Number((layout.plan && layout.plan.grid) || 0.5) || 0.5
      },
      walls: Array.isArray(layout.walls)
        ? layout.walls.map((w) => ({
            start: { x: Number((w.start || {}).x) || 0, y: Number((w.start || {}).y) || 0 },
            end: { x: Number((w.end || {}).x) || 0, y: Number((w.end || {}).y) || 0 }
          }))
        : [],
      cabins: Array.isArray(layout.cabins)
        ? layout.cabins.map((c) => ({
            cabinId: String(c.cabinId || c.id || ''),
            code: String(c.code || ''),
            type: String(c.type || 'CABIN_SOLO'),
            title: String(c.title || ''),
            position: {
              x: Number((c.position || {}).x) || 0,
              y: Number((c.position || {}).y) || 0,
              rotation: Number((c.position || {}).rotation) || 0,
              unit: ((c.position || {}).unit) || 'm'
            },
            dimension: {
              w: Number((c.dimension || {}).w) || 1,
              h: Number((c.dimension || {}).h) || 1
            },
            status: String(c.status || 'AVAILABLE'),
            iot: !!c.iot
          }))
        : [],
      savedAt: new Date()
    };

    const doc = await IndoorLayout.findOneAndUpdate({ floorId }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ saved: true, floorId, updatedAt: doc.updatedAt.toISOString(), cabins: doc.cabins.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/map/editor/layout/:floorId
router.delete('/layout/:floorId', async (req, res) => {
  try {
    const deleted = await IndoorLayout.findOneAndDelete({ floorId: req.params.floorId });
    if (!deleted) return res.status(404).json({ error: 'Plan introuvable' });
    res.json({ deleted: true, floorId: req.params.floorId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;