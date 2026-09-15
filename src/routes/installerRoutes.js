const express = require('express');
const Cabin = require('../models/Cabin');
const { authMiddleware, requireAdminOr } = require('../middleware/auth');
const { QC_TESTS, INSTALL_PHOTOS, INSTALL_CHECKLIST } = require('../config/factory');
const { publishCommand } = require('../services/mqttService');
const { PDFDoc, nowStr } = require('../services/pdf');

const router = express.Router();

// Installation / recette IoT réservée à la chaîne IT-IoT (développeur → agent → manager)
// et aux partenaires installeurs. ADMIN : tous les cas.
const INSTALL_EXEC = requireAdminOr('DEVELOPER', 'IOT_AGENT', 'MANAGER', 'PARTNER');

const genPvId = () => 'PV-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));

router.get('/photos', (req, res) => res.json({ success: true, photos: INSTALL_PHOTOS }));

router.get('/checklist', (req, res) => res.json({ success: true, checklist: INSTALL_CHECKLIST }));

router.get('/unit/:serial', authMiddleware, async (req, res) => {
  try {
    const unit = await Cabin.findOne({ serialNumber: req.params.serial });
    if (!unit) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    return res.json({
      success: true,
      unit: {
        _id: unit._id,
        serialNumber: unit.serialNumber,
        name: unit.name,
        factoryStatus: unit.factoryStatus,
        lifecycle: unit.lifecycle.status,
        hardware: unit.hardware,
        rooms: unit.rooms,
        qcTests: unit.qcTests,
        installation: unit.installation
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Force l'ouverture/fermeture d'un équipement pour valider le câblage
router.post('/self-test', authMiddleware, INSTALL_EXEC, async (req, res) => {
  try {
    const { serialNumber, component } = req.body;
    const unit = await Cabin.findOne({ serialNumber });
    if (!unit) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    const value = component === 'lock' ? 'UNLOCK' : 'ON';
    publishCommand(unit.serialNumber, component === 'lock' ? 'lock' : component, value);

    return res.json({
      success: true,
      message: 'Commande de test envoyée',
      component,
      value
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Procès-verbal d'installation : check-list technique + photos + signature
router.post('/unit/:serial/pv', authMiddleware, INSTALL_EXEC, async (req, res) => {
  try {
    const { checklist, photos, signature, notes } = req.body;
    const cabin = await Cabin.findOne({ serialNumber: req.params.serial });
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });

    const missing = INSTALL_CHECKLIST.filter((c) => !(checklist || []).some((x) => x.key === c.key && x.done));
    if (missing.length) return res.status(400).json({ success: false, message: 'Check-list technique incomplète : ' + missing.map((m) => m.label).join('; ') });

    cabin.installation = {
      ...(cabin.installation || {}),
      installedBy: req.user._id,
      installedAt: new Date(),
      photos: photos || cabin.installation.photos || [],
      notes: notes || '',
      signature: signature || '',
      checklist: INSTALL_CHECKLIST.map((c) => ({ key: c.key, label: c.label, done: true, checkedAt: new Date() })),
      pvId: genPvId()
    };
    await cabin.save();

    return res.json({ success: true, message: 'PV enregistré', pvId: cabin.installation.pvId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Export PDF du procès-verbal
router.get('/report/pv/:serial', async (req, res) => {
  try {
    const cabin = await Cabin.findOne({ serialNumber: req.params.serial });
    if (!cabin) return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    if (!cabin.installation?.pvId) return res.status(404).json({ success: false, message: 'Aucun PV pour cette cabine' });

    const doc = new PDFDoc();
    doc.p(nowStr(), { x: 470 });
    doc.h1('Procès-verbal d’installation');
    doc.p(`Cabine ${cabin.serialNumber} — ${cabin.name} — © pixelsoftwaredesign 2026`);
    doc.hr(795);
    doc.p('Identité');
    doc.table([['N° série', cabin.serialNumber], ['Modèle / HW', (cabin.hardware && cabin.hardware.hardwareVersion) || '—'], ['Statut produit', cabin.factoryStatus]], { widths: [150, 430] });
    doc.p(`Site : ${(cabin.location && cabin.location.address && cabin.location.address.city) || '—'}\nCoordonnées : ${cabin.location && cabin.location.coordinates ? (cabin.location.coordinates.lat + ', ' + cabin.location.coordinates.lng) : '—'}`, { y: 46 });
    doc.p('Check-list technique');
    (cabin.installation.checklist || []).forEach((c) => doc.table([[c.done ? '✔' : '✘', c.label]], { widths: [30, 550], header: false, rowH: 16 }));
    doc.p('Photos d’illustration : ' + ((cabin.installation.photos || []).length) + '/3 jointes', { y: 34 });
    if (cabin.installation.notes) doc.p('Notes : ' + cabin.installation.notes, { y: 22 });
    doc.h1('Signature du technicien', { y: 44 });
    doc.p(cabin.installation.signature || '(non signé)', { y: 30 });
    doc.p('PV n° ' + cabin.installation.pvId + ' — émis le ' + new Date(cabin.installation.installedAt).toLocaleDateString('fr-FR'), { y: 40 });

    const buf = doc.render();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cabin.installation.pvId}.pdf"`);
    return res.send(buf);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur génération PV' });
  }
});

// Recette d'installation : photos, GPS, notes, signature, activation
router.post('/commission', authMiddleware, INSTALL_EXEC, async (req, res) => {
  try {
    const { serialNumber, gpsCoordinates, photos, installNotes, signature, token } = req.body;

    const cabin = await Cabin.findOne({ serialNumber });
    if (!cabin) {
      return res.status(404).json({ success: false, message: 'Cabine introuvable' });
    }

    if (token && cabin.pairingToken && cabin.pairingToken !== token) {
      return res.status(403).json({ success: false, message: 'Code QR d’appairage invalide' });
    }

    if (!photos || photos.length < 3) {
      return res.status(400).json({ success: false, message: 'Les 3 photos d’illustration sont obligatoires (armoire, vue globale, intérieur)' });
    }

    if (gpsCoordinates) {
      cabin.location.coordinates = {
        lat: gpsCoordinates.lat || cabin.location.coordinates.lat,
        lng: gpsCoordinates.lng || cabin.location.coordinates.lng
      };
    }

    cabin.installation = {
      installedBy: req.user._id,
      installedAt: new Date(),
      photos,
      notes: installNotes || '',
      signature: signature || '',
      commissionedAt: new Date()
    };

    cabin.status = 'AVAILABLE';
    cabin.housekeepingState = 'CLEAN';
    cabin.factoryStatus = 'DELIVERED_AND_COMMISSIONED';
    cabin.lifecycle.status = 'OPERATIONAL';
    cabin.lifecycleEvents = cabin.lifecycleEvents || [];
    cabin.lifecycleEvents.push({
      at: new Date(), from: 'ASSEMBLY_IN_PROGRESS', to: 'OPERATIONAL', action: 'COMMISSION',
      by: req.user.name || req.user.email, details: 'Recette validée — cabine opérationnelle'
    });
    cabin.pairingToken = '';

    await cabin.save();

    publishCommand(cabin.serialNumber, 'lock', 'LOCK');

    return res.json({
      success: true,
      message: 'Installation validée. La cabine est LIVRÉE & PRÊTE.',
      cabinId: cabin._id,
      factoryStatus: cabin.factoryStatus
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur lors de la validation' });
  }
});

module.exports = router;
module.exports.QC_TESTS = QC_TESTS;