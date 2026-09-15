// Configuration des ressources terrain (Workforce) et du calcul des primes.
module.exports = {
  SKILLS: [
    'ELECTRICAL',
    'IOT_DIAGNOSTIC',
    'ASSEMBLY',
    'PLUMBING',
    'DISINFECTION',
    'TEXTILE',
    'REFILL',
    'HVAC'
  ],

  WORKFORCE_ROLES: ['MANAGER', 'TECHNICIAN', 'HOUSEKEEPER'],

  PAY: {
    missionRate: 4.0, // € / mission nettoyage
    maintenanceRate: 8.0, // € / maintenance résolue
    photoBonus: 0.5, // € si photos fournies
    qualityBonus: 2.0, // € si note qualité >= 4.5
    displacementFlat: 1.5 // € / déplacement forfaitaire par mission
  }
};