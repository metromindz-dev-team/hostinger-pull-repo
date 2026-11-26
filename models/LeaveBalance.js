import mongoose from "mongoose";

const leaveBalanceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  employeeId: {
    type: String,
    required: true,
    trim: true
  },
  employeeName: {
    type: String,
    required: true,
  },
  
  // 📊 Leave balances grouped by leave type and year
  leaveBalances: [
    {
      leaveId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LeaveMaster",
        required: true,
      },
      leaveName: {
        type: String,
        required: true
      },
      year: {
        type: Number,
        required: true
      },
      // Yearly balances
      yearlyAllocated: Number,
      yearlyUsed: {
        type: Number,
        default: 0
      },
      yearlyRemaining: Number,
      carryForwardFromPrevious: {
        type: Number,
        default: 0
      },
      
      // Monthly breakdown
      monthlyUsage: [{
        month: Number, // 1-12
        year: Number,
        monthlyAllocated: Number,
        monthlyUsed: Number,
        monthlyRemaining: Number,
        lopDays: { // Loss of Pay days for this month
          type: Number,
          default: 0
        }
      }],
      
      // Track all applications with their status
      applications: [{
        applicationId: mongoose.Schema.Types.ObjectId, // Reference to LeaveRequests
        fromDate: Date,
        toDate: Date,
        requestedDays: Number,
        approvedDays: Number,
        lopDays: Number,
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', 'partially_approved'],
          default: 'pending'
        },
        processedAt: Date
      }]
    }
  ],
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("LeaveBalance", leaveBalanceSchema);