const mongoose = require('mongoose');

const CabinSchema = new mongoose.Schema(
  {
    serialNumber: { type: String, required: true, unique: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    address: { type: String },

    location: {
      country: { type: String, uppercase: true, default: 'TN', index: true },
      countryName: { type: String, default: 'Tunisie' },
      city: { type: String, default: '' },
      coordinates: {
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 }
      }
    },

    pricing: {
      currency: { type: String, enum: ['EUR', 'TND', 'USD', 'GBP', 'MAD', 'DZD'], default: 'EUR' },
      displayCurrency: { type: String, enum: ['EUR', 'TND', 'USD', 'GBP', 'MAD', 'DZD'], default: 'EUR' }
    },

    operatingMode: {
      type: String,
      enum: ['PERSONAL', 'HOST_RENTAL'],
      default: 'PERSONAL'
    },

    rentalSettings: {
      pricePerHour: { type: Number, default: 0 },
      isListed: { type: Boolean, default: false },
      autoAcceptBookings: { type: Boolean, default: true }
    },

    status: {
      type: String,
      enum: ['AVAILABLE', 'OCCUPIED_BY_GUEST', 'OCCUPIED_BY_OWNER', 'CLEANING_REQUIRED', 'MAINTENANCE'],
      default: 'AVAILABLE'
    },

    telemetry: {
      temperature: { type: Number, default: 0 },
      humidity: { type: Number, default: 0 },
      presence: { type: Boolean, default: false },
      lockStatus: { type: String, enum: ['LOCKED', 'UNLOCKED'], default: 'LOCKED' },
      lastUpdate: { type: Date }
    },
    guestState: { type: String, enum: ['OUTSIDE', 'INSIDE'], default: 'OUTSIDE' },
    guestEnteredAt: { type: Date },
    guestExitedAt: { type: Date },

    rooms: { type: [String], default: [] },

    indoor: {
      spaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', default: null },
      level: { type: String, default: '' },
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      rotation: { type: Number, default: 0 }
    },

    factoryStatus: {
      type: String,
      enum: ['IN_ASSEMBLY', 'TESTED', 'READY_FOR_SHIPPING', 'SHIPPED', 'INSTALLED', 'DELIVERED_AND_COMMISSIONED'],
      default: 'DELIVERED_AND_COMMISSIONED'
    },

    hardware: {
      hardwareVersion: { type: String, default: '' },
      esp32MacAddress: { type: String, default: '' },
      mqttUsername: { type: String, default: '' },
      mqttCertificate: { type: String, default: '' },
      productionDate: { type: Date }
    },

    pairingToken: { type: String, default: '' },

    qcTests: [
      {
        test: { type: String },
        result: { type: String, enum: ['PASS', 'FAIL', 'PENDING'], default: 'PENDING' },
        details: { type: String, default: '' },
        testedAt: { type: Date }
      }
    ],

    assembly: [
      {
        station: { type: String, enum: ['P1', 'P2', 'P3', 'P4'] },
        label: { type: String, default: '' },
        status: { type: String, enum: ['DONE', 'PENDING'], default: 'PENDING' },
        operations: [{ label: String, done: Boolean }],
        doneBy: { type: String, default: '' },
        startedAt: { type: Date },
        completedAt: { type: Date }
      }
    ],

    installation: {
      installedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      installedAt: { type: Date },
      photos: { type: [String], default: [] },
      notes: { type: String, default: '' },
      signature: { type: String, default: '' },
      commissionedAt: { type: Date },
      checklist: [{ key: String, label: String, done: Boolean, checkedAt: Date }],
      pvId: { type: String, default: '' }
    },

    housekeepingState: {
      type: String,
      enum: ['CLEAN', 'DIRTY', 'IN_PROGRESS'],
      default: 'CLEAN'
    },

    lifecycle: {
      status: {
        type: String,
        enum: ['FACTORY_PURCHASED', 'READY_FOR_SHIPPING', 'IN_TRANSIT', 'ASSEMBLY_IN_PROGRESS', 'OPERATIONAL', 'DECOMPOSITION_REQUESTED', 'DECOMPOSED_IN_STORAGE'],
        default: 'OPERATIONAL'
      }
    },

    shippingDetails: {
      trackingNumber: { type: String, default: '' },
      carrierName: { type: String, default: '' },
      destinationAddress: { type: String, default: '' },
      dock: { type: String, default: '' },
      packedAt: { type: Date },
      shippedAt: { type: Date },
      packingQR: { type: String, default: '' }
    },

    logistics: {
      carrier: { type: String, default: '' },
      vehicle: { type: String, default: '' },
      lastLat: { type: Number, default: 0 },
      lastLng: { type: Number, default: 0 },
      lastUpdate: { type: Date },
      waypoints: [{ lat: Number, lng: Number, ts: Date }]
    },

    lifecycleEvents: [
      {
        at: { type: Date, default: Date.now },
        from: { type: String, default: '' },
        to: { type: String, default: '' },
        action: { type: String, default: '' },
        by: { type: String, default: 'système' },
        details: { type: String, default: '' }
      }
    ],

    decomposition: {
      orderId: { type: String, default: '' },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      requestedAt: { type: Date },
      reason: { type: String, default: '' },
      targetDestination: { type: String, default: '' },
      technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      associate: { type: String, default: '' },
      assignedAt: { type: Date },
      steps: [{ key: String, label: String, done: Boolean, at: Date }],
      inventory: [{ key: String, label: String, scanValue: String, scannedAt: Date }],
      photos: { type: [String], default: [] },
      notes: { type: String, default: '' },
      submittedAt: { type: Date },
      result: { type: String, enum: ['STORAGE', 'TRANSFER'], default: 'STORAGE' }
    }
  },
  { timestamps: true }
);

CabinSchema.index({ 'indoor.spaceId': 1, 'indoor.level': 1 });

module.exports = mongoose.model('Cabin', CabinSchema);