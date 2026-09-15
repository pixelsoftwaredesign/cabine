require('dotenv').config();
const connectDB = require('./src/config/db');
const User = require('./src/models/User');
const Cabin = require('./src/models/Cabin');
const ShopProduct = require('./src/models/ShopProduct');
const Rule = require('./src/models/Rule');

const seed = async () => {
  await connectDB();

  let admin = await User.findOne({ email: 'admin@cabine.com' });
  if (!admin) {
    admin = await User.create({
      email: 'admin@cabine.com',
      password: 'admin123',
      name: 'Administrateur Plateforme',
      phone: '+21600000000',
      role: 'ADMIN'
    });
    console.log('Admin créé -> admin@cabine.com / admin123');
  } else {
    console.log('Admin déjà présent');
  }

  let partner = await User.findOne({ email: 'partner@cabine.com' });
  if (!partner) {
    partner = await User.create({
      email: 'partner@cabine.com',
      password: 'partner123',
      name: 'Partenaire Demo',
      phone: '+21611111111',
      role: 'PARTNER'
    });
    console.log('Partenaire créé -> partner@cabine.com / partner123');
  }

  // --- Cabines géo-localisées pour la carte ---
  const cabinCount = await Cabin.countDocuments();
  if (cabinCount === 0) {
    await Cabin.create([
      {
        serialNumber: 'CBN-SOUSSE-BEACH',
        ownerId: partner._id,
        name: 'Cabine Sousse Beach',
        address: 'Plage de Sousse, Tunisie',
        operatingMode: 'HOST_RENTAL',
        status: 'AVAILABLE',
        rentalSettings: { pricePerHour: 45, isListed: true, autoAcceptBookings: true },
        location: { country: 'TN', countryName: 'Tunisie', city: 'Sousse', coordinates: { lat: 35.8256, lng: 10.6369 } },
        pricing: { currency: 'TND', displayCurrency: 'TND' }
      },
      {
        serialNumber: 'CBN-TUNIS-CARTHAGE',
        ownerId: partner._id,
        name: 'Cabine Carthage',
        address: 'Carthage, Tunis',
        operatingMode: 'HOST_RENTAL',
        status: 'AVAILABLE',
        rentalSettings: { pricePerHour: 55, isListed: true, autoAcceptBookings: true },
        location: { country: 'TN', countryName: 'Tunisie', city: 'Tunis', coordinates: { lat: 36.8530, lng: 10.1800 } },
        pricing: { currency: 'TND', displayCurrency: 'TND' }
      },
      {
        serialNumber: 'CBN-HAMMAMET',
        ownerId: partner._id,
        name: 'Cabine Hammamet Resort',
        address: 'Hammamet Medina',
        operatingMode: 'HOST_RENTAL',
        status: 'AVAILABLE',
        rentalSettings: { pricePerHour: 60, isListed: true, autoAcceptBookings: true },
        location: { country: 'TN', countryName: 'Tunisie', city: 'Hammamet', coordinates: { lat: 36.4000, lng: 10.6167 } },
        pricing: { currency: 'TND', displayCurrency: 'TND' }
      },
      {
        serialNumber: 'CBN-PARIS-MONTAIGNE',
        ownerId: partner._id,
        name: 'Cabine Paris Montaigne',
        address: '8 Av. Montaigne, Paris',
        operatingMode: 'HOST_RENTAL',
        status: 'AVAILABLE',
        rentalSettings: { pricePerHour: 12, isListed: true, autoAcceptBookings: true },
        location: { country: 'FR', countryName: 'France', city: 'Paris', coordinates: { lat: 48.8698, lng: 2.3075 } },
        pricing: { currency: 'EUR', displayCurrency: 'EUR' }
      },
      {
        serialNumber: 'CBN-NICE-PLAGE',
        ownerId: partner._id,
        name: 'Cabine Nice Plage',
        address: 'Promenade des Anglais, Nice',
        operatingMode: 'HOST_RENTAL',
        status: 'AVAILABLE',
        rentalSettings: { pricePerHour: 15, isListed: true, autoAcceptBookings: true },
        location: { country: 'FR', countryName: 'France', city: 'Nice', coordinates: { lat: 43.7102, lng: 7.2620 } },
        pricing: { currency: 'EUR', displayCurrency: 'EUR' }
      },
      {
        serialNumber: 'CBN-MARRAKECH-MEDINA',
        ownerId: partner._id,
        name: 'Cabine Marrakech Medina',
        address: 'Derb Dabachi, Marrakech',
        operatingMode: 'HOST_RENTAL',
        status: 'AVAILABLE',
        rentalSettings: { pricePerHour: 80, isListed: true, autoAcceptBookings: true },
        location: { country: 'MA', countryName: 'Maroc', city: 'Marrakech', coordinates: { lat: 31.6295, lng: -7.9811 } },
        pricing: { currency: 'MAD', displayCurrency: 'MAD' }
      },
      {
        serialNumber: 'CBN-CASABLANCA-MARINA',
        ownerId: partner._id,
        name: 'Cabine Casa Marina',
        address: 'Boulevard de la Corniche, Casablanca',
        operatingMode: 'HOST_RENTAL',
        status: 'AVAILABLE',
        rentalSettings: { pricePerHour: 90, isListed: true, autoAcceptBookings: true },
        location: { country: 'MA', countryName: 'Maroc', city: 'Casablanca', coordinates: { lat: 33.5850, lng: -7.6226 } },
        pricing: { currency: 'MAD', displayCurrency: 'MAD' }
      },
      {
        serialNumber: 'CBN-ALGER-CENTRE',
        ownerId: partner._id,
        name: 'Cabine Alger Centre',
        address: 'Bab El Oued, Alger',
        operatingMode: 'HOST_RENTAL',
        status: 'AVAILABLE',
        rentalSettings: { pricePerHour: 3000, isListed: true, autoAcceptBookings: true },
        location: { country: 'DZ', countryName: 'Algérie', city: 'Alger', coordinates: { lat: 36.7538, lng: 3.0588 } },
        pricing: { currency: 'DZD', displayCurrency: 'DZD' }
      }
    ]);
    console.log('8 cabines géo-localisées créées (TN, FR, MA, DZ)');
  } else {
    console.log('Cabines déjà présentes (' + cabinCount + ')');
  }

  const products = await ShopProduct.countDocuments();
  if (products === 0) {
    await ShopProduct.create([
      {
        title: 'Cabine Connectée Standard',
        description: 'Cabine 20m² tout équipée : serrure connectée, éclairage, climatisation, contrôle vocal.',
        image: 'https://picsum.photos/seed/cabin1/600/400',
        price: 18500,
        specs: { surfaceM2: 20, capacity: 2, connected: true, voiceControl: true },
        defaultRentalPricePerHour: 12,
        stock: 8
      },
      {
        title: 'Cabine Connectée Premium',
        description: 'Cabine 35m² : capteurs avancés, domotique complète, autonomie solaire optionnelle.',
        image: 'https://picsum.photos/seed/cabin2/600/400',
        price: 32500,
        specs: { surfaceM2: 35, capacity: 4, connected: true, voiceControl: true },
        defaultRentalPricePerHour: 18,
        stock: 5
      },
      {
        title: 'Maison Intelligente Villa IoT',
        description: 'Villa 80m² 3 chambres, pilotage multi-zones chauffage/éclairage, sécurité connectée.',
        image: 'https://picsum.photos/seed/cabin3/600/400',
        price: 87500,
        specs: { surfaceM2: 80, capacity: 6, connected: true, voiceControl: true },
        defaultRentalPricePerHour: 35,
        stock: 3
      }
    ]);
    console.log('3 produits boutique créés');
  } else {
    console.log('Produits déjà présents');
  }

  const rules = await Rule.countDocuments();
  if (rules === 0) {
    await Rule.create({
      name: 'Ventilation auto > 25°C',
      ownerId: partner._id,
      cabinId: null,
      condition: { field: 'temperature', operator: '>', threshold: 25 },
      action: { device: 'ventilation', value: 'ON' },
      resetAction: { device: 'ventilation', value: 'OFF' },
      enabled: true
    });
    console.log('Règle d\'automatisation créée');
  }

  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});