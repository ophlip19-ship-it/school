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
    verified: { type: Boolean, default: false },
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
    verified: !!this.verified,
    parentName:
      this.role === 'parent' || this.role === 'admin' ? this.name : undefined,
    driverName: this.role === 'driver' ? this.name : 'David K.',
  };
};

export default mongoose.model('User', userSchema);
