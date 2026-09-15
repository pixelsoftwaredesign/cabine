const ROOM_TYPES = [
  { code: 'chambre', label: 'Chambre à coucher', icon: '🛏️' },
  { code: 'cuisine', label: 'Cuisine', icon: '🍳' },
  { code: 'salon', label: 'Salon', icon: '🛋️' },
  { code: 'salle_a_manger', label: 'Salle à manger', icon: '🍽️' },
  { code: 'salle_de_bain', label: 'Salle de bain', icon: '🚿' },
  { code: 'toilettes', label: 'Toilettes', icon: '🚽' },
  { code: 'bureau', label: 'Bureau', icon: '💼' },
  { code: 'garage', label: 'Garage', icon: '🚗' },
  { code: 'terrasse', label: 'Terrasse', icon: '🌿' },
  { code: 'buanderie', label: 'Buanderie', icon: '👕' },
  { code: 'couloir', label: 'Couloir', icon: '🚪' },
  { code: 'dressing', label: 'Dressing', icon: '👗' },
  { code: 'cave', label: 'Cave / Cellier', icon: '🍷' },
  { code: 'grenier', label: 'Grenier', icon: '🏠' }
];

const VALID_CODES = new Set(ROOM_TYPES.map(r => r.code));

function resolveRooms(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(r => VALID_CODES.has(typeof r === 'string' ? r : r.code))
    .map(r => typeof r === 'string' ? r : r.code);
}

module.exports = { ROOM_TYPES, VALID_CODES, resolveRooms };
