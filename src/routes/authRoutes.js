const express = require('express');
const User = require('../models/User');
const { authMiddleware, signToken } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email déjà utilisé' });
    }

    const user = await User.create({ email, password, name, phone, role: role || 'GUEST' });
    const token = signToken(user);

    return res.status(201).json({
      success: true,
      token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    const token = signToken(user);
    return res.json({
      success: true,
      token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  return res.json({
    success: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      stripeAccountStatus: req.user.stripeAccountStatus
    }
  });
});

module.exports = router;