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
    driverLocation: {
      lng: { type: Number, default: null },
      lat: { type: Number, default: null },
      heading: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
    },
    // Blue trail points from pickup → drop-off (driver path in real time)
    trail: [
      {
        lng: { type: Number, required: true },
        lat: { type: Number, required: true },
        at: { type: Date, default: Date.now },
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
    currency: { type: String, default: 'ngn' },
    handoverPin: { type: String, required: true },
    paymentStatus: { type: String, default: 'unpaid' },
    stripePaymentIntentId: { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model('Ride', rideSchema);
