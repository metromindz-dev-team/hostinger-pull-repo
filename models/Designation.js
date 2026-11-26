import mongoose from 'mongoose';

const designationSchema = new mongoose.Schema({
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
   departmentName: {
      type: String,
      required: true,
      trim: true,
    },
  name: {
    type: String,
    required: true,
    trim: true
  },
  level: {
    type: Number,
    default: 1 // optional (can use for hierarchy)
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, { timestamps: true });

// Ensure (department, name) combination is unique
designationSchema.index({ department: 1, name: 1 }, { unique: true });

export default mongoose.model('Designation', designationSchema);
