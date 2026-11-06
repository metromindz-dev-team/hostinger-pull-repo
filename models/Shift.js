import mongoose from 'mongoose';

const ShiftSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  startTime: { type: String, required: true }, // Format: "09:00"
  endTime: { type: String, required: true },   // Format: "18:00"
  breakDuration: { type: Number, }, // in minutes
  isDefault: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

export default mongoose.model('Shift', ShiftSchema);