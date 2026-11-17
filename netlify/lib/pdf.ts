export interface PdfOptions {
  title: string;
  subtitle?: string;
  discountCode?: string;
  lines: string[];
}

function escapePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(text: string, maxChars = 76): string[] {
  const words = text.trim().split(/\s+/);
  const result: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ` ${w}`;
    } else {
      result.push(current);
      current = w;
    }
  }
  if (current) result.push(current);
  return result.length > 0 ? result : [""];
}

/**
 * Generates a real, spec-compliant PDF 1.4 document with zero native dependencies.
 */
export function generateLeadMagnetPdf(options: PdfOptions): Uint8Array {
  const ops: string[] = [];

  // Dark header bar
  ops.push("0.059 0.090 0.165 rg 48 725 516 54 re f");
  ops.push("BT /F2 18 Tf 1 1 1 rg 64 748 Td (" + escapePdfText(options.title) + ") Tj ET");

  let y = 695;
  if (options.subtitle) {
    ops.push(
      `BT /F1 11 Tf 0.25 0.32 0.42 rg 48 ${y} Td (${escapePdfText(options.subtitle)}) Tj ET`,
    );
    y -= 24;
  }

  if (options.discountCode) {
    ops.push(`0.92 0.99 0.96 rg 48 ${y - 26} 516 38 re f`);
    ops.push(`0.02 0.59 0.41 RG 1 w 48 ${y - 26} 516 38 re S`);
    ops.push(
      `BT /F2 13 Tf 0.02 0.45 0.31 rg 64 ${y - 12} Td (Discount Code: ${escapePdfText(options.discountCode)}) Tj ET`,
    );
    y -= 52;
  }

  for (const raw of options.lines) {
    for (const line of wrapLine(raw)) {
      if (y < 64) break;
      ops.push(
        `BT /F1 11 Tf 0.09 0.12 0.18 rg 48 ${y} Td (${escapePdfText(line)}) Tj ET`,
      );
      y -= 17;
    }
    y -= 6;
  }

  ops.push(
    "BT /F1 9 Tf 0.45 0.50 0.58 rg 48 40 Td (Delivered natively by FormBeam Serverless Static Forms) Tj ET",
  );

  const streamContent = ops.join("\n") + "\n";

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
    `6 0 obj\n<< /Length ${Buffer.byteLength(streamContent, "utf8")} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}
