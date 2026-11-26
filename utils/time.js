// Helpers for time parsing/formatting

export const parseHHMMToMinutes = (hhmm) => { 
  if (!hhmm || typeof hhmm !== "string") return undefined;
  const [h, m] = hhmm.trim().split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h * 60 + m;
};

export const minutesToHHMM = (mins) => {
  if (mins === undefined || mins === null || Number.isNaN(mins)) return undefined;
  const h = Math.floor(mins / 60);
  const m = Math.abs(mins % 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
};

// Excel time decimals (e.g., 0.5 = 12:00)
export const excelDecimalToHHMM = (num) => {
  if (typeof num !== "number") return num;
  const total = Math.round(num * 24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
};

// Normalize JS Date to midnight (local)
export const atStartOfDay = (d) => {
  const dt = new Date(d);
  dt.setHours(0,0,0,0);
  return dt;
};


// Build month range: [start, nextStart)
export const monthRange = (year, month) => {
  // year: 2025, month: 1..12
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return { start, end };
};