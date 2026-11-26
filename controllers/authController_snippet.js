
// Update user profile
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const updates = req.body;

    // Fields that cannot be updated by the user directly
    const restrictedFields = [
      'role', 
      'permissions', 
      'salaryDetails', 
      'employmentDetails', // Includes designation, department, joining date etc.
      'employeeId',
      'email', // Changing email might require verification, skipping for now
      'password' // Password update should be a separate endpoint
    ];

    restrictedFields.forEach(field => delete updates[field]);

    // Update specific nested fields if provided
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Merge employeePersonal details carefully
    if (updates.employeePersonal) {
      user.employeePersonal = { ...user.employeePersonal, ...updates.employeePersonal };
    }

    // Merge bankDetails carefully
    if (updates.bankDetails) {
        user.bankDetails = { ...user.bankDetails, ...updates.bankDetails };
    }

    // Merge other top-level allowed fields (like name, if we allow it)
    // user.name is usually derived or sync'd, but let's allow updating displayName components
    
    // Save the user
    await user.save();

    // Log activity
    await createActivityLog(
      userId,
      "update_profile",
      `${user.name} updated their profile`,
      req
    );

    const { password: _, ...userData } = user.toObject();
    res.json({ success: true, message: "Profile updated successfully", user: userData });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
