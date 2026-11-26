import mongoose from 'mongoose';

const payslipSchema = new mongoose.Schema({
  // Employee Information
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  employeeName: {
    type: String,
    required: true,
    trim: true
  },
  employeeId: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  designation: {
    type: String,
    required: true,
    trim: true
  },
  joiningDate: {
    type: Date,
    required: true
  },

  // Employee Identification Numbers
  uanNo: {
    type: String,
    trim: true
  },
  esiNo: {
    type: String,
    trim: true
  },
  aadhaarNo: {
    type: String,
    trim: true
  },

  // Bank Details
  bankName: {
    type: String,
    required: true,
    trim: true
  },
  bankAccountNumber: {
    type: String,
    required: true,
    trim: true
  },

  // Attendance & Leave Details
  totalWorkingDays: {
    type: Number,
    required: true,
    min: 0,
    max: 31
  },
  casualLeave: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  lopDays: {
    type: Number,
    min: 0,
    default: 0
  },
  daysWorked: {
    type: Number,
    min: 0
  },

  // Payroll Period
  payrollMonth: {
    type: String,
    required: true,
    enum: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  },
  payrollYear: {
    type: String,
    required: Number,
  },


  // Earnings - Key Value Pair Array
  earnings: [{
    key: {
      type: String,
      required: true,
      trim: true
    },
    value: {
      type: Number,
      required: true,
      min: 0
    }
  }],

  // Deductions - Key Value Pair Array
  deductions: [{
    key: {
      type: String,
      required: true,
      trim: true
    },
    value: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  payrollYear: {
    type: Number,
    required: true,
    default: () => new Date().getFullYear() // Auto current year!
  },

  // Calculated Totals
  totalEarnings: {
    type: Number,
    required: true,
    default: 0
  },
  totalDeductions: {
    type: Number,
    required: true,
    default: 0
  },
  netPay: {
    type: Number,
    required: true,
    default: 0
  },
  employerPF: {
    type: Number,
    default: 0
  },
  employerESI: {
    type: Number,
    default: 0
  },

  // Generation & Status
  // generationDate: {
  //    type: Date,
  //   required: true
  // },
  //   status: {
  //     type: String,
  //     enum: ['draft', 'generated', 'approved', 'paid'],
  //     default: 'draft'
  //   },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Payment Info
  //   paidDate: Date,
  //   paymentMethod: {
  //     type: String,
  //     enum: ['bank_transfer', 'cash', 'cheque'],
  //     default: 'bank_transfer'
  //   }
},
  {
    timestamps: true
  });

// Auto-calculate totals before saving
payslipSchema.pre('save', function (next) {
  // Calculate total earnings
  this.totalEarnings = this.earnings.reduce((total, earning) => {
    return total + (earning.value || 0);
  }, 0);

  // Calculate total deductions
  this.totalDeductions = this.deductions.reduce((total, deduction) => {
    return total + (deduction.value || 0);
  }, 0);

  // Calculate net pay
  this.netPay = this.totalEarnings - this.totalDeductions;

  // Calculate days worked if not provided
  if (!this.daysWorked) {
    this.daysWorked = this.totalWorkingDays - (this.casualLeave || 0) - (this.lopDays || 0);
  }

  next();
});

export default mongoose.model('Payslip', payslipSchema);