/**
 * Calculate payroll components based on the standard formulas
 * 
 * @param {Object} params
 * @param {number} params.ctc Monthly CTC
 * @param {number} params.bonusOrOtherDeduction Bonus/Deduction adjustment
 * @param {number} params.totalDays Total days in the payroll period
 * @param {number} params.payableDays Number of payable (present/worked) days
 * @param {number} params.tds Tax Deducted at Source
 * @param {number} params.otherDeductions Other manual deductions
 * @returns {Object} Full payroll calculation breakdown rounded to 2 decimal places
 */
export const calculatePayroll = ({
  ctc,
  bonusOrOtherDeduction = 0,
  totalDays,
  payableDays,
  tds = 0,
  otherDeductions = 0
}) => {
  // Validate inputs
  const parsedTotalDays = Number(totalDays);
  const parsedPayableDays = Number(payableDays);
  const parsedCtc = Number(ctc);
console.log(parsedCtc);

  if (isNaN(parsedTotalDays) || parsedTotalDays <= 0) {
    throw new Error("totalDays must be greater than 0");
  }
  if (isNaN(parsedPayableDays) || parsedPayableDays < 0 || parsedPayableDays > parsedTotalDays) {
    throw new Error("payableDays must be between 0 and totalDays");
  }
  if (isNaN(parsedCtc) || parsedCtc <= 0) {
    throw new Error("ctc must be numeric and greater than 0");
  }

  const numericBonus = Number(bonusOrOtherDeduction) || 0;
  const numericTds = Number(tds) || 0;
  const numericOtherDeductions = Number(otherDeductions) || 0;

  // 1. Monthly Gross Earnings
  const monthlyGross = (parsedCtc - numericBonus) * (parsedPayableDays / parsedTotalDays);

  // 2. Salary Breakdown
  const basic = monthlyGross * 0.50;
  const da = monthlyGross * 0.30;
  const hra = monthlyGross * 0.20;

  // 3. Total Earnings
  const totalEarnings = basic + da + hra;

  // 4. ESI Employee Contribution
  let esiEmployee = 0;
  if (parsedCtc <= 21000) {
    esiEmployee = (parsedCtc * 0.75 / 104) * (parsedPayableDays / parsedTotalDays);
  }

  // 5. ESI Employer Contribution
  let esiEmployer = 0;
  if (parsedCtc <= 21000) {
    esiEmployer = (parsedCtc * 3.25 / 104) * (parsedPayableDays / parsedTotalDays);
  }

  // 6. Professional Tax (PT)
  let pt = 0;
  if (parsedCtc >= 25000) {
    pt = 200;
  }

  // 9. Total Deduction (Deducting both Employee and Employer ESI from employee's salary)
  const totalDeduction = esiEmployee + esiEmployer + numericTds + pt + numericOtherDeductions;

  // 10. Net Payable
  const netPayable = totalEarnings - totalDeduction;

  // Rounding helper (to nearest integer)
  const round = (val) => Math.round(val);

  return {
    ctc: round(parsedCtc),
    monthlyGross: round(monthlyGross),
    basic: round(basic),
    da: round(da),
    hra: round(hra),
    totalEarnings: round(totalEarnings),
    esiEmployee: round(esiEmployee),
    esiEmployer: round(esiEmployer),
    pt: round(pt),
    tds: round(numericTds),
    otherDeductions: round(numericOtherDeductions),
    totalDeduction: round(totalDeduction),
    netPayable: round(netPayable)
  };
};
