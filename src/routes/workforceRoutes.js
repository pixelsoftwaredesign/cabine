const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const HousekeepingTask = require('../models/HousekeepingTask');
const MaintenanceTicket = require('../models/MaintenanceTicket');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { PAY, WORKFORCE_ROLES } = require('../config/workforce');
const { PDFDoc, nowStr } = require('../services/pdf');

const router = express.Router();
router.use(authMiddleware, requireRole('ADMIN', 'MANAGER'));

const dayStart = (d) => new Date(d.setHours(0, 0, 0, 0));
const weekRange = (weekStart, weekEnd) => {
  const start = weekStart ? new Date(weekStart + 'T00:00:00') : dayStart(new Date(Date.now() - ((new Date().getDay() || 7) - 1) * 86400000));
  const end = weekEnd ? new Date(weekEnd + 'T23:59:59') : new Date(start.getTime() + 6 * 86400000 + 86399999);
  return { start, end };
};

const roles = () => WORKFORCE_ROLES;

// ==================== AGENTS ====================

router.get('/', async (req, res) => {
  try {
    const q = { role: { $in: roles() } };
    if (req.query.role) q.role = req.query.role;
    if (req.query.status) q.workforceStatus = req.query.status;
    const agents = await User.find(q).sort({ createdAt: -1 })
      .select('name email phone role skills assignedZone workforceStatus lastKnownLocation createdAt');
    return res.json({ success: true, agents });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, password, phone, role, skills, assignedZone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'name, email et password requis' });
    if (!WORKFORCE_ROLES.includes(role)) return res.status(400).json({ success: false, message: 'Rôle invalide' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ success: false, message: 'Email déjà enregistré' });

    const agent = await User.create({
      name, email, password, phone: phone || '',
      role,
      skills: Array.isArray(skills) ? skills : [],
      assignedZone: { city: assignedZone?.city || '', region: assignedZone?.region || '' },
      workforceStatus: 'AVAILABLE'
    });
    return res.status(201).json({ success: true, agent });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent introuvable' });
    const { name, phone, role, skills, assignedZone, workforceStatus } = req.body;
    if (name !== undefined) agent.name = name;
    if (phone !== undefined) agent.phone = phone;
    if (role !== undefined && WORKFORCE_ROLES.includes(role)) agent.role = role;
    if (skills !== undefined) agent.skills = skills;
    if (assignedZone !== undefined) agent.assignedZone = { ...agent.assignedZone, ...assignedZone };
    if (workforceStatus !== undefined) agent.workforceStatus = workforceStatus;
    await agent.save();
    return res.json({ success: true, agent });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/location', async (req, res) => {
  try {
    const agent = await User.findById(req.params.id);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent introuvable' });
    const { lat, lng } = req.body;
    agent.lastKnownLocation = { lat: lat || 0, lng: lng || 0, updatedAt: new Date() };
    await agent.save();
    return res.json({ success: true, agent });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== KPIs ====================

router.get('/kpis', async (req, res) => {
  try {
    const completed = await HousekeepingTask.find({ status: 'COMPLETED' })
      .populate('agentUserId', 'name role skills lastKnownLocation')
      .lean();
    const resolved = await MaintenanceTicket.find({ status: 'RESOLVED' })
      .populate('assignedTechId', 'name role skills lastKnownLocation')
      .lean();

    const byAgent = new Map();
    const fmt = (u) => u ? { id: String(u._id), name: u.name, role: u.role, skills: u.skills, lat: u.lastKnownLocation?.lat, lng: u.lastKnownLocation?.lng } : null;

    completed.forEach((t) => {
      const a = t.agentUserId ? String(t.agentUserId._id) : (t.assignedAgent || '__unassigned');
      const row = byAgent.get(a) || { id: a, name: t.agentUserId?.name || t.assignedAgent || 'Non affecté', role: t.agentUserId?.role || 'HOUSEKEEPER', kind: 'hk', missions: 0, minutes: 0, photos: 0, quality: [] };
      row.missions++;
      if (t.startedAt && t.completedAt) row.minutes += (t.completedAt - t.startedAt) / 60000;
      if (t.photos && t.photos.length) row.photos++;
      if (t.qualityScore != null) row.quality.push(t.qualityScore);
      row.lat = t.agentUserId?.lastKnownLocation?.lat ?? row.lat;
      row.lng = t.agentUserId?.lastKnownLocation?.lng ?? row.lng;
      byAgent.set(a, row);
    });

    resolved.forEach((t) => {
      const a = t.assignedTechId ? String(t.assignedTechId._id) : '__unassigned';
      const row = byAgent.get(a) || { id: a, name: t.assignedTechId?.name || 'Technicien', role: 'TECHNICIAN', kind: 'maint', tickets: 0, minutes: 0, photos: 0, quality: [] };
      row.tickets = (row.tickets || 0) + 1;
      if (t.createdAt && t.resolvedAt) row.minutes += (t.resolvedAt - t.createdAt) / 60000;
      byAgent.set(a, row);
    });

    const agents = [...byAgent.values()].map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      kind: a.kind,
      lat: a.lat, lng: a.lng,
      completedTasks: a.missions || 0,
      resolvedTickets: a.tickets || 0,
      avgTimeMinutes: a.minutes ? Math.round((a.minutes / ((a.missions + (a.tickets || 0))) * 10) / 10) : 0,
      photoValidationRate: a.missions ? Math.round((a.photos / a.missions) * 100) : null,
      qualityScore: a.quality.length ? Math.round((a.quality.reduce((x, y) => x + y, 0) / a.quality.length) * 10) / 10 : null
    }));

    const rated = agents.filter((a) => a.qualityScore != null);
    const global = {
      avgQuality: rated.length ? Math.round((rated.reduce((s, a) => s + a.qualityScore, 0) / rated.length) * 10) / 10 : null,
      totalMissions: agents.reduce((s, a) => s + a.completedTasks, 0),
      totalTickets: agents.reduce((s, a) => s + a.resolvedTickets, 0),
      avgCleaningMin: Math.round((completed.reduce((s, t) => s + ((t.startedAt && t.completedAt) ? (t.completedAt - t.startedAt) : 0), 0) / Math.max(1, completed.length)) / 60000),
      avgMaintenanceMin: Math.round((resolved.reduce((s, t) => s + ((t.createdAt && t.resolvedAt) ? (t.resolvedAt - t.createdAt) : 0), 0) / Math.max(1, resolved.length)) / 60000),
      photoConformity: completed.length ? Math.round((completed.filter((t) => t.photos && t.photos.length).length / completed.length) * 100) : null
    };

    return res.json({ success: true, agents, global, skills: require('../config/workforce').SKILLS });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Note qualité d'une mission de nettoyage
router.post('/tasks/:taskId/rate', async (req, res) => {
  try {
    const { qualityScore } = req.body;
    const task = await HousekeepingTask.findById(req.params.taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Mission introuvable' });
    const score = Number(qualityScore);
    if (score < 0 || score > 5) return res.status(400).json({ success: false, message: 'Note entre 0 et 5' });
    task.qualityScore = score;
    task.reviewedBy = req.user.name || req.user.email;
    await task.save();
    return res.json({ success: true, task });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PRIMES + RAPPORT PDF ====================

router.get('/primes', async (req, res) => {
  try {
    const { start, end } = weekRange(req.query.weekStart, req.query.weekEnd);

    const hk = await HousekeepingTask.find({ status: 'COMPLETED', completedAt: { $gte: start, $lt: end } })
      .populate('agentUserId', 'name').lean();
    const tk = await MaintenanceTicket.find({ status: 'RESOLVED', resolvedAt: { $gte: start, $lt: end } })
      .populate('assignedTechId', 'name').lean();

    const rows = new Map();
    hk.forEach((t) => {
      const k = t.agentUserId ? String(t.agentUserId._id) : '__unassigned';
      const r = rows.get(k) || { name: t.agentUserId?.name || t.assignedAgent || 'Non affecté', missions: 0, withPhotos: 0, qualitySum: 0, qualityN: 0 };
      r.missions++;
      if (t.photos && t.photos.length) r.withPhotos++;
      if (t.qualityScore != null) { r.qualitySum += t.qualityScore; r.qualityN++; }
      rows.set(k, r);
    });
    tk.forEach((t) => {
      const k = t.assignedTechId ? String(t.assignedTechId._id) : '__unassigned';
      const r = rows.get(k) || { name: t.assignedTechId?.name || 'Technicien', missions: 0, withPhotos: 0, qualitySum: 0, qualityN: 0 };
      r.maintenance = (r.maintenance || 0) + 1;
      rows.set(k, r);
    });

    const P = PAY;
    const detail = [...rows.entries()].map(([id, r]) => {
      const clean = r.missions || 0, maint = r.maintenance || 0;
      const avgQ = r.qualityN ? r.qualitySum / r.qualityN : null;
      const missions = clean + maint;
      const missionPay = clean * P.missionRate + maint * P.maintenanceRate;
      const photoPay = r.withPhotos * P.photoBonus;
      const qualityPay = (avgQ != null && avgQ >= 4.5) ? P.qualityBonus * missions : 0;
      const displacementPay = missions * P.displacementFlat;
      const total = Math.round((missionPay + photoPay + qualityPay + displacementPay) * 100) / 100;
      return { id, name: r.name, missions, clean, maint, withPhotos: r.withPhotos, avgQuality: avgQ ? Math.round(avgQ * 10) / 10 : null, missionPay, photoPay, qualityPay, displacementPay, total };
    });

    const grandTotal = Math.round(detail.reduce((s, r) => s + r.total, 0) * 100) / 100;
    return res.json({ success: true, week: { start, end }, detail, grandTotal, unit: 'EUR', pay: P });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/report/week', async (req, res) => {
  try {
    const { start, end } = weekRange(req.query.weekStart, req.query.weekEnd);
    const hk = await HousekeepingTask.find({ status: 'COMPLETED', completedAt: { $gte: start, $lt: end } })
      .populate('agentUserId', 'name').lean();
    const tk = await MaintenanceTicket.find({ status: 'RESOLVED', resolvedAt: { $gte: start, $lt: end } })
      .populate('assignedTechId', 'name').lean();

    const rows = new Map();
    hk.forEach((t) => {
      const k = t.agentUserId ? String(t.agentUserId._id) : '__unassigned';
      const r = rows.get(k) || { name: t.agentUserId?.name || t.assignedAgent || 'Non affecté', clear: 0, photos: 0, q: [], mins: [] };
      r.clear++;
      if (t.photos && t.photos.length) r.photos++;
      if (t.qualityScore != null) r.q.push(t.qualityScore);
      if (t.startedAt && t.completedAt) r.mins.push((t.completedAt - t.startedAt) / 60000);
      rows.set(k, r);
    });
    tk.forEach((t) => {
      const k = t.assignedTechId ? String(t.assignedTechId._id) : '__unassigned';
      const r = rows.get(k) || { name: t.assignedTechId?.name || 'Technicien', clear: 0, photos: 0, q: [], mins: [] };
      r.maint = (r.maint || 0) + 1;
      if (t.createdAt && t.resolvedAt) r.mins.push((t.resolvedAt - t.createdAt) / 60000);
      rows.set(k, r);
    });

    const doc = new PDFDoc();
    doc.p(nowStr(), { x: 470 });
    doc.h1('Rapport Hebdomadaire — Personnel terrain');
    doc.p(`Semaine du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')}`);
    doc.p(`Généré par ${req.user.name || req.user.email} — © pixelsoftwaredesign 2026`);
    doc.hr(795);

    const body = [...rows.values()].map((r) => {
      const mins = r.mins.length ? Math.round(r.mins.reduce((a, b) => a + b, 0) / r.mins.length) : 0;
      const q = r.q.length ? (r.q.reduce((a, b) => a + b, 0) / r.q.length).toFixed(1) : '—';
      const photos = r.clear ? Math.round((r.photos / r.clear) * 100) + '%' : '—';
      return [r.name, r.clear + ((r.maint || 0) ? (' + ' + r.maint + ' techn.') : ''), mins + ' min', q, photos];
    });

    doc.p('Performance (nettoyage / maintenance, temps moyen, note qualité, conformité photos)', { size: 9 });
    body.forEach((r) => doc.table([r], { widths: [180, 130, 90, 80, 100], header: false, rowH: 16 }));

    const P = PAY;
    const primes = require('./workerPrimesHelper')(rows, P, hk, tk);
    doc.h1('Décompte des primes & indemnités (EUR)', { y: 60 });
    primes.forEach((r) => doc.table([r], { widths: [150, 70, 70, 70, 70, 80], header: false, rowH: 16 }));

    const buf = doc.render();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="workforce-week-${start.toISOString().slice(0, 10)}.pdf"`);
    return res.send(buf);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur génération rapport' });
  }
});

module.exports = router;