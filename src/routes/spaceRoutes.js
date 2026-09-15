const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Space = require('../models/Space');
const Cabin = require('../models/Cabin');
const HousekeepingTask = require('../models/HousekeepingTask');
const MaintenanceTicket = require('../models/MaintenanceTicket');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { rssiToDistance, localize } = require('../services/trilateration');

const router = express.Router();

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

const genBeaconCode = () =>
  'IPS-' + Array.from({ length: 8 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'public', 'uploads');

const writePlan = (spaceId, levelKey, dataUrl) => {
  const m = /^data:image\/(png|jpe?g|svg\+xml);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return { error: 'Image invalide (base64 attendu : data:image/png|jpeg|svg+xml;base64,…)' };

  const [, type, b64] = m;
  const ext = type === 'svg+xml' ? 'svg' : type === 'jpeg' ? 'jpg' : 'png';
  const dir = path.join(UPLOAD_ROOT, String(spaceId));
  fs.mkdirSync(dir, { recursive: true });

  const filename = `level-${levelKey}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(b64, 'base64'));

  return { ok: true, planImage: `/uploads/${spaceId}/${filename}` };
};

// ==================== SPACES (bâtiments / sites) ====================

router.get('/', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    const spaces = await Space.find().sort({ createdAt: -1 });
    return res.json({ success: true, spaces });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    const { name, type, address, levels } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name requis' });

    const space = await Space.create({
      name,
      type: type || 'BUILDING',
      address: address || '',
      ownerId: req.user._id,
      levels: Array.isArray(levels) ? levels : []
    });

    return res.status(201).json({ success: true, space });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });
    return res.json({ success: true, space });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    const { name, type, address, levels } = req.body;
    if (name !== undefined) space.name = name;
    if (type !== undefined) space.type = type;
    if (address !== undefined) space.address = address;
    if (levels !== undefined) space.levels = Array.isArray(levels) ? levels : space.levels;

    await space.save();
    return res.json({ success: true, space });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });

    const unplaced = await Cabin.updateMany(
      { 'indoor.spaceId': req.params.id },
      { $set: { 'indoor.spaceId': null } }
    );

    const dir = path.join(UPLOAD_ROOT, req.params.id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

    const space = await Space.findByIdAndDelete(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    return res.json({ success: true, message: 'Bâtiment supprimé', unplaced: unplaced.modifiedCount });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Ajouter un étage (sans plan) au bâtiment
router.post('/:id/levels', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    const { key, label, width, height } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'key requis' });
    if (space.levels.some((l) => l.key === key)) {
      return res.status(409).json({ success: false, message: 'Étage déjà existant' });
    }

    space.levels.push({ key, label: label || key, width: width || 1000, height: height || 800 });
    await space.save();
    return res.status(201).json({ success: true, space });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Upload du plan d'un étage (base64 JSON) + dimensions
router.post('/:id/levels/:key/plan', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    const level = space.levels.find((l) => l.key === req.params.key);
    if (!level) return res.status(404).json({ success: false, message: 'Étage introuvable' });

    const { image, width, height } = req.body;
    const written = writePlan(space._id, level.key, image);
    if (written.error) return res.status(400).json({ success: false, message: written.error });

    level.planImage = written.planImage;
    if (width) level.width = Number(width);
    if (height) level.height = Number(height);
    await space.save();

    return res.json({ success: true, message: 'Plan enregistré', level });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Supprimer un étage et son plan
router.delete('/:id/levels/:key', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    const level = space.levels.find((l) => l.key === req.params.key);
    if (!level) return res.status(404).json({ success: false, message: 'Étage introuvable' });

    if (level.planImage) {
      const filePath = path.join(__dirname, '..', '..', 'public', level.planImage);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    space.levels = space.levels.filter((l) => l.key !== req.params.key);
    await space.save();

    await Cabin.updateMany(
      { 'indoor.spaceId': space._id, 'indoor.level': req.params.key },
      { $set: { 'indoor.spaceId': null, 'indoor.level': '' } }
    );

    return res.json({ success: true, message: 'Étage supprimé', space });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== CABINES SUR LE PLAN ====================

// Position + statut de chaque cabine placée (avec tasks/tickets actifs pour le popup)
router.get('/:id/cabins', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const { level } = req.query;

    const query = { 'indoor.spaceId': req.params.id };
    if (level) query['indoor.level'] = level;

const cabins = await Cabin.find(query).select(
      '_id name serialNumber status housekeepingState factoryStatus indoor rooms'
    );

    const cabinIds = cabins.map((c) => c._id);
    const [tasks, tickets] = await Promise.all([
      HousekeepingTask.find({ cabinId: { $in: cabinIds }, status: { $ne: 'COMPLETED' } }).select('cabinId status priority'),
      MaintenanceTicket.find({ cabinId: { $in: cabinIds }, status: { $ne: 'RESOLVED' } }).select('cabinId status title priority')
    ]);

    const taskByCabin = new Map(tasks.map((t) => [t.cabinId.toString(), t]));
    const ticketByCabin = new Map(tickets.map((t) => [t.cabinId.toString(), t]));

    return res.json({
      success: true,
      cabins: cabins.map((c) => ({
        _id: c._id,
        name: c.name,
        serialNumber: c.serialNumber,
        status: c.status,
        housekeepingState: c.housekeepingState,
        factoryStatus: c.factoryStatus,
        x: c.indoor.x,
        y: c.indoor.y,
        rotation: c.indoor.rotation,
        level: c.indoor.level,
        activeTask: taskByCabin.get(c._id.toString()) || null,
        activeTicket: ticketByCabin.get(c._id.toString()) || null
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Placer / déplacer une cabine sur le plan
router.patch('/cabins/:cabinId/indoor-position', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    const { cabinId } = req.params;
    if (!validId(cabinId)) return res.status(400).json({ success: false, message: 'Identifiant cabine invalide' });

    const { spaceId, level, x, y, rotation } = req.body;
    if (spaceId && !validId(spaceId)) return res.status(400).json({ success: false, message: 'Identifiant bâtiment invalide' });

    if (spaceId) {
      const space = await Space.findById(spaceId);
      if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });
      if (level && !space.levels.some((l) => l.key === level)) {
        return res.status(400).json({ success: false, message: 'Étage inconnu du bâtiment' });
      }
    }

    const pedestrian = await Cabin.findById(cabinId);
    if (!pedestrian) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    pedestrian.indoor.spaceId = spaceId || null;
    pedestrian.indoor.level = level || '';
    if (x !== undefined) pedestrian.indoor.x = Number(x);
    if (y !== undefined) pedestrian.indoor.y = Number(y);
    if (rotation !== undefined) pedestrian.indoor.rotation = Number(rotation);
    await pedestrian.save();

    return res.json({
      success: true,
      message: 'Position actualisée',
      indoor: pedestrian.indoor
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== BEACONS (phase 2 indoor) ====================

// Balises d'un étage (avec position d'ancrage X,Y sur le plan)
router.get('/:id/beacons', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    const { level } = req.query;
    const beacons = level ? space.beacons.filter((b) => b.level === level) : space.beacons;
    return res.json({ success: true, beacons });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/beacons', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    const { uuid, label, level, major, minor, x, y } = req.body;
    if (!uuid) return res.status(400).json({ success: false, message: 'uuid requis' });
    if (level && !space.levels.some((l) => l.key === level)) {
      return res.status(400).json({ success: false, message: 'Étage inconnu' });
    }

    // QR code de repérage automatique (IPS) : IPS-XXXXXXXX
    let beaconCode = /^[A-Z0-9-]{3,40}$/.test(String(req.body.code || '')) ? String(req.body.code) : '';

    space.beacons.push({
      uuid,
      code: beaconCode || genBeaconCode(),
      label: label || '',
      level: level || (space.levels[0] ? space.levels[0].key : ''),
      major: major || 0,
      minor: minor || 0,
      x: x || 0,
      y: y || 0
    });
    await space.save();
    return res.status(201).json({ success: true, space });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Vérification d'un QR balise (IPS) → retourne position et étage pour le guidage
router.post('/:id/beacons/verify', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ success: false, message: 'code requis' });

    const beacon = space.beacons.find((b) => String(b.code || '').toUpperCase() === code);
    if (!beacon) return res.status(404).json({ success: false, message: 'Balise introuvable pour ce code QR' });

    return res.json({
      success: true,
      beacon: {
        _id: beacon._id,
        code: beacon.code,
        label: beacon.label,
        level: beacon.level,
        x: beacon.x,
        y: beacon.y
      },
      spaceName: space.name
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id/beacons/:beaconId', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    const before = space.beacons.length;
    space.beacons = space.beacons.filter((b) => String(b._id) !== req.params.beaconId);
    if (space.beacons.length === before) {
      return res.status(404).json({ success: false, message: 'Balise introuvable' });
    }
    await space.save();
    return res.json({ success: true, message: 'Balise supprimée', space });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Estimation de position depuis des mesures RSSI
// body : { level, rssi: [{ beaconId, rssi (dBm) }] }
router.post('/:id/localize', authMiddleware, requireRole('PARTNER', 'ADMIN'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    const space = await Space.findById(req.params.id);
    if (!space) return res.status(404).json({ success: false, message: 'Bâtiment introuvable' });

    const { level, rssi } = req.body;
    if (!level || !Array.isArray(rssi) || rssi.length < 3) {
      return res.status(400).json({ success: false, message: 'level et au moins 3 mesures rssi requises' });
    }

    const points = [];
    rssi.forEach((m) => {
      const beacon = space.beacons.find((b) => String(b._id) === String(m.beaconId) && b.level === level);
      if (!beacon) return;
      const d = rssiToDistance(Number(m.rssi));
      if (d === null) return;
      points.push({ x: beacon.x, y: beacon.y, d });
    });

    if (points.length < 3) {
      return res.status(400).json({ success: false, message: 'Moins de 3 balises mesurées pour cet étage' });
    }

    const est = localize(points);
    if (!est) return res.status(422).json({ success: false, message: 'Triangulation impossible (balises alignées ?)' });

    return res.json({
      success: true,
      point: { x: Math.round(est.x * 100) / 100, y: Math.round(est.y * 100) / 100 },
      sources: points.length,
      level
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;