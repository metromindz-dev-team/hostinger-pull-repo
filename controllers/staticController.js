import User from '../models/User.js';
import Designation from '../models/Designation.js';
import Department from '../models/Department.js';
import Holiday from '../models/Holiday.js';
import LeaveRequests from '../models/LeaveRequests.js';
import Attendance from '../models/Attendance.js';
import mongoose from 'mongoose';

export const getDashboardCounts = async (req, res) => {
  try {
    const employeesCount = await User.countDocuments();
        const employeesActive = await User.countDocuments({status:"active"});
    const employeesInactive = await User.countDocuments({status:"inactive"});
    const employeesProbation = await User.countDocuments({status:"probation"});
    const employeesPermanent = await User.countDocuments({status:"permanent"});
    const employeesContract = await User.countDocuments({status:"contract"});
    const employeesNotice = await User.countDocuments({status:"notice period"});
    const employeesResigned = await User.countDocuments({status:"resigned"});
        const employeesTerminated = await User.countDocuments({status:"terminated"});


    const designationsCount = await Designation.countDocuments();
    const departmentsCount = await Department.countDocuments();
    const holidaysCount = await Holiday.countDocuments();

    // Fetch today's attendance details for counts (IST boundary range)
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const startOfToday = new Date(nowIST);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(startOfToday.getDate() + 1);

    const activeEmployees = await User.find({ status: "active", role: { $ne: "superadmin" } }).select("_id");
    const activeEmployeeIds = activeEmployees.map(e => e._id);
    const activeEmployeesCount = activeEmployeeIds.length;

    const todayAttendance = await Attendance.find({
      employee: { $in: activeEmployeeIds },
      date: { $gte: startOfToday, $lt: endOfToday }
    });

    let todayPresent = 0;
    let todayAbsent = 0;

    const attendanceMap = new Map();
    todayAttendance.forEach(record => {
      attendanceMap.set(record.employee.toString(), record.status);
    });

    activeEmployeeIds.forEach(empId => {
      const status = attendanceMap.get(empId.toString());
      if (status) {
        if (['present', 'late', 'half_day'].includes(status)) {
          todayPresent++;
        } else if (status === 'absent') {
          todayAbsent++;
        }
      } else {
        todayAbsent++;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        totalEmployees: employeesCount,
        totalDesignations: designationsCount,
        totalDepartments: departmentsCount,
        totalHolidays: holidaysCount,
        totalActive: employeesActive,
        totalInactive: employeesInactive,
        totalProbation: employeesProbation,
        totalPermanent: employeesPermanent,
        totalContract: employeesContract,
        totalResigned: employeesResigned,
        totalTerminated: employeesTerminated,
        totalNotice: employeesNotice,
        todayPresent: todayPresent,
        todayAbsent: todayAbsent,
      },
      message: 'Dashboard counts retrieved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving dashboard counts',
      error: error.message
    });
  }
};

export const getLeaveCounts = async (req, res) => {
  try {
    const isManagementRole = ['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(req.user?.role?.toLowerCase());

    const pipeline = [];

    // Filter by specific employee if they are not admin/management
    if (!isManagementRole && req.user?.id) {
      pipeline.push({
        $match: { employee: new mongoose.Types.ObjectId(req.user.id) }
      });
    }

    pipeline.push(
      // Unwind the leaveRequests array first
      { $unwind: "$leaveRequests" },
      // Then unwind the applications array inside leaveRequests
      { $unwind: "$leaveRequests.applications" },
      // Group by status to get counts
      {
        $group: {
          _id: "$leaveRequests.applications.status",
          count: { $sum: 1 }
        }
      }
    );

    // Using aggregation to count applications in leaveRequests array
    const result = await LeaveRequests.aggregate(pipeline);

    // Convert array to object for easier access
    const statusCounts = {};
    let totalApplications = 0;
    
    result.forEach(item => {      
      statusCounts[item._id] = item.count;
      totalApplications += item.count;
    });

    // Get total leave requests documents count
    let totalLeaveRequests;
    if (!isManagementRole && req.user?.id) {
      totalLeaveRequests = await LeaveRequests.countDocuments({ employee: req.user.id });
    } else {
      totalLeaveRequests = await LeaveRequests.countDocuments();
    }

    // Dynamic pending requests calculation
    let countQuery = {};
    if (!isManagementRole && req.user?.id) {
      countQuery.employee = new mongoose.Types.ObjectId(req.user.id);
    }
    const allDocs = await LeaveRequests.find(countQuery);
    let pendingConvertRequests = 0;
    let pendingCancelRequests = 0;
    let pendingLeaveRequests = 0;

    allDocs.forEach(doc => {
      doc.leaveRequests?.forEach(lr => {
        lr.applications?.forEach(app => {
          if (app.status === 'pending') {
            pendingLeaveRequests++;
          }
          if (app.dailyBreakdown?.some(d => d.modificationStatus === 'conversion_requested')) {
            pendingConvertRequests++;
          }
          if (app.dailyBreakdown?.some(d => d.modificationStatus === 'cancel_requested')) {
            pendingCancelRequests++;
          }
        });
      });
    });

    const response = {
      totalLeaveRequests: totalLeaveRequests,
      totalApplications: totalApplications,
      approved: statusCounts.approved || 0,
      rejected: statusCounts.rejected || 0,
      pending: statusCounts.pending || 0,
      pendingLeaveRequests,
      pendingConvertRequests,
      pendingCancelRequests,
      // Include any other statuses that might exist
      otherStatuses: statusCounts
    };

    res.status(200).json({
      success: true,
      message: "Leave counts fetched successfully",
      data: response
    });

  } catch (error) {
    console.error("Error fetching leave counts:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching leave counts",
      error: error.message
    });
  }
};