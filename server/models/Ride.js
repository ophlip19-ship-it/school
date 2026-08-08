import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema(
  {
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Child',
      required: true,
    },
    childName: { type: String, required: true },
    pickup: { type: String, required: true },
    dropoff: { type: String, required: true },
    pickupCoords: {
      lng: { type: Number, default: null },
      lat: { type: Number, default: null },
    },
    dropoffCoords: {
      lng: { type: Number, default: null },
      lat: { type: Number, default: null },
    },
    /** Parent GPS at booking time — shared with the assigned driver */
    parentLocation: {
      lng: { type: Number, default: null },
      lat: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      label: { type: String, default: '' },
      updatedAt: { type: Date, default: null },
    },
    driverLocation: {
      lng: { type: Number, default: null },
      lat: { type: Number, default: null },
      heading: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
    },
    // True only after driver confirms pickup; false after dropoff/delivered
    locationSharing: { type: Boolean, default: false, index: true },
    pickedUpAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    // Blue trail points from pickup → drop-off (driver path in real time)
    trail: [
      {
        lng: { type: Number, required: true },
        lat: { type: Number, required: true },
        at: { type: Date, default: Date.now },
      },
    ],
    // Chronological transit feed for parent / admin live UI
    transitFeed: [
      {
        type: { type: String, required: true },
        message: { type: String, required: true },
        at: { type: Date, default: Date.now },
        lng: { type: Number, default: null },
        lat: { type: Number, default: null },
      },
    ],
    rideDate: { type: String, required: true },
    rideTime: { type: String, required: true },
    tripType: { type: String, default: 'pickup' },
    status: {
      type: String,
      default: 'pending_payment',
      index: true,
    },
    fareCents: { type: Number, default: 250000 },
    /** Billed trip distance used for dynamic pricing */
    distanceKm: { type: Number, default: null },
    /** Local pump price (NGN/L) at booking time */
    fuelPricePerLiter: { type: Number, default: null },
    /** Snapshot of fare components for receipts / UI */
    fareBreakdown: {
      distanceKm: { type: Number, default: null },
      fuelPricePerLiter: { type: Number, default: null },
      fuelLiters: { type: Number, default: null },
      fuelCostNaira: { type: Number, default: null },
      laborNaira: { type: Number, default: null },
      baseFareNaira: { type: Number, default: null },
      totalNaira: { type: Number, default: null },
    },
    /**
     * How the driver was chosen:
     *  - choose  → parent picked a specific driver (requested after pay)
     *  - nearest → system picks nearest free driver by map location (assigned after pay)
     *  - pool    → any available driver can accept (open after pay)
     */
    assignMode: {
      type: String,
      enum: ['choose', 'nearest', 'pool'],
      default: 'pool',
    },
    currency: { type: String, default: 'ngn' },
    handoverPin: { type: String, required: true },
    paymentStatus: { type: String, default: 'unpaid' },
    stripePaymentIntentId: { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model('Ride', rideSchema);
