import LeaveMaster from "../models/LeaveMaster.js";
import LeaveBalance from "../models/LeaveBalance.js";
import { createActivityLog } from "./activityLogController.js";

// ✅ Create Leave Type
export const createLeaveType = async (req, res) => {
  try {
    const { leaveName, yearlyCount, monthlyLimit, carryForward, description } = req.body;

    if (!leaveName || yearlyCount === undefined) {
      return res.status(400).json({ message: "Leave name and yearly count are required" });
    }

    const existing = await LeaveMaster.findOne({
      leaveName: { $regex: new RegExp(`^${leaveName}$`, "i") },
    });
    if (existing) return res.status(400).json({ message: "Leave type already exists" });

    const newLeave = await LeaveMaster.create({
      leaveName,
      yearlyCount,
      monthlyLimit,
      carryForward,
      description,
      createdBy: req.user?._id,
    });

      await createActivityLog(
              req.user?.id,
              "leave_created",
              `New Leave ${newLeave.leaveName} created in master settings`,
              req,
              { leaveId: newLeave._id, leaveName: newLeave.leaveName }
            );
    const io = req.app.get('io');
    if (io) io.emit('leave_master_updated', { message: 'New leave type created' });

    res.status(201).json({ message: "Leave type created successfully", leave: newLeave });
  } catch (error) {
    console.error("Error creating leave type:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get All Leave Types
export const getLeaveTypes = async (req, res) => {
  try {
    // Ensure "Work From Home" exists as a standard system option for WFH applications
    let wfhExists = await LeaveMaster.findOne({ 
      $or: [
        { category: "WFH" },
        { leaveName: { $regex: new RegExp("^Work From Home$", "i") } }
      ]
    });
    
    if (!wfhExists) {
      wfhExists = await LeaveMaster.create({
        leaveName: "Work From Home",
        yearlyCount: 999, // Unlimited allocation
        monthlyLimit: 0,
        carryForward: false,
        description: "Standard Work From Home request option",
        category: "WFH",
        createdBy: req.user?._id
      });
    } else if (wfhExists.category !== "WFH") {
       wfhExists.category = "WFH";
       await wfhExists.save();
    }

    const leaves = await LeaveMaster.find().sort({ createdAt: -1 });
    res.status(200).json(leaves);
  } catch (error) {
    console.error("Error in getLeaveTypes:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get Single Leave Type
export const getLeaveTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await LeaveMaster.findById(id);
    if (!leave) return res.status(404).json({ message: "Leave type not found" });
    res.status(200).json(leave);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Update Leave Type
export const updateLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const { leaveName, yearlyCount, monthlyLimit, carryForward, description } = req.body;

    const updatedLeave = await LeaveMaster.findByIdAndUpdate(
      id,
      { leaveName, yearlyCount, monthlyLimit, carryForward, description },
      { new: true, runValidators: true }
    );

    if (!updatedLeave) {
      return res.status(404).json({ message: "Leave type not found" });
    }

      await createActivityLog(
              req.user?.id,
              "leave_updated",
              ` Leave ${updatedLeave.leaveName} updated  in master settings`,
              req,
              { leaveId: updatedLeave._id, leaveName: updatedLeave.leaveName }
            );

    // 🟢 Notify all clients that leave master settings changed
    const io = req.app.get('io');
    if (io) io.emit('leave_master_updated', { message: 'Leave master updated' });

    res.status(200).json({ message: "Leave type updated successfully", leave: updatedLeave });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Delete Leave Type
export const deleteLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedLeave = await LeaveMaster.findByIdAndDelete(id);

    if (!deletedLeave) {
      return res.status(404).json({ message: "Leave type not found" });
    }

    // Clean up deleted leave type from all employee balances
    await LeaveBalance.updateMany(
      {},
      { $pull: { leaveBalances: { leaveId: id } } }
    );

    await createActivityLog(
      req.user?.id,
      "leave_deleted",
      ` Leave ${deletedLeave.leaveName} deleted  in master settings`,
      req,
      { leaveId: deletedLeave._id, leaveName: deletedLeave.leaveName }
    );
    const io = req.app.get('io');
    if (io) io.emit('leave_master_updated', { message: 'Leave type deleted' });

    res.status(200).json({ message: "Leave type deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
