const express = require('express');
const Cabin = require('../models/Cabin');
const HousekeepingTask = require('../models/HousekeepingTask');
const { authMiddleware, requireAdminOr } = require('../middleware/auth');
const { generateAccessCode } = require('../services/accessService');
const { HOUSEKEEPING_CHECKLIST } = require('../config/factory');
const { publishCommand } = require('../services/mqttService');

const router = express.Router();

const CHECKLIST_COPY = () => HOUSEKEEPING_CHECKLIST.map((c) => ({ key: c.key, label: c.label, done: false }));

// Hiérarchie Housekeeping :
// - Agent            : HOUSEKEEPER          → exécute (start / step / complete)
// - Agent gouvernant : HOUSEKEEPER_GOVERNANT → planifie + valide la qualité (review)
// - Manager          : MANAGER              → planifie + supervise les revues
// - ADMIN            : tous les cas (requireAdminOr)
const AGENT = requireAdminOr('HOUSEKEEPER', 'HOUSEKEEPER_GOVERNANT');
const PLAN = requireAdminOr('HOUSEKEEPER', 'HOUSEKEEPER_GOVERNANT', 'MANAGER');
const REVIEW = requireAdminOr('HOUSEKEEPER_GOVERNANT', 'MANAGER');

// Vue d'ensemble du parc pour le manager
router.get('/parc', authMiddleware, async (req, res) => {
  try {
    const cabins = await Cabin.find().select('name serialNumber status housekeepingState rooms');
    return res.json({
      success: true,
      cabins: cabins.map((c) => ({
        _id: c._id,
        name: c.name,
        serialNumber: c.serialNumber,
        status: c.status,
        housekeepingState: c.housekeepingState,
        rooms: c.rooms
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/tasks', authMiddleware, async (req, res) => {
  try {
    const { status, cabinId } = req.query;
    const query = {};
    if (status) query.status = status;
    if (cabinId) query.cabinId = cabinId;
    const tasks = await HousekeepingTask.find(query).sort({ createdAt: -1 }).limit(200);
    return res.json({ success: true, tasks });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/tasks', authMiddleware, PLAN, async (req, res) => {
  try {
    const { cabinId, assignedAgent, priority, scheduledAt } = req.body;
    const cabin = await Cabin.findById(cabinId);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    if (cabin.status !== 'CLEANING_REQUIRED') cabin.status = 'CLEANING_REQUIRED';
    cabin.housekeepingState = 'DIRTY';
    await cabin.save();

    const task = await HousekeepingTask.create({
      cabinId,
      cabinSerial: cabin.serialNumber,
      assignedAgent: assignedAgent || '',
      priority: priority || 'MEDIUM',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      checklist: CHECKLIST_COPY()
    });

    return res.status(201).json({ success: true, task });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// L'agent démarre : génération PIN temporaire + ouverture + lumière de travail
router.post('/tasks/:id/start', authMiddleware, AGENT, async (req, res) => {
  try {
    const task = await HousekeepingTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Tâche introuvable' });

    const cabin = await Cabin.findById(task.cabinId);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    const accessCode = generateAccessCode();
    task.accessCode = accessCode;
    task.status = 'IN_PROGRESS';
    task.startedAt = new Date();
    await task.save();

    cabin.housekeepingState = 'IN_PROGRESS';
    await cabin.save();

    publishCommand(cabin.serialNumber, 'lock', 'UNLOCK');
    publishCommand(cabin.serialNumber, 'lighting', 'ON');

    return res.json({ success: true, task, message: 'Mode service activé', accessCode });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Métadonnées de checklist disponibles
router.get('/checklist', (req, res) => res.json({ success: true, checklist: HOUSEKEEPING_CHECKLIST }));

// L'agent coche une étape
router.post('/tasks/:id/step', authMiddleware, AGENT, async (req, res) => {
  try {
    const { key, done } = req.body;
    const task = await HousekeepingTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Tâche introuvable' });

    const item = task.checklist.find((c) => c.key === key);
    if (!item) return res.status(404).json({ success: false, message: 'Étape inconnue' });
    item.done = !!done;
    await task.save();
    return res.json({ success: true, task });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

const STANDBY_SEQUENCE = () => [
  { t: 0, fn: (serial) => publishCommand(serial, 'lock', 'LOCK') },
  { t: 400, fn: (serial) => publishCommand(serial, 'lighting', 'OFF') }
];

// L'agent termine : photos de preuve + remise en location
router.post('/tasks/:id/complete', authMiddleware, AGENT, async (req, res) => {
  try {
    const { proofPhotos, notes } = req.body;
    const task = await HousekeepingTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Tâche introuvable' });

    const cabin = await Cabin.findById(task.cabinId);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    if (!proofPhotos || !proofPhotos.length) {
      return res.status(400).json({ success: false, message: 'Photos de preuve requises' });
    }

    task.status = 'COMPLETED';
    task.completedAt = new Date();
    task.photos = proofPhotos;
    if (notes) task.notes = notes;
    task.completedBy = req.user.name || req.user.email; // attribution « checked by »
    task.assignedAgent = task.assignedAgent || task.completedBy;
    await task.save();

    cabin.status = 'AVAILABLE';
    cabin.housekeepingState = 'CLEAN';
    await cabin.save();

    STANDBY_SEQUENCE().forEach((s) => setTimeout(() => s.fn(cabin.serialNumber), s.t));

    return res.json({
      success: true,
      message: 'Nettoyage validé. La cabine est de nouveau disponible.',
      cabinStatus: cabin.status,
      checkedBy: task.completedBy
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Contrôle qualité réalisé par l'agent gouvernant / manager / admin :
// note sur 5, approbation ou refus (la tâche repasse alors en REJECTED).
router.post('/tasks/:id/review', authMiddleware, REVIEW, async (req, res) => {
  try {
    const { qualityScore, approved, comment } = req.body;
    const score = Number(qualityScore);
    if (Number.isNaN(score) || score < 0 || score > 5) {
      return res.status(400).json({ success: false, message: 'qualityScore (0-5) requis' });
    }

    const task = await HousekeepingTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Tâche introuvable' });
    if (task.status !== 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Seule une tâche complétée peut être relue' });
    }

    task.qualityScore = score;
    task.reviewedBy = req.user.name || req.user.email;
    task.reviewedAt = new Date();
    task.approved = !!approved;
    if (comment) task.notes = task.notes ? `${task.notes}\nReview: ${comment}` : `Review: ${comment}`;

    if (approved) {
      await task.save();
      return res.json({
        success: true,
        message: `Tâche approuvée (note ${score}/5) par ${task.reviewedBy}`,
        task
      });
    }

    task.status = 'REJECTED';
    await task.save();

    const cabin = await Cabin.findById(task.cabinId);
    if (cabin) {
      cabin.housekeepingState = 'DIRTY';
      if (cabin.status === 'AVAILABLE') cabin.status = 'CLEANING_REQUIRED';
      await cabin.save();
    }

    return res.json({
      success: true,
      message: `Tâche refusée (note ${score}/5) — nettoyage à reprendre`,
      task,
      cabinStatus: cabin ? cabin.status : undefined
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;