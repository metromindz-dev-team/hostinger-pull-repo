import mongoose from 'mongoose';

const AmountUnitSchema = new mongoose.Schema({
  value: { type: Number, default: 0 },
  unit: { type: String, enum: ['percent','amount'],  }
}, { _id: false });

const ExtraAllowanceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  amount: { type: Number, default: 0 }
}, { _id: false });

const GradeSchema = new mongoose.Schema({
  grade: { type: String, required: true, unique: true,    trim: true,uppercase:true },
  basic: { type: AmountUnitSchema, default: () => ({}) },
  da: { type: AmountUnitSchema, default: () => ({}) },
  hra: { type: AmountUnitSchema, default: () => ({}) },
  pfEnabled: { type: Boolean, default: false },
  pfPercent: { type: Number, default: 0 },
  employerPfPercent: { type: Number, default: 0 },
  esiEnabled: { type: Boolean, default: false },
  esiPercent: { type: Number, default: 0 },
  employerEsiPercent: { type: Number, default: 0 },
  medical: { type: Number, default: 0 },
  pt: { type: Number, default: 0 },
  tds: { type: Number, default: 0 },
  extraAllowances: { type: [ExtraAllowanceSchema], default: [] },
}, { timestamps: true });

export default mongoose.model('Grade', GradeSchema);
