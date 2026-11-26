import mongoose from "mongoose";

const leaveRequestsSchema = new mongoose.Schema({
  // 🔗 Link to Employee (User)
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

  // 📋 Array of leave requests grouped by leave type
  leaveRequests: [
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
      // 📝 Array of individual leave applications for this leave type
      applications: [{
        fromDate: { 
          type: Date, 
          required: true 
        },
        toDate: { 
          type: Date, 
          required: true 
        },
        numberOfDays: { 
          type: Number, 
          required: true 
        },
        totalDays: {
          type: Number,
          required: true
        },
        excludedDays: {
          type: Number,
          default: 0
        },
        reason: { 
          type: String, 
          required: true 
        },
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', 'partially_approved', 'cancelled'],
          default: 'pending'
        },
        dayType: {
          type: String,
          enum: ['full', 'first_half', 'second_half'],
          default: 'full'
        },
        approvedDays: {
          type: Number,
          default: 0
        },
        lopDays: {
          type: Number,
          default: 0
        },
        approvedBy: {
          type: String
        },
        dailyBreakdown: [{
          date: {
            type: Date,
            required: true
          },
          status: {
            type: String,
            enum: ['leave', 'wfh', 'weeklyOff', 'holiday'],
            required: true
          },
          dayType: {
            type: String,
            enum: ['full', 'first_half', 'second_half'],
            default: 'full'
          },
          leaveId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LeaveMaster"
          },
          leaveName: {
            type: String
          },
          previousLeaveId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LeaveMaster"
          },
          previousLeaveName: {
            type: String
          },
          modificationStatus: {
            type: String,
            enum: ['none', 'cancel_requested', 'cancelled', 'conversion_requested', 'converted'],
            default: 'none'
          },
          requestedLeaveId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LeaveMaster"
          },
          requestedLeaveName: {
            type: String
          },
          requestedDayType: {
            type: String,
            enum: ['full', 'first_half', 'second_half']
          },
          approvedBy: {
            type: String
          }
        }],
        history: [{
          actionType: {
            type: String,
            required: true
          },
          userName: {
            type: String,
            required: true
          },
          userRole: {
            type: String
          },
          remarks: {
            type: String
          },
          date: {
            type: Date,
            default: Date.now
          },
          details: {
            type: mongoose.Schema.Types.Mixed
          }
        }]
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

export default mongoose.model("LeaveRequests", leaveRequestsSchema);