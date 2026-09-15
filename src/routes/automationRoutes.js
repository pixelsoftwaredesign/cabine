const express = require('express');
const Rule = require('../models/Rule');
const Cabin = require('../models/Cabin');
const { authMiddleware, requireAdminOr } = require('../middleware/auth');

const router = express.Router();

// Règles d'automatisation : partenaires + chaîne IT-IoT (agent / manager). ADMIN : tous les cas.
const RULE_ADMIN = requireAdminOr('PARTNER', 'IOT_AGENT', 'MANAGER');

router.post('/', authMiddleware, RULE_ADMIN, async (req, res) => {
  try {
    const { name, condition, action, resetAction, cabinId, enabled } = req.body;

    if (!name || !condition || !condition.field || !action || !action.device) {
      return res.status(400).json({ success: false, message: 'name, condition et action requis' });
    }

    if (cabinId) {
      const cabin = await Cabin.findById(cabinId);
      if (!cabin || (cabin.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN')) {
        return res.status(403).json({ success: false, message: 'Accès refusé à cette cabine' });
      }
    }

    const rule = await Rule.create({
      name,
      ownerId: req.user._id,
      cabinId: cabinId || null,
      condition,
      action,
      resetAction,
      enabled: enabled !== undefined ? enabled : true
    });

    return res.status(201).json({ success: true, rule });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', authMiddleware, RULE_ADMIN, async (req, res) => {
  try {
    const { cabinId } = req.query;
    const filter = { ownerId: req.user._id };
    if (cabinId) filter.cabinId = cabinId;

    const rules = await Rule.find(filter);
    return res.json({ success: true, rules });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:ruleId', authMiddleware, RULE_ADMIN, async (req, res) => {
  try {
    const rule = await Rule.findOne({ _id: req.params.ruleId, ownerId: req.user._id });
    if (!rule) return res.status(404).json({ success: false, message: 'Règle introuvable' });

    const { name, condition, action, resetAction, enabled } = req.body;
    if (name) rule.name = name;
    if (condition) rule.condition = condition;
    if (action) rule.action = action;
    if (resetAction !== undefined) rule.resetAction = resetAction;
    if (enabled !== undefined) rule.enabled = enabled;

    await rule.save();
    return res.json({ success: true, rule });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:ruleId', authMiddleware, async (req, res) => {
  try {
    const deleted = await Rule.findOneAndDelete({ _id: req.params.ruleId, ownerId: req.user._id });
    if (!deleted) return res.status(404).json({ success: false, message: 'Règle introuvable' });
    return res.json({ success: true, message: 'Règle supprimée' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;