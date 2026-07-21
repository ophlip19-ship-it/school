import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['parent', 'driver', 'admin'],
      required: true,
    },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    vehiclePlate: { type: String, default: '' },
    homeAddress: { type: String, default: 'Home · 12 Admiralty Way, Lekki' },
    homeCoords: {
      lng: { type: Number, default: 3.4734 },
      lat: { type: Number, default: 6.4474 },
    },
    // Latest shared GPS for live maps (drivers & parents)
    lastLocation: {
      lng: { type: Number, default: null },
      lat: { type: Number, default: null },
      heading: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
    },
    verified: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    email: this.email,
    role: this.role,
    name: this.name,
    phone: this.phone || '',
    vehiclePlate: this.vehiclePlate || '',
    homeAddress: this.homeAddress || '',
    homeCoords:
      this.homeCoords?.lng != null && this.homeCoords?.lat != null
        ? { lng: this.homeCoords.lng, lat: this.homeCoords.lat }
        : null,
    lastLocation:
      this.lastLocation?.lng != null && this.lastLocation?.lat != null
        ? {
            lng: this.lastLocation.lng,
            lat: this.lastLocation.lat,
            heading: this.lastLocation.heading || 0,
            updatedAt: this.lastLocation.updatedAt,
          }
        : null,
    verified: !!this.verified,
    suspended: !!this.suspended,
    createdAt: this.createdAt,
    parentName:
      this.role === 'parent' || this.role === 'admin' ? this.name : undefined,
    driverName: this.role === 'driver' ? this.name : 'David K.',
  };
};

export default mongoose.model('User', userSchema);
