// Cycle de vie logistique d'une cabine : vente usine → expédition → assemblage site → décomposition.

const LIFECYCLE = [
  { code: 'FACTORY_PURCHASED', label: 'Achetée en usine', c: 'warn', desc: 'Cabine achetée par le partenaire, en attente d’assemblage' },
  { code: 'READY_FOR_SHIPPING', label: 'Prête à expédier', c: 'blue', desc: 'Assemblée en usine, emballée, prête au chargement' },
  { code: 'IN_TRANSIT', label: 'En transit', c: 'blue', desc: 'Transport vers le site de destination (suivi GPS)' },
  { code: 'ASSEMBLY_IN_PROGRESS', label: 'Assemblage sur site', c: 'warn', desc: 'Technicien en train d’assembler et câbler' },
  { code: 'OPERATIONAL', label: 'En service', c: 'ok', desc: 'Installe, configurée, opérationnelle (location/hôte)' },
  { code: 'DECOMPOSITION_REQUESTED', label: 'Décomposition demandée', c: 'red', desc: 'Hors-service : demande de démontage/transfert' },
  { code: 'DECOMPOSED_IN_STORAGE', label: 'Démontée & stockée', c: 'muted', desc: 'Démontée en pièces détachées, stockée' }
];

// Check-list de démontage = guide inverse de l'assemblage (P4 → P1)
const DECOMPOSITION_STEPS = [
  { key: 'gs', label: 'Mise hors-service de la cabine (verrouillage électrique)' },
  { key: 'p4-cos', label: 'Poste 4 inversé — retrait ameublement, linge & écusson' },
  { key: 'p4-lit', label: 'Poste 4 inversé — dépose des luminaires LED & tablette' },
  { key: 'p3-iot', label: 'Poste 3 inversé — dépose lecteur badge, serrure & capteurs' },
  { key: 'p3-esp', label: 'Poste 3 inversé — retrait documenté de l’ESP32 (purge MQTT)' },
  { key: 'p2-rel', label: 'Poste 2 inversé — sectionnement relais & compteur d’énergie' },
  { key: 'p2-arm', label: 'Poste 2 inversé — dépose de l’armoire électrique' },
  { key: 'p1-iso', label: 'Poste 1 inversé — démontage isolation & structure' }
];

// Composants à scanner lors du démontage (QR individuels)
const DECOMPOSITION_INVENTORY = [
  { key: 'armoire_iot', label: 'Armoire électrique IoT (ESP32)', qrPrefix: 'QR-IOT-' },
  { key: 'tablette', label: 'Tablette Android', qrPrefix: 'QR-TAB-' },
  { key: 'serrure_relais', label: 'Serrure électromagnétique & relais', qrPrefix: 'QR-LCK-' },
  { key: 'panneaux', label: 'Panneaux de structure', qrPrefix: 'QR-STR-' }
];

// Transporteurs disponibles pour le bordereau de livraison
const CARRIERS = [
  { code: 'DHL', label: 'DHL Express' },
  { code: 'COLLISSIMO', label: 'Collissimo' },
  { code: 'TRANS', label: 'Transporteur Partenaire' },
  { code: 'OCTROI', label: 'Flotte Octroi' }
];

// Motifs de décomposition / relocation
const DECOMPOSITION_REASONS = [
  'RELOCATION', 'RETURN_TO_FACTORY', 'SALE_RESALE', 'END_OF_USE', 'OTHER'
];

const lifecycleLabel = (code) => (LIFECYCLE.find((l) => l.code === code) || {}).label || code;

module.exports = {
  LIFECYCLE,
  DECOMPOSITION_STEPS,
  DECOMPOSITION_INVENTORY,
  CARRIERS,
  DECOMPOSITION_REASONS,
  lifecycleLabel
};