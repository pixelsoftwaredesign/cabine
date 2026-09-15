// Calcul partagé des primes par agent pour la semaine (utilisé par /primes et le rapport PDF).
// rows: Map avec {name, clear, photos, q, maint?}; P: config PAY; hk/tk: listes criblées (pour photo sur maintenance éventuelle)
function workerPrimes(rows, P, hk, tk) {
  // photo par mission de maintenance : aucune photo exigée, on comptabilise le forfait déplacement
  return [...rows.entries()].map(([k, r]) => {
    const clean = r.clear || 0;
    const maint = r.maint || 0;
    const missions = clean + maint;
    const avgQ = r.q.length ? r.q.reduce((a, b) => a + b, 0) / r.q.length : null;
    const missionPay = Math.round((clean * P.missionRate + maint * P.maintenanceRate) * 100) / 100;
    const photoPay = Math.round((r.photos || 0) * P.photoBonus * 100) / 100;
    const qualityPay = avgQ != null && avgQ >= 4.5 ? Math.round(P.qualityBonus * missions * 100) / 100 : 0;
    const displacementPay = Math.round(missions * P.displacementFlat * 100) / 100;
    const bonusPay = Math.round((photoPay + qualityPay) * 100) / 100;
    const total = Math.round((missionPay + bonusPay + displacementPay) * 100) / 100;
    return [r.name, missions, missionPay, bonusPay, displacementPay, total];
  });
}

module.exports = workerPrimes;