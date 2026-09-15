const crypto = require('crypto');
const express = require('express');
const ShopProduct = require('../models/ShopProduct');
const Order = require('../models/Order');
const Cabin = require('../models/Cabin');
const { authMiddleware, requireAdminOr } = require('../middleware/auth');
const { publishSystemConfig } = require('../services/mqttService');
const { resolveRooms } = require('../config/rooms');

const router = express.Router();

// Chaîne commerciale : Vente (ventes) · Service Après-Vente (SAV) · Agent commercial (superviseur).
// Catalogage des produits réservé à la chaîne commerciale + ADMIN.
const CATALOG = requireAdminOr('SALES', 'AFTER_SALES', 'SALES_AGENT', 'MANAGER');

const generateSerial = () => {
  return 'CBN-' + crypto.randomBytes(4).toString('hex').toUpperCase();
};

router.get('/products', async (req, res) => {
  try {
    const products = await ShopProduct.find({ available: true, stock: { $gt: 0 } });
    return res.json({ success: true, products });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/products', authMiddleware, CATALOG, async (req, res) => {
  try {
    const product = await ShopProduct.create(req.body);
    return res.status(201).json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/orders', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await ShopProduct.findById(productId);

    if (!product || !product.available || product.stock <= 0) {
      return res.status(400).json({ success: false, message: 'Produit indisponible' });
    }

    const serialNumber = generateSerial();

    const cabin = await Cabin.create({
      serialNumber,
      name: product.title,
      ownerId: req.user._id,
      operatingMode: 'PERSONAL',
      status: 'OCCUPIED_BY_OWNER',
      rooms: resolveRooms(product.specs?.rooms),
      rentalSettings: {
        pricePerHour: product.defaultRentalPricePerHour,
        isListed: false
      }
    });

    const order = await Order.create({
      userId: req.user._id,
      productId: product._id,
      cabinId: cabin._id,
      serialNumber,
      price: product.price,
      status: 'FULFILLED'
    });

    product.stock -= 1;
    await product.save();

    if (req.user.role === 'GUEST') {
      req.user.role = 'PARTNER';
      await req.user.save();
    }

    publishSystemConfig(serialNumber, {
      event: 'CABIN_PAIRED',
      ownerId: req.user._id,
      orderId: order._id,
      mode: 'PERSONAL'
    });

    return res.status(201).json({
      success: true,
      message: 'Cabine livrée et appairée à votre compte',
      order: { id: order._id, serialNumber },
      cabin: { id: cabin._id, serialNumber, name: cabin.name }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .populate('productId', 'title image')
      .sort({ createdAt: -1 });
    return res.json({ success: true, orders });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;