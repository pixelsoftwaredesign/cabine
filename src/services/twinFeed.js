const TwinElement = require('../models/TwinElement');

const attachTwinFeed = (mqttClient, io) => {
  mqttClient.on('message', async (topic, buf) => {
    const m = topic.match(/^cabine\/([^/]+)\/twin\/#/);
    if (m) {
      const parts = topic.split('/');
      const guid = parts[parts.length - 1];
      try {
        const payload = JSON.parse(buf.toString());
        const el = await TwinElement.findOne({ guid });
        if (!el) return;
        if (payload.status) { el.status = payload.status; el.history.push({ ts: new Date(payload.ts) || new Date(), status: payload.status, value: payload.value ?? null }); }
        if (payload.value && typeof payload.value === 'object') el.value = payload.value;
        if (el.history.length > 60) el.history = el.history.slice(-60);
        el.markModified('history');
        await el.save();
        if (io) io.emit('twin:update', { guid: el.guid, cabinSerial: el.cabinSerial, type: el.type, name: el.name, status: el.status, value: el.value, ts: new Date() });
      } catch (err) {
        console.error('[Twin] erreur traitement flux:', err.message);
      }
    }
  });
};

module.exports = attachTwinFeed;