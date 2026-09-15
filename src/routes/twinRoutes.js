const express = require('express');
const Cabin = require('../models/Cabin');
const TwinElement = require('../models/TwinElement');
const { authMiddleware, requireAdminOr } = require('../middleware/auth');
const { DEFAULT_ELEMENTS } = require('../services/twinService');
const mqttClient = require('../config/mqtt');

const router = express.Router();

// Hiérarchie IT / IoT :
// - Développeur : DEVELOPER     → exécute (pilotage éléments, alarmes, simulation, self-test)
// - Agent       : IOT_AGENT      → supervise (seed du jumeau, installation)
// - Manager     : MANAGER        → supervise tout le parc IoT
// - Partenaire  : PARTNER        → installeurs conservent leurs droits
// - ADMIN       : tous les cas (requireAdminOr)
const IOT_EXEC = requireAdminOr('DEVELOPER', 'IOT_AGENT', 'MANAGER', 'PARTNER');
const IOT_SUPER = requireAdminOr('IOT_AGENT', 'MANAGER', 'PARTNER');

const pushHistory = (el, status, value) => {
  el.history.push({ ts: new Date(), status, value: value ?? null });
  if (el.history.length > 60) el.history = el.history.slice(-60);
};

// Liste des éléments du jumeau
router.get('/elements', authMiddleware, async (req, res) => {
  try {
    const q = {};
    if (req.query.cabinSerial) q.cabinSerial = req.query.cabinSerial;
    if (req.query.status) q.status = req.query.status;
    if (req.query.type) q.type = req.query.type;
    const items = await TwinElement.find(q).sort({ cabinSerial: 1, type: 1 });
    return res.json({ success: true, elements: items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Détail d'un élément par GUID
router.get('/elements/:guid', authMiddleware, async (req, res) => {
  try {
    const el = await TwinElement.findOne({ guid: req.params.guid });
    if (!el) return res.status(404).json({ success: false, message: 'Élément introuvable' });
    return res.json({ success: true, element: el });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Mise à jour pilotée par un opérateur (pré-twin)
router.patch('/elements/:id', authMiddleware, IOT_EXEC, async (req, res) => {
  try {
    const el = await TwinElement.findById(req.params.id);
    if (!el) return res.status(404).json({ success: false, message: 'Élément introuvable' });
    const { status, value } = req.body;
    if (status !== undefined) { pushHistory(el, status, value); el.status = status; }
    if (value !== undefined && status === undefined) el.value = { ...(el.value || {}), ...value };
    el.markModified('history');
    await el.save();
    return res.json({ success: true, element: el });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Résolution d'une alarme
router.post('/alarms/:id/resolve', authMiddleware, IOT_EXEC, async (req, res) => {
  try {
    const el = await TwinElement.findById(req.params.id);
    if (!el) return res.status(404).json({ success: false, message: 'Élément introuvable' });
    const target = el.type === 'LOCK' || el.type === 'DOOR' ? 'CLOSED' : (el.type === 'SENSOR' ? 'OK' : 'OFF');
    pushHistory(el, target, el.value);
    el.status = target;
    el.markModified('history');
    await el.save();
    return res.json({ success: true, element: el });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Synthèse par unité (bâtiments virtuels du jumeau)
router.get('/units', authMiddleware, async (req, res) => {
  try {
    const cabins = await Cabin.find().select('serialNumber name factoryStatus');
    const elements = await TwinElement.find().select('cabinSerial status type');
    const twin = {};
    elements.forEach((e) => {
      const r = twin[e.cabinSerial] || (twin[e.cabinSerial] = { total: 0, ok: 0, alarms: 0 });
      r.total++;
      if (e.status === 'ALARM') r.alarms++;
      else r.ok++;
    });
    const units = cabins.map((c) => ({
      _id: c._id,
      serialNumber: c.serialNumber,
      name: c.name,
      factoryStatus: c.factoryStatus,
      twin: twin[c.serialNumber] || { total: 0, ok: 0, alarms: 0 }
    }));
    return res.json({ success: true, units });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Amorçage (seed) des éléments canoniques d'une cabine
router.post('/seed', authMiddleware, IOT_SUPER, async (req, res) => {
  try {
    const { cabinSerial } = req.body;
    const cabin = await Cabin.findOne({ serialNumber: cabinSerial });
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    const results = [];
    for (const d of DEFAULT_ELEMENTS(cabinSerial)) {
      d.cabinSerial = cabinSerial;
      const existing = await TwinElement.findOne({ guid: d.guid });
      if (existing) { results.push({ guid: d.guid, created: false }); continue; }
      d.topic = `cabine/${cabinSerial}/twin/${d.guid}`;
      await TwinElement.create(d);
      results.push({ guid: d.guid, created: true });
    }
    return res.status(201).json({ success: true, message: `Jumeau amorcé : ${results.filter((r) => r.created).length} éléments créés`, seeds: results });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Alarme simulée (dispositif 3D → flux)
router.post('/simulate', authMiddleware, IOT_EXEC, async (req, res) => {
  try {
    const { cabinSerial, guid, status, value } = req.body;
    if (!cabinSerial || !guid) return res.status(400).json({ success: false, message: 'cabinSerial et guid requis' });
    const el = await TwinElement.findOne({ guid });
    if (!el) return res.status(404).json({ success: false, message: 'Élément introuvable' });
    const topic = `cabine/${cabinSerial}/twin/${guid}`;
    mqttClient.publish(topic, JSON.stringify({ status, value, ts: new Date().toISOString() }), { retain: true });
    return res.json({ success: true, message: 'Flux télémétrique publié', topic });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;