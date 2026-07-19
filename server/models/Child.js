import mongoose from 'mongoose';

const childSchema = new mongoose.Schema(
  {
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    school: { type: String, default: 'Greenfield School' },
    grade: { type: String, default: 'Grade 5' },
  },
  { timestamps: true },
);

childSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    school: this.school,
    grade: this.grade,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('Child', childSchema);
