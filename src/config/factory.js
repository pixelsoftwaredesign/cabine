const DEFAULT_COMPONENTS = [
  { code: 'esp32', label: 'ESP32 (contrôleur)', stock: 50, unit: 'u' },
  { code: 'relay', label: 'Relais', stock: 200, unit: 'u' },
  { code: 'lock', label: 'Serrure magnétique', stock: 40, unit: 'u' },
  { code: 'display', label: 'Écran tablette', stock: 20, unit: 'u' },
  { code: 'meter', label: 'Compteur d’énergie', stock: 30, unit: 'u' },
  { code: 'badge_reader', label: 'Lecteur badge', stock: 25, unit: 'u' },
  { code: 'sensor_temp', label: 'Capteur température', stock: 80, unit: 'u' },
  { code: 'sensor_hum', label: 'Capteur humidité', stock: 80, unit: 'u' },
  { code: 'led', label: 'Module LED', stock: 120, unit: 'u' },
  { code: 'wifi', label: 'Module Wi-Fi/4G', stock: 35, unit: 'u' }
];

const QC_TESTS = [
  { test: 'RELAYS', label: 'Relais (chauffage, climatisation, LED)' },
  { test: 'SENSORS', label: 'Capteurs (température, humidité, présence)' },
  { test: 'DOOR_LOCK', label: 'Serrure & ouverture porte' },
  { test: 'DISPLAY', label: 'Écran / tablette' },
  { test: 'POWER', label: 'Alimentation & compteur d’énergie' }
];

const HOUSEKEEPING_CHECKLIST = [
  { key: 'linen', label: 'Changement du linge' },
  { key: 'surfaces', label: 'Désinfection des surfaces' },
  { key: 'consumables', label: 'Consommables (savon, eau, essuie-mains)' },
  { key: 'trash', label: 'Poubelles vidées' },
  { key: 'inspection', label: 'Inspection visuelle / équipements' }
];

const INSTALL_PHOTOS = [
  { key: 'armoire', label: 'Armoire électrique' },
  { key: 'globale', label: 'Vue globale de la cabine' },
  { key: 'interieur', label: 'Intérieur / équipement principal' }
];

const ASSEMBLY_STATIONS = [
  { code: 'P1', label: 'Poste 1 — Châssis & isolation', durationMin: 45,
    operations: ['Structure acier', 'Isolation thermique', 'Étanchéité plancher', 'Trains d’arrivées'] },
  { code: 'P2', label: 'Poste 2 — Électrique & armoire', durationMin: 40,
    operations: ['Armoire électrique', 'Alimentation 230V', 'Compteur d’énergie', 'Câblage relais'] },
  { code: 'P3', label: 'Poste 3 — Électronique embarquée', durationMin: 35,
    operations: ['Montage ESP32', 'Capteurs (temp/hum/présence)', 'Serrure magnétique', 'Lecteur badge / TI'] },
  { code: 'P4', label: 'Poste 4 — Fini, écrans & cosmétique', durationMin: 30,
    operations: ['Tablette de contrôle', 'Luminaires LED', 'Ameublement & linge', 'Nettoyage final / écusson'] }
];

const INSTALL_CHECKLIST = [
  { key: 'power', label: 'Raccordement alimentation 230V (disjoncteur, terre)' },
  { key: 'esp32', label: 'ESP32 alimenté et joignable (MQTT)' },
  { key: 'relays', label: 'Relais présents et testés (chauffage / clim / LED)' },
  { key: 'lock', label: 'Serrure magnétique câblée et verrouillage OK' },
  { key: 'tablet', label: 'Tablette de contrôle installée et connectée' }
];

const FIRST_STATUS = 'IN_ASSEMBLY';
const FLOW = ['IN_ASSEMBLY', 'TESTED', 'READY_FOR_SHIPPING', 'SHIPPED', 'INSTALLED', 'DELIVERED_AND_COMMISSIONED'];
const nextFactoryStatus = (current) => {
  const i = FLOW.indexOf(current);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : current;
};

module.exports = {
  DEFAULT_COMPONENTS,
  QC_TESTS,
  HOUSEKEEPING_CHECKLIST,
  INSTALL_PHOTOS,
  INSTALL_CHECKLIST,
  ASSEMBLY_STATIONS,
  FIRST_STATUS,
  FLOW,
  nextFactoryStatus
};