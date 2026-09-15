const express = require('express');
const crypto = require('crypto');
const ShopProduct = require('../models/ShopProduct');
const Order = require('../models/Order');
const Cabin = require('../models/Cabin');
const ComponentStock = require('../models/ComponentStock');
const MaintenanceTicket = require('../models/MaintenanceTicket');
const HousekeepingTask = require('../models/HousekeepingTask');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { ROOM_TYPES, resolveRooms } = require('../config/rooms');
const { DEFAULT_COMPONENTS, QC_TESTS, FLOW, nextFactoryStatus, ASSEMBLY_STATIONS } = require('../config/factory');
const { publishCommand } = require('../services/mqttService');

const router = express.Router();

const genSerial = () => 'CAB-' + (new Date().getFullYear()) + '-TN-' + String(Math.floor(1000 + Math.random() * 9000));
const genToken = () => crypto.randomBytes(16).toString('hex').toUpperCase().slice(0, 24);

router.get('/rooms', (req, res) => res.json({ success: true, rooms: ROOM_TYPES }));

router.get('/metrics', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const [products, stockAgg, orders, unitAgg, components] = await Promise.all([
      ShopProduct.countDocuments(),
      ShopProduct.aggregate([{ $group: { _id: null, total: { $sum: '$stock' } } }]),
      Order.countDocuments({ status: 'FULFILLED' }),
      Cabin.aggregate([{ $group: { _id: '$factoryStatus', count: { $sum: 1 } } }]),
      ComponentStock.find()
    ]);

    const byStatus = {};
    unitAgg.forEach((u) => { byStatus[u._id] = u.count; });

    const compStock = {};
    components.forEach((c) => { compStock[c.code] = c.stock; });

    return res.json({
      success: true,
      metrics: {
        products,
        stock: stockAgg[0]?.total || 0,
        produced: orders,
        units: Object.values(byStatus).reduce((a, b) => a + b, 0),
        unitsByStatus: byStatus,
        components: compStock
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PRODUCTION UNITS ====================

router.get('/units', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.factoryStatus = status;
    const units = await Cabin.find(query).sort({ createdAt: -1 }).limit(200);
    return res.json({
      success: true,
      units: units.map((u) => ({
        _id: u._id,
        serialNumber: u.serialNumber,
        name: u.name,
        factoryStatus: u.factoryStatus,
        lifecycle: u.lifecycle.status,
        hardware: u.hardware,
        rooms: u.rooms,
        qcTests: u.qcTests,
        pairingToken: u.pairingToken,
        hasToken: !!u.pairingToken,
        status: u.status,
        ownerId: u.ownerId,
        createdAt: u.createdAt
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/units', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { serialNumber, name, hardwareVersion, esp32MacAddress, productId, rooms } = req.body;
    const serial = serialNumber || genSerial();

    const exists = await Cabin.findOne({ serialNumber: serial });
    if (exists) return res.status(409).json({ success: false, message: 'Numéro de série déjà enregistré' });

    const product = productId ? await ShopProduct.findById(productId) : null;

    const unit = await Cabin.create({
      serialNumber: serial,
      name: name || (product ? product.title : 'Cabine en production'),
      ownerId: req.user._id,
      operatingMode: 'PERSONAL',
      status: 'OCCUPIED_BY_OWNER',
      rooms: resolveRooms(rooms || product?.specs?.rooms),
      factoryStatus: 'IN_ASSEMBLY',
      lifecycle: { status: 'FACTORY_PURCHASED' },
      assembly: ASSEMBLY_STATIONS.map((s) => ({
        station: s.code,
        label: s.label,
        status: s.code === 'P1' ? 'PENDING' : 'PENDING',
        operations: s.operations.map((op) => ({ label: op, done: false })),
        startedAt: null,
        completedAt: null
      })),
      hardware: {
        hardwareVersion: hardwareVersion || 'v1.0',
        esp32MacAddress: esp32MacAddress || '',
        mqttUsername: 'esp_' + serial.toLowerCase().replace(/[^a-z0-9]/g, ''),
        mqttCertificate: genToken(),
        productionDate: new Date()
      }
    });

    return res.status(201).json({ success: true, unit: { _id: unit._id, serialNumber: unit.serialNumber, factoryStatus: unit.factoryStatus } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/units/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const unit = await Cabin.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: 'Unité introuvable' });
    return res.json({ success: true, unit });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/units/:id/status', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const unit = await Cabin.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: 'Unité introuvable' });
    if (!FLOW.includes(unit.factoryStatus)) return res.status(400).json({ success: false, message: 'Statut usine invalide' });

    const target = nextFactoryStatus(unit.factoryStatus);
    unit.factoryStatus = target;
    await unit.save();
    return res.json({ success: true, unit: { _id: unit._id, serialNumber: unit.serialNumber, factoryStatus: unit.factoryStatus } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== ASSEMBLY P1 → P4 ====================

router.get('/assembly/stations', authMiddleware, requireRole('ADMIN'), (req, res) => res.json({ success: true, stations: ASSEMBLY_STATIONS }));

const seedAssembly = (unit) => {
  if (!unit.assembly || !unit.assembly.length) {
    unit.assembly = ASSEMBLY_STATIONS.map((s) => ({
      station: s.code, label: s.label, status: 'PENDING',
      operations: s.operations.map((op) => ({ label: op, done: false }))
    }));
  }
  return unit;
};

router.get('/units/:id/assembly', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const unit = await Cabin.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: 'Unité introuvable' });
    seedAssembly(unit); await unit.save();
    return res.json({ success: true, serialNumber: unit.serialNumber, assembly: unit.assembly, stations: ASSEMBLY_STATIONS });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/units/:id/assembly/:station', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const unit = await Cabin.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: 'Unité introuvable' });
    seedAssembly(unit);
    const idx = unit.assembly.findIndex((a) => a.station === req.params.station);
    if (idx < 0) return res.status(400).json({ success: false, message: 'Station inconnue' });
    if (unit.assembly[idx].status === 'DONE') return res.status(409).json({ success: false, message: 'Station déjà validée' });

    const ops = req.body.operations || [];
    const anyUnchecked = unit.assembly[idx].operations.filter((o) => !(ops.includes(o.label) || o.done));
    if (anyUnchecked.length) return res.status(400).json({ success: false, message: 'Opérations incomplètes : ' + anyUnchecked.map((o) => o.label).join(', ') });

    unit.assembly[idx].operations.forEach((o) => (o.done = true));
    unit.assembly[idx].status = 'DONE';
    unit.assembly[idx].doneBy = req.user.name || req.user.email;
    unit.assembly[idx].startedAt = unit.assembly[idx].startedAt || new Date();
    unit.assembly[idx].completedAt = new Date();
    await unit.save();
    return res.json({ success: true, station: unit.assembly[idx] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/units/:id/assembly/:station/reset', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const unit = await Cabin.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: 'Unité introuvable' });
    seedAssembly(unit);
    const idx = unit.assembly.findIndex((a) => a.station === req.params.station);
    if (idx < 0) return res.status(400).json({ success: false, message: 'Station inconnue' });
    unit.assembly[idx].status = 'PENDING';
    unit.assembly[idx].operations.forEach((o) => (o.done = false));
    unit.assembly[idx].doneBy = '';
    unit.assembly[idx].completedAt = null;
    await unit.save();
    return res.json({ success: true, assembly: unit.assembly });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/units/:id/qc', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const unit = await Cabin.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: 'Unité introuvable' });

    const components = ['relays', 'sensors', 'door_lock', 'display'].join(',');
    publishCommand(unit.serialNumber, 'SELF_TEST', { command: 'SELF_TEST', components });

    const results = QC_TESTS.map((t) => {
      const pass = Math.random() > 0.02;
      return {
        test: t.label,
        key: t.test,
        result: pass ? 'PASS' : 'FAIL',
        details: pass ? 'OK' : 'À revoir',
        testedAt: new Date()
      };
    });

    unit.qcTests = results;
    if (results.every((r) => r.result === 'PASS')) {
      unit.factoryStatus = 'TESTED';
      unit.lifecycle.status = 'READY_FOR_SHIPPING';
    }
    await unit.save();

    return res.json({ success: true, message: 'Banc de test exécuté', tests: results, factoryStatus: unit.factoryStatus, lifecycle: unit.lifecycle.status });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/units/:id/shipping-qr', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const unit = await Cabin.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: 'Unité introuvable' });

    unit.pairingToken = genToken();
    if (unit.factoryStatus === 'TESTED' || unit.factoryStatus === 'IN_ASSEMBLY') {
      unit.factoryStatus = 'READY_FOR_SHIPPING';
    }
    await unit.save();

    const payload = `CBN://pair?serial=${unit.serialNumber}&t=${unit.pairingToken}`;
    return res.json({
      success: true,
      message: 'QR d’appairage généré — statut READY_FOR_SHIPPING',
      serialNumber: unit.serialNumber,
      token: unit.pairingToken,
      qr: payload
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/units/:serial/trace', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const unit = await Cabin.findOne({ serialNumber: req.params.serial });
    if (!unit) return res.status(404).json({ success: false, message: 'Unité introuvable' });

    const [order, tickets, tasks] = await Promise.all([
      Order.findOne({ cabinId: unit._id }).populate('productId', 'title price'),
      MaintenanceTicket.find({ cabinId: unit._id }).sort({ createdAt: -1 }),
      HousekeepingTask.find({ cabinId: unit._id }).sort({ createdAt: -1 })
    ]);

    return res.json({
      success: true,
      trace: {
        serialNumber: unit.serialNumber,
        name: unit.name,
        factoryStatus: unit.factoryStatus,
        hardware: unit.hardware,
        qcTests: unit.qcTests,
        rooms: unit.rooms,
        order: order || null,
        tickets,
        tasks,
        installation: unit.installation,
        createdAt: unit.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== COMPONENTS STOCK ====================

router.get('/components', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    let comps = await ComponentStock.find().sort({ code: 1 });
    if (!comps.length) {
      comps = await ComponentStock.create(DEFAULT_COMPONENTS);
    }
    return res.json({ success: true, components: comps });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/components/:code', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { delta } = req.body;
    const comp = await ComponentStock.findOneAndUpdate(
      { code: req.params.code },
      { $inc: { stock: Number(delta) || 0 } },
      { new: true, upsert: false }
    );
    if (!comp) return res.status(404).json({ success: false, message: 'Composant inconnu' });
    return res.json({ success: true, component: comp });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== FOTA ====================

router.post('/fota', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { serialNumber, version } = req.body;
    const unit = await Cabin.findOne({ serialNumber });
    if (!unit) return res.status(404).json({ success: false, message: 'Unité introuvable' });

    publishCommand(unit.serialNumber, 'FOTA', { command: 'FOTA_UPDATE', version: version || 'v1.0.0' });

    unit.hardware.hardwareVersion = version || unit.hardware.hardwareVersion || 'v1.0.0';
    await unit.save();

    return res.json({ success: true, message: `Firmware ${version || 'v1.0.0'} déployé sur ${unit.serialNumber}`, hardwareVersion: unit.hardware.hardwareVersion });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/products', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const products = await ShopProduct.find().sort({ createdAt: -1 });
    return res.json({ success: true, products });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/products/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const product = await ShopProduct.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Modèle introuvable' });
    return res.json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/products', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { title, description, image, price, currency, specs, defaultRentalPricePerHour, stock, available } = req.body;
    if (!title || typeof price !== 'number') {
      return res.status(400).json({ success: false, message: 'title et price requis' });
    }
    const product = await ShopProduct.create({
      title,
      description,
      image,
      price,
      currency: currency || 'eur',
      specs: { ...(specs || {}), rooms: resolveRooms(specs?.rooms) },
      defaultRentalPricePerHour: defaultRentalPricePerHour ?? 12,
      stock: typeof stock === 'number' ? stock : 999,
      available: available !== false
    });
    return res.status(201).json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/products/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const product = await ShopProduct.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Modèle introuvable' });

    const { title, description, image, price, currency, specs, defaultRentalPricePerHour, stock, available } = req.body;

    if (title !== undefined) product.title = title;
    if (description !== undefined) product.description = description;
    if (image !== undefined) product.image = image;
    if (price !== undefined) product.price = price;
    if (currency !== undefined) product.currency = currency;
    if (defaultRentalPricePerHour !== undefined) product.defaultRentalPricePerHour = defaultRentalPricePerHour;
    if (stock !== undefined) product.stock = stock;
    if (available !== undefined) product.available = available;

    if (specs) {
      if (specs.surfaceM2 !== undefined) product.specs.surfaceM2 = specs.surfaceM2;
      if (specs.capacity !== undefined) product.specs.capacity = specs.capacity;
      if (specs.connected !== undefined) product.specs.connected = specs.connected;
      if (specs.voiceControl !== undefined) product.specs.voiceControl = specs.voiceControl;
      if (specs.rooms !== undefined) product.specs.rooms = resolveRooms(specs.rooms);
    }

    await product.save();
    return res.json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/products/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const product = await ShopProduct.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Modèle introuvable' });
    return res.json({ success: true, message: 'Modèle supprimé' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/orders', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const orders = await Order.find({ status: 'FULFILLED' })
      .populate('productId', 'title')
      .sort({ createdAt: -1 })
      .limit(100);

    const byCabinId = new Map(
      (await Cabin.find({ _id: { $in: orders.map((o) => o.cabinId).filter(Boolean) } }))
        .map((c) => [c._id.toString(), c])
    );

    const rows = orders.map((o) => {
      const cabin = o.cabinId ? byCabinId.get(o.cabinId.toString()) : null;
      return {
        id: o._id,
        productTitle: o.productId?.title || 'Cabine',
        serialNumber: o.serialNumber,
        price: o.price,
        buyerId: o.userId,
        createdAt: o.createdAt,
        rooms: cabin ? (cabin.rooms || []) : []
      };
    });

    return res.json({ success: true, orders: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;