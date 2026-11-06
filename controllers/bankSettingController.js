import BankSetting from "../models/BankSetting.js";

export const getBankSetting = async (req, res) => {
  try {
    const setting = await BankSetting.findOne();
    if (!setting) {
      return res.status(200).json({ success: true, item: null });
    }
    res.status(200).json({ success: true, item: setting });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching bank settings", error: error.message });
  }
};

export const upsertBankSetting = async (req, res) => {
  try {
    const {
      bankName,
      accountName,
      accountNumber,
      ifscCode,
      branch,
      companyGstin,
      companyName,
      companyAddress,
      companyEmail,
      companyWebsite,
    } = req.body;

    let logoPath = undefined;
    if (req.file) {
      logoPath = `uploads/documents/${req.file.filename}`;
    } else if (req.body.companyLogo !== undefined) {
      logoPath = req.body.companyLogo;
    }

    let setting = await BankSetting.findOne();
    if (setting) {
      if (bankName !== undefined) setting.bankName = bankName;
      if (accountName !== undefined) setting.accountName = accountName;
      if (accountNumber !== undefined) setting.accountNumber = accountNumber;
      if (ifscCode !== undefined) setting.ifscCode = ifscCode;
      if (branch !== undefined) setting.branch = branch;
      if (companyGstin !== undefined) setting.companyGstin = companyGstin;
      if (companyName !== undefined) setting.companyName = companyName;
      if (companyAddress !== undefined) setting.companyAddress = companyAddress;
      if (companyEmail !== undefined) setting.companyEmail = companyEmail;
      if (companyWebsite !== undefined) setting.companyWebsite = companyWebsite;
      if (logoPath !== undefined) setting.companyLogo = logoPath;
      await setting.save();
    } else {
      setting = await BankSetting.create({
        bankName: bankName || "",
        accountName: accountName || "",
        accountNumber: accountNumber || "",
        ifscCode: ifscCode || "",
        branch: branch || "",
        companyGstin: companyGstin || "",
        companyName: companyName || "",
        companyAddress: companyAddress || "",
        companyEmail: companyEmail || "",
        companyWebsite: companyWebsite || "",
        companyLogo: logoPath || "",
      });
    }

    res.status(200).json({ success: true, message: "Settings saved successfully", item: setting });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error saving settings", error: error.message });
  }
};
