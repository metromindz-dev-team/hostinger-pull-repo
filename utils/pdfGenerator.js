/**
 * Generates a structured, professional PDF Tax Invoice buffer.
 */
export function generateInvoicePdf(invoice, order) {
  const esc = (v) =>
    String(v ?? "")
      .replace(/([\\\(\)])/g, "\\$1")
      .replace(/[\r\n]/g, " ");

  const issuedDate = new Date(invoice.issuedAt || Date.now()).toLocaleDateString("en-IN");
  const dueDate = invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString("en-IN") : "-";
  const customerName = invoice.customerName || order?.customer?.fullName || invoice.customer?.fullName || "Guest Customer";
  const customerEmail = invoice.customerEmail || order?.customer?.email || invoice.customer?.email || "-";
  const orderNumber = invoice.orderNumber || order?.orderNumber || "#ORD-MANUAL";
  const amount = Number(invoice.amount || 0);
  const status = String(invoice.status || "pending").toUpperCase();

  const subtotal = amount / 1.18;
  const tax = amount - subtotal;
  const cgst = tax / 2;
  const sgst = cgst;

  // Build stream content using standard PDF operators (vector lines, boxes, and text)
  let stream = "";

  // Helper to add text
  const addText = (text, x, y, size = 10, font = "/F1") => {
    stream += `BT ${font} ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET\n`;
  };

  // Helper to draw horizontal line
  const addLine = (x1, y1, x2, y2, r = 0.88, g = 0.91, b = 0.94, width = 1) => {
    stream += `${r} ${g} ${b} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
  };

  // Helper to draw filled rectangle
  const addRect = (x, y, w, h, fillR = 0.97, fillG = 0.98, fillB = 0.99, strokeR = 0.88, strokeG = 0.91, strokeB = 0.94) => {
    stream += `${strokeR} ${strokeG} ${strokeB} RG ${fillR} ${fillG} ${fillB} rg 1 w ${x} ${y} ${w} ${h} B\n`;
  };

  // 1. Company Brand Header
  // Amber logo box
  stream += `0.96 0.62 0.04 rg 50 782 28 28 re f\n`;
  addText("M", 59, 791, 16, "/F2");

  addText("METROMINDZ COMMERCE", 86, 798, 14, "/F2");
  addText("Lifestyle Electronics & Official Retail Store", 86, 786, 8, "/F1");
  addText("102 Metro Residency, MG Road, Indiranagar, Bengaluru - 560038", 86, 775, 7.5, "/F1");
  addText("GSTIN: 29ABCDE1234F1Z5  |  CIN: U72900KA2026PTC109283", 86, 764, 7.5, "/F1");

  // Right Header Badge & Invoice Meta
  stream += `0.99 0.95 0.78 rg 0.96 0.62 0.04 RG 0.75 w 425 790 120 18 re B\n`;
  addText("TAX INVOICE / ORIGINAL", 435, 796, 7.5, "/F2");

  addText(invoice.invoiceNumber, 425, 772, 12, "/F2");
  addText(`Date: ${issuedDate}`, 425, 759, 8, "/F1");
  addText(`Due: ${dueDate}`, 425, 748, 8, "/F1");

  // Divider
  addLine(50, 736, 545, 736);

  // 2. Customer & Order Details (Two boxes)
  // Left Box: Billed To
  addRect(50, 655, 240, 68);
  addText("BILLED TO (CUSTOMER DETAILS)", 60, 710, 7.5, "/F2");
  addText(customerName, 60, 696, 9.5, "/F2");
  addText(customerEmail, 60, 683, 8, "/F1");
  addText(order?.shippingAddress || "Registered Customer Delivery Address", 60, 670, 7.5, "/F1");

  // Right Box: Order Reference
  addRect(305, 655, 240, 68);
  addText("ORDER & PAYMENT REFERENCE", 315, 710, 7.5, "/F2");
  addText(`Order ID:  ${orderNumber}`, 315, 696, 8.5, "/F1");
  addText(`Payment Status:  ${status}`, 315, 683, 8.5, "/F2");
  addText(`Place of Supply:  Karnataka (29)`, 315, 670, 8, "/F1");

  // 3. Line Items Table
  addRect(50, 615, 495, 20, 0.94, 0.96, 0.98, 0.8, 0.84, 0.88);
  addText("S.No", 58, 621, 7.5, "/F2");
  addText("Item Description", 95, 621, 7.5, "/F2");
  addText("HSN / SAC", 280, 621, 7.5, "/F2");
  addText("Qty", 350, 621, 7.5, "/F2");
  addText("Unit Price", 400, 621, 7.5, "/F2");
  addText("Total (INR)", 480, 621, 7.5, "/F2");

  // Rows
  const items = invoice.items?.length
    ? invoice.items
    : order?.items?.length
    ? order.items
    : [{ title: "Commercial Goods & Services", qty: 1, price: amount }];

  let rowY = 590;
  items.slice(0, 5).forEach((item, idx) => {
    const qty = item.qty || 1;
    const price = Number(item.price || amount);
    const lineTotal = qty * price;

    addLine(50, rowY - 6, 545, rowY - 6, 0.94, 0.96, 0.98);
    addText(String(idx + 1), 64, rowY, 8, "/F1");
    addText(String(item.title || "Item").slice(0, 32), 95, rowY, 8, "/F2");
    addText("85183000", 280, rowY, 8, "/F1");
    addText(String(qty), 355, rowY, 8, "/F1");
    addText(`INR ${price.toFixed(2)}`, 395, rowY, 8, "/F1");
    addText(`INR ${lineTotal.toFixed(2)}`, 475, rowY, 8, "/F2");

    rowY -= 22;
  });

  // 4. Totals Block
  const summaryY = Math.min(rowY - 10, 480);
  // Left: Terms
  addText("Terms & Conditions:", 50, summaryY + 45, 8, "/F2");
  addText("• Subject to Bengaluru jurisdiction. E. & O.E.", 50, summaryY + 32, 7.5, "/F1");
  addText("• Certified that particulars given are true and correct.", 50, summaryY + 21, 7.5, "/F1");
  if (invoice.notes) {
    addText(`• Note: ${invoice.notes.slice(0, 45)}`, 50, summaryY + 9, 7.5, "/F1");
  }

  // Right: Calculation Box
  addRect(335, summaryY - 10, 210, 72, 0.97, 0.98, 0.99, 0.88, 0.91, 0.94);
  addText("Taxable Value:", 345, summaryY + 46, 8, "/F1");
  addText(`INR ${subtotal.toFixed(2)}`, 460, summaryY + 46, 8, "/F2");

  addText("CGST (9%):", 345, summaryY + 33, 8, "/F1");
  addText(`INR ${cgst.toFixed(2)}`, 460, summaryY + 33, 8, "/F1");

  addText("SGST (9%):", 345, summaryY + 20, 8, "/F1");
  addText(`INR ${sgst.toFixed(2)}`, 460, summaryY + 20, 8, "/F1");

  addLine(345, summaryY + 12, 535, summaryY + 12);
  addText("Grand Total:", 345, summaryY - 2, 9.5, "/F2");
  addText(`INR ${amount.toFixed(2)}`, 450, summaryY - 2, 10, "/F2");

  // 5. Verification Footer
  addLine(50, 60, 545, 60);
  addText("GSTIN: 29ABCDE1234F1Z5  |  Computer-generated Tax Invoice verified by Metromindz OS", 50, 46, 7.5, "/F1");
  addText("Original for Recipient", 460, 46, 7.5, "/F1");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n ")
    .join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;

  return Buffer.from(pdf);
}

export default generateInvoicePdf;
