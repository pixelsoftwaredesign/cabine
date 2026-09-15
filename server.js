require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const connectDB = require('./src/config/db');
const initSockets = require('./src/sockets/iotHandler');
const startAutomation = require('./src/services/automationService');

const authRoutes = require('./src/routes/authRoutes');
const reservationRoutes = require('./src/routes/reservationRoutes');
const cabinPartnerRoutes = require('./src/routes/cabinPartnerRoutes');
const cabinSearchRoutes = require('./src/routes/cabinSearchRoutes');
const partnerDashboardRoutes = require('./src/routes/partnerDashboardRoutes');
const accessRoutes = require('./src/routes/accessRoutes');
const controlRoutes = require('./src/routes/controlRoutes');
const automationRoutes = require('./src/routes/automationRoutes');
const shopRoutes = require('./src/routes/shopRoutes');
const factoryRoutes = require('./src/routes/factoryRoutes');
const installerRoutes = require('./src/routes/installerRoutes');
const housekeepingRoutes = require('./src/routes/housekeepingRoutes');
const ticketRoutes = require('./src/routes/ticketRoutes');
const spaceRoutes = require('./src/routes/spaceRoutes');
const workforceRoutes = require('./src/routes/workforceRoutes');
const lifecycleRoutes = require('./src/routes/lifecycleRoutes');
const twinRoutes = require('./src/routes/twinRoutes');
const indoorEditorRoutes = require('./src/routes/indoorEditorRoutes');
const attachTwinFeed = require('./src/services/twinFeed');
const mqttClient = require('./src/config/mqtt');
const deviceRoutes = require('./src/routes/deviceRoutes');
const biometricRoutes = require('./src/routes/biometricRoutes');
const { router: paymentRoutes, webhookHandler } = require('./src/routes/paymentRoutes');

const app = express();

const ALLOWED_ORIGINS = [
  'https://cabine.pixelsoftwaredesign.xyz',
  'https://cabine-9qr.pages.dev',
  'https://cabine-backend.onrender.com',
  'http://localhost:3000'
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Origin non autorisée'));
  },
  credentials: true
}));

// Hébergement virtuel : maps.pixelsoftwaredesign.xyz → Carte des cabines
const path = require('path');
const CABIN_MAP_HOSTS = ['maps.pixelsoftwaredesign.xyz'];
app.use((req, res, next) => {
  const host = String(req.headers.host || '').toLowerCase();
  if (CABIN_MAP_HOSTS.includes(host) && req.path === '/') {
    return res.sendFile(path.join(__dirname, 'public', 'map.html'));
  }
  next();
});

app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' }
});

const start = async () => {
  await connectDB();

  initSockets(io);
  startAutomation(io);
  attachTwinFeed(mqttClient, io);

  const rawBody = express.raw({ type: 'application/json' });
  app.post('/api/payments/webhook', rawBody, webhookHandler);

  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

  app.use('/api/auth', authRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.use('/api/partner/dashboard', partnerDashboardRoutes);
  app.use('/api/partner', cabinPartnerRoutes);
  app.use('/api/cabins', cabinSearchRoutes);
  app.use('/api/access', accessRoutes);
  app.use('/api/control', controlRoutes);
  app.use('/api/automation', automationRoutes);
  app.use('/api/shop', shopRoutes);
  app.use('/api/factory', factoryRoutes);
  app.use('/api/installer', installerRoutes);
  app.use('/api/housekeeping', housekeepingRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/spaces', spaceRoutes);
  app.use('/api/workforce', workforceRoutes);
  app.use('/api/lifecycle', lifecycleRoutes);
  app.use('/api/twin', twinRoutes);
  app.use('/api/map/editor', indoorEditorRoutes);
  app.use('/api', deviceRoutes);
  app.use('/api/biometrics', biometricRoutes);
  app.use('/api/payments', paymentRoutes);

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Serveur IoT en écoute sur le port ${PORT}`);
  });
};

start();