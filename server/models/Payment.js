import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: 'ngn' },
    status: { type: String, default: 'pending' },
    provider: { type: String, default: 'stripe' },
    providerRef: { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model('Payment', paymentSchema);
