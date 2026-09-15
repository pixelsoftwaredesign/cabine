const express = require('express');
const Cabin = require('../models/Cabin');
const MaintenanceTicket = require('../models/MaintenanceTicket');
const { authMiddleware, requireAdminOr } = require('../middleware/auth');

const router = express.Router();

// Hiérarchie Maintenance :
// - Agent        : TECHNICIAN             → exécute (ticket + passage MAINTENANCE / RESOLVED)
// - Contrôleur   : MAINTENANCE_CONTROLLER  → inspecte + valide la réparation (review QC)
// - Manager      : MANAGER                → planifie + supervise les contrôles
// - ADMIN        : tous les cas (requireAdminOr)
const AGENT = requireAdminOr('TECHNICIAN', 'MAINTENANCE_CONTROLLER');
const PLAN = requireAdminOr('TECHNICIAN', 'MAINTENANCE_CONTROLLER', 'MANAGER');
const QC = requireAdminOr('MAINTENANCE_CONTROLLER', 'MANAGER');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const tickets = await MaintenanceTicket.find(query)
      .populate('cabinId', 'name serialNumber')
      .sort({ createdAt: -1 })
      .limit(200);
    return res.json({ success: true, tickets });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/cabin/:serial', authMiddleware, async (req, res) => {
  try {
    const cabin = await Cabin.findOne({ serialNumber: req.params.serial });
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    const tickets = await MaintenanceTicket.find({ cabinId: cabin._id }).sort({ createdAt: -1 });
    return res.json({ success: true, tickets });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', authMiddleware, PLAN, async (req, res) => {
  try {
    const { serialNumber, title, description, priority } = req.body;
    if (!serialNumber || !title) {
      return res.status(400).json({ success: false, message: 'serialNumber et title requis' });
    }
    const cabin = await Cabin.findOne({ serialNumber });
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    const ticket = await MaintenanceTicket.create({
      cabinId: cabin._id,
      cabinSerial: cabin.serialNumber,
      reportedBy: req.user._id,
      reporterName: req.user.name || req.user.email,
      title,
      description: description || '',
      priority: priority || 'MEDIUM'
    });

    return res.status(201).json({ success: true, ticket });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id', authMiddleware, AGENT, async (req, res) => {
  try {
    const { status, resolution } = req.body;
    const valid = ['OPEN', 'IN_PROGRESS', 'MAINTENANCE', 'RESOLVED'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, message: 'Statut invalide' });

    const ticket = await MaintenanceTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket introuvable' });

    ticket.status = status;
    if (resolution) ticket.resolution = resolution;
    if (status === 'RESOLVED') {
      ticket.resolvedBy = req.user.name || req.user.email;
      ticket.resolvedAt = new Date();
    } else {
      ticket.technician = req.user.name || req.user.email;
    }
    await ticket.save();

    const cabin = await Cabin.findById(ticket.cabinId);
    if (cabin) {
      if (status === 'MAINTENANCE') {
        cabin.status = 'MAINTENANCE';
      } else if (status === 'RESOLVED') {
        if (cabin.status === 'MAINTENANCE') cabin.status = 'AVAILABLE';
      }
      await cabin.save();
    }

    return res.json({
      success: true,
      message: 'Ticket mis à jour',
      ticket,
      cabinStatus: cabin ? cabin.status : undefined
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Contrôle qualité réalisé par le contrôleur / manager / admin : note sur 5,
// approbation de la réparation ou refus (le ticket repasse en REJECTED, cabine en maintenance).
router.post('/:id/review', authMiddleware, QC, async (req, res) => {
  try {
    const { qualityScore, approved, comment } = req.body;
    const score = Number(qualityScore);
    if (Number.isNaN(score) || score < 0 || score > 5) {
      return res.status(400).json({ success: false, message: 'qualityScore (0-5) requis' });
    }

    const ticket = await MaintenanceTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket introuvable' });
    if (ticket.status !== 'RESOLVED') {
      return res.status(400).json({ success: false, message: 'Seul un ticket réparé (RESOLVED) peut être contrôlé' });
    }

    ticket.qualityScore = score;
    ticket.controlledBy = req.user.name || req.user.email;
    ticket.controlledAt = new Date();
    ticket.approved = !!approved;
    if (comment) ticket.resolution = ticket.resolution ? `${ticket.resolution}\nContrôle: ${comment}` : `Contrôle: ${comment}`;

    const cabin = await Cabin.findById(ticket.cabinId);

    if (approved) {
      await ticket.save();
      return res.json({
        success: true,
        message: `Réparation approuvée (note ${score}/5) par ${ticket.controlledBy}`,
        ticket
      });
    }

    ticket.status = 'REJECTED';
    await ticket.save();
    if (cabin) {
      cabin.status = 'MAINTENANCE';
      await cabin.save();
    }

    return res.json({
      success: true,
      message: `Réparation refusée (note ${score}/5) — passage en REJECTED, à reprendre`,
      ticket,
      cabinStatus: cabin ? cabin.status : undefined
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;