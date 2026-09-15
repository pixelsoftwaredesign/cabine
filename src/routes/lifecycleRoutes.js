const express = require('express');
const Cabin = require('../models/Cabin');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { PDFDoc, nowStr } = require('../services/pdf');
const mqttClient = require('../config/mqtt');
const {
  LIFECYCLE, CARRIERS, DECOMPOSITION_STEPS, DECOMPOSITION_INVENTORY, DECOMPOSITION_REASONS, lifecycleLabel
} = require('../config/lifecycle');

const router = express.Router();
router.use(authMiddleware, requireRole('ADMIN', 'PARTNER', 'MANAGER', 'TECHNICIAN'));

const genTracking = () => 'CAB' + new Date().getFullYear() + '-' + String(Math.floor(100000 + Math.random() * 900000));
const genOrderId = () => 'DEC-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));
const pushEvent = (cabin, from, to, action, by, details) => {
  cabin.lifecycleEvents.push({ at: new Date(), from, to, action, by: by || 'système', details: details || '' });
};

// ==================== CONFIG ====================

router.get('/config', (req, res) => res.json({
  success: true,
  lifecycle: LIFECYCLE,
  carriers: CARRIERS,
  reasons: DECOMPOSITION_REASONS,
  steps: DECOMPOSITION_STEPS,
  inventory: DECOMPOSITION_INVENTORY
}));

// ==================== TRAÇABILITÉ ====================

router.get('/cabins/:id/trace', async (req, res) => {
  try {
    const cabin = await Cabin.findById(req.params.id).populate('ownerId', 'name email')
      .populate('decomposition.technician', 'name')
      .populate('decomposition.requestedBy', 'name email');
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    return res.json({
      success: true,
      serialNumber: cabin.serialNumber,
      name: cabin.name,
      factoryStatus: cabin.factoryStatus,
      lifecycle: cabin.lifecycle,
      shippingDetails: cabin.shippingDetails,
      logistics: cabin.logistics,
      decomposition: cabin.decomposition,
      events: cabin.lifecycleEvents,
      location: cabin.location,
      owner: cabin.ownerId
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Vue suivi pour la page logistique
router.get('/units', async (req, res) => {
  try {
    const cabins = await Cabin.find().sort({ createdAt: -1 }).limit(300)
      .select('serialNumber name location address factoryStatus lifecycle.status shippingDetails logistics decomposition.result decomposition.submittedAt');
    const units = cabins.map((c) => ({
      _id: c._id,
      serialNumber: c.serialNumber,
      name: c.name,
      city: c.location.city,
      address: c.address,
      lifecycle: c.lifecycle.status,
      lifecycleLabel: lifecycleLabel(c.lifecycle.status),
      factoryStatus: c.factoryStatus,
      shipping: c.shippingDetails,
      logistics: c.logistics,
      decomposedResult: c.decomposition?.result
    }));
    return res.json({ success: true, units });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== EXPÉDITION ====================

router.patch('/cabins/:id/shipping', async (req, res) => {
  try {
    const { trackingNumber, carrierName, destinationAddress, dock } = req.body;
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    if (!['READY_FOR_SHIPPING', 'FACTORY_PURCHASED'].includes(cabin.lifecycle.status)) {
      return res.status(400).json({ success: false, message: 'La cabine n’est pas prête à expédier' });
    }

    const track = trackingNumber || genTracking();
    const packUri = `cabine://packing?s=${encodeURIComponent(cabin.serialNumber)}&t=${encodeURIComponent(track)}&d=${encodeURIComponent(destinationAddress || '')}`;

    const from = cabin.lifecycle.status;
    cabin.shippingDetails = {
      trackingNumber: track,
      carrierName: carrierName || '',
      destinationAddress: destinationAddress || '',
      dock: dock || '',
      packedAt: new Date(),
      shippedAt: new Date(),
      packingQR: packUri
    };
    cabin.lifecycle.status = 'IN_TRANSIT';
    if (['IN_ASSEMBLY', 'TESTED', 'READY_FOR_SHIPPING'].includes(cabin.factoryStatus)) cabin.factoryStatus = 'SHIPPED';
    pushEvent(cabin, from, 'IN_TRANSIT', 'SHIPPING', req.user.name || req.user.email,
      `Expédiée via ${carrierName || '—'} — tracking ${track}`);
    await cabin.save();

    return res.json({
      success: true,
      message: 'Cabine en expédition. Bordereau & QR colisage disponibles.',
      trackingNumber: track,
      packingQR: packUri
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/cabins/:id/packing-qr', async (req, res) => {
  try {
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    return res.json({
      success: true,
      qr: cabin.shippingDetails.packingQR
        || `cabine://packing?s=${encodeURIComponent(cabin.serialNumber)}&d=${encodeURIComponent(cabin.shippingDetails.destinationAddress || cabin.address || '')}`,
      serialNumber: cabin.serialNumber,
      destination: cabin.shippingDetails.destinationAddress || cabin.address || '',
      trackingNumber: cabin.shippingDetails.trackingNumber || ''
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Mise à jour du position du transporteur (GPS)
router.patch('/cabins/:id/transit', async (req, res) => {
  try {
    const { carrier, vehicle, lat, lng } = req.body;
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    if (carrier !== undefined) cabin.logistics.carrier = carrier;
    if (vehicle !== undefined) cabin.logistics.vehicle = vehicle;
    if (lat !== undefined && lng !== undefined) {
      cabin.logistics.lastLat = lat;
      cabin.logistics.lastLng = lng;
      cabin.logistics.lastUpdate = new Date();
      cabin.logistics.waypoints.push({ lat, lng, ts: new Date() });
    }
    await cabin.save();
    return res.json({ success: true, logistics: cabin.logistics });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Arrivée sur site — début d'assemblage
router.post('/cabins/:id/site-arrival', async (req, res) => {
  try {
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    const from = cabin.lifecycle.status;
    cabin.lifecycle.status = 'ASSEMBLY_IN_PROGRESS';
    pushEvent(cabin, from, 'ASSEMBLY_IN_PROGRESS', 'SITE_ARRIVAL', req.user.name || req.user.email, 'Arrivée sur site — assemblage en cours');
    await cabin.save();
    return res.json({ success: true, lifecycle: cabin.lifecycle.status });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/cabins/:id/operational', async (req, res) => {
  try {
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    const from = cabin.lifecycle.status;
    cabin.lifecycle.status = 'OPERATIONAL';
    cabin.status = 'AVAILABLE';
    pushEvent(cabin, from, 'OPERATIONAL', 'COMMISSION', req.user.name || req.user.email, 'Mise en service — cabine opérationnelle');
    await cabin.save();
    return res.json({ success: true, lifecycle: cabin.lifecycle.status });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== BORDEREAU DE LIVRAISON (PDF) ====================

router.get('/report/bordereau/:id', async (req, res) => {
  try {
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    const s = cabin.shippingDetails;

    const doc = new PDFDoc();
    doc.p(nowStr(), { x: 470 });
    doc.h1('Bordereau de livraison');
    doc.p(`Expédition ${s.trackingNumber || '—'} — © pixelsoftwaredesign 2026`);
    doc.hr(795);
    doc.p('Destinataire');
    doc.table([
      ['Cabine', cabin.serialNumber],
      ['Modèle', cabin.name],
      ['Adresse de destination', s.destinationAddress || cabin.address || '—'],
      ['Quai / dock', s.dock || '—'],
      ['Transporteur', s.carrierName || '—'],
      ['Tracking', s.trackingNumber],
      ['Date d’expédition', s.shippedAt ? s.shippedAt.toLocaleString('fr-FR') : '—']
    ], { widths: [180, 410] });
    doc.h1('QR colisage', { y: 54 });
    doc.p(s.packingQR || '—', { y: 28 });
    doc.h1('Signature conducteur', { y: 48 });
    doc.p('..............................', { y: 28 });

    const buf = doc.render();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bordereau-${cabin.serialNumber}.pdf"`);
    return res.send(buf);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur génération bordereau' });
  }
});

// ==================== DÉCOMPOSITION / DÉMONTAGE ====================

router.get('/decompositions', async (req, res) => {
  try {
    const cabins = await Cabin.find({ 'lifecycle.status': 'DECOMPOSITION_REQUESTED' })
      .populate('decomposition.technician', 'name')
      .populate('decomposition.requestedBy', 'name email')
      .sort({ 'decomposition.requestedAt': -1 })
      .select('serialNumber name address lifecycle.status decomposition shippingDetails');
    return res.json({ success: true, decompositions: cabins });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/cabins/:id/decompose', async (req, res) => {
  try {
    const { reason, targetDestination } = req.body;
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    if (['DECOMPOSITION_REQUESTED', 'DECOMPOSED_IN_STORAGE', 'IN_TRANSIT'].includes(cabin.lifecycle.status)) {
      return res.status(400).json({ success: false, message: 'Décomposition déjà en cours ou cabine en transit' });
    }

    const from = cabin.lifecycle.status;
    cabin.lifecycle.status = 'DECOMPOSITION_REQUESTED';
    cabin.status = 'MAINTENANCE';
    cabin.rentalSettings.isListed = false;
    cabin.decomposition = {
      orderId: genOrderId(),
      requestedBy: req.user._id,
      requestedAt: new Date(),
      reason: reason || 'RELOCATION',
      targetDestination: targetDestination || '',
      steps: DECOMPOSITION_STEPS.map((st) => ({ key: st.key, label: st.label, done: false })),
      inventory: [],
      photos: [],
      result: 'STORAGE'
    };
    pushEvent(cabin, from, 'DECOMPOSITION_REQUESTED', 'DECOMPOSE_REQUEST', req.user.name || req.user.email,
      `Ordre ${cabin.decomposition.orderId} — motif ${reason || 'RELOCATION'}`);

    await cabin.save();

    mqttClient.publish(`cabine/${cabin.serialNumber}/system/cmd`, JSON.stringify({ action: 'DECOMMISSION_PREPARATION' }));

    return res.json({
      success: true,
      message: 'Ordre de décomposition enregistré. La cabine est hors-service (réservations masquées, verrouillage électrique demandé).',
      orderId: cabin.decomposition.orderId
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/decompositions/:id/assign', async (req, res) => {
  try {
    const { technicianId, associate } = req.body;
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    if (!cabin.decomposition || cabin.lifecycle.status !== 'DECOMPOSITION_REQUESTED') {
      return res.status(400).json({ success: false, message: 'Aucun ordre de décomposition actif' });
    }
    if (technicianId) cabin.decomposition.technician = technicianId;
    if (associate !== undefined) cabin.decomposition.associate = String(associate);
    cabin.decomposition.assignedAt = new Date();
    pushEvent(cabin, 'DECOMPOSITION_REQUESTED', 'DECOMPOSITION_REQUESTED', 'DECOMPOSE_ASSIGN', req.user.name || req.user.email, `Technicien affecté à l’ordre ${cabin.decomposition.orderId}`);
    await cabin.save();
    return res.json({ success: true, orderId: cabin.decomposition.orderId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/decompositions/:id/guide', async (req, res) => {
  try {
    const cabin = await Cabin.findById(req.params.id).populate('decomposition.technician', 'name');
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    return res.json({
      success: true,
      serialNumber: cabin.serialNumber,
      orderId: cabin.decomposition?.orderId,
      technician: cabin.decomposition?.technician,
      associate: cabin.decomposition?.associate,
      steps: cabin.decomposition?.steps || [],
      inventoryScanned: cabin.decomposition?.inventory?.length || 0
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/decompositions/:id/steps/:key', async (req, res) => {
  try {
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin || !cabin.decomposition) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    const step = cabin.decomposition.steps.find((s) => s.key === req.params.key);
    if (!step) return res.status(400).json({ success: false, message: 'Étape inconnue' });
    step.done = true;
    step.at = new Date();
    await cabin.save();
    return res.json({ success: true, step });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/decompositions/:id/inventory', async (req, res) => {
  try {
    const { key, scanValue } = req.body;
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin || !cabin.decomposition) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    const meta = DECOMPOSITION_INVENTORY.find((c) => c.key === key);
    if (!meta) return res.status(400).json({ success: false, message: 'Composant inconnu' });
    const expected = meta.qrPrefix + cabin.serialNumber.toUpperCase();
    const value = String(scanValue || '').toUpperCase();
    if (!value || value !== expected) {
      return res.status(400).json({ success: false, message: `QR invalide — attendu ${expected}` });
    }
    if (cabin.decomposition.inventory.some((i) => i.key === key)) {
      return res.status(409).json({ success: false, message: 'Composant déjà scanné' });
    }
    cabin.decomposition.inventory.push({ key, label: meta.label, scanValue: value, scannedAt: new Date() });
    await cabin.save();
    return res.json({ success: true, message: `${meta.label} scanné`, status: (cabin.decomposition.inventory.length) + '/' + DECOMPOSITION_INVENTORY.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/decompositions/:id/complete', async (req, res) => {
  try {
    const { photos, notes, result } = req.body;
    const cabin = await Cabin.findById(req.params.id);
    if (!cabin || !cabin.decomposition) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    const pendingSteps = cabin.decomposition.steps.filter((s) => !s.done);
    if (pendingSteps.length) return res.status(400).json({ success: false, message: `Démontage incomplet : ${pendingSteps.length} étape(s) restante(s)` });
    if (cabin.decomposition.inventory.length < DECOMPOSITION_INVENTORY.length) {
      return res.status(400).json({ success: false, message: `Inventaire incomplet : ${cabin.decomposition.inventory.length}/${DECOMPOSITION_INVENTORY.length} composants scannés` });
    }

    const res2 = result === 'TRANSFER' ? 'TRANSFER' : 'STORAGE';
    cabin.decomposition.photos = photos || [];
    cabin.decomposition.notes = notes || '';
    cabin.decomposition.submittedAt = new Date();
    cabin.decomposition.result = res2;

    const from = cabin.lifecycle.status;
    if (res2 === 'TRANSFER') {
      cabin.lifecycle.status = 'IN_TRANSIT';
      cabin.shippingDetails = {
        ...(cabin.shippingDetails || {}),
        destinationAddress: cabin.decomposition.targetDestination || cabin.shippingDetails.destinationAddress,
        shippedAt: new Date()
      };
    } else {
      cabin.lifecycle.status = 'DECOMPOSED_IN_STORAGE';
    }
    pushEvent(cabin, from, cabin.lifecycle.status, 'DECOMPOSE_COMPLETE', req.user.name || req.user.email,
      `Décomposition ${cabin.decomposition.orderId} clôturée — ${res2 === 'TRANSFER' ? 'transfert vers nouveau site' : 'stockage pièces détachées'}`);

    await cabin.save();
    return res.json({ success: true, lifecycle: cabin.lifecycle.status, result: res2, orderId: cabin.decomposition.orderId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== NETTOYAGE DÉMO (ADMIN) ====================

router.delete('/cabins/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const cabin = await Cabin.findByIdAndDelete(req.params.id);
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    return res.json({ success: true, message: cabin.serialNumber + ' supprimée' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;