import "server-only";

import * as XLSX from "xlsx";

export interface ParsedTrackingRow {
  orderNumber: string;
  trackingNumber: string;
  courierCode: string;
}

export interface ParseTrackingFileResult {
  rows: ParsedTrackingRow[];
  warnings: string[];
}

const MAX_ROWS = 1000;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-]/g, "");
}

function cleanCell(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value).trim();
  }
  return "";
}

function stripFormulaPrefix(value: string) {
  if (!value) {
    return value;
  }

  if (["=", "+", "-", "@"].includes(value[0])) {
    return value.slice(1).trim();
  }

  return value;
}

function detectDelimiter(headerLine: string) {
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;

  if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) {
    return "\t";
  }

  if (semicolonCount > commaCount && semicolonCount > 0) {
    return ";";
  }

  return ",";
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(field);
      const hasNonEmpty = row.some((cell) => cell.trim().length > 0);
      if (hasNonEmpty) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function decodeText(bytes: Uint8Array) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const replacementCount = (utf8.match(/�/g) ?? []).length;

  if (replacementCount === 0) {
    return utf8;
  }

  try {
    const eucKr = new TextDecoder("euc-kr").decode(bytes);
    const eucKrReplacement = (eucKr.match(/�/g) ?? []).length;
    return eucKrReplacement < replacementCount ? eucKr : utf8;
  } catch {
    return utf8;
  }
}

function findColumnIndex(header: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const index = header.indexOf(candidate);
    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function parseRowMatrix(parsed: unknown[][]): ParseTrackingFileResult {
  if (parsed.length < 2) {
    throw new Error("헤더와 데이터 행이 필요합니다");
  }

  const header = parsed[0].map((value) => normalizeHeader(cleanCell(value)));

  const orderNumberIndex = findColumnIndex(
    header,
    ["주문번호", "orderno", "orderid", "ordernumber", "order_number"]
  );
  const trackingIndex = findColumnIndex(
    header,
    ["운송장번호", "trackingno", "trackingnumber", "invoice", "tracking_number"]
  );
  const courierIndex = findColumnIndex(
    header,
    ["택배사", "courier", "couriercode", "deliverycompany", "courier_code"]
  );

  if (orderNumberIndex < 0 || trackingIndex < 0) {
    throw new Error("헤더에 주문번호/운송장번호 컬럼이 필요합니다");
  }

  const warnings: string[] = [];
  const rows: ParsedTrackingRow[] = [];

  for (let rowIndex = 1; rowIndex < parsed.length; rowIndex += 1) {
    const current = parsed[rowIndex] ?? [];

    const orderNumber = stripFormulaPrefix(cleanCell(current[orderNumberIndex]));
    const trackingNumber = stripFormulaPrefix(cleanCell(current[trackingIndex]));
    const courierCode = stripFormulaPrefix(cleanCell(current[courierIndex])) || "CJGLS";

    if (!orderNumber && !trackingNumber) {
      continue;
    }

    if (!orderNumber || !trackingNumber) {
      warnings.push(`${rowIndex + 1}행: 주문번호 또는 운송장번호가 비어 있어 건너뜀`);
      continue;
    }

    rows.push({
      orderNumber: orderNumber.slice(0, 100),
      trackingNumber: trackingNumber.slice(0, 100),
      courierCode: courierCode.slice(0, 50)
    });

    if (rows.length > MAX_ROWS) {
      throw new Error(`한 번에 처리 가능한 최대 행 수(${MAX_ROWS})를 초과했습니다`);
    }
  }

  if (rows.length === 0) {
    throw new Error("처리 가능한 송장 데이터가 없습니다");
  }

  return { rows, warnings };
}

async function parseXlsxTrackingFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(bytes, { type: "array", raw: false });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("엑셀 시트를 찾을 수 없습니다");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const parsed = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: ""
  }) as unknown[][];

  return parseRowMatrix(parsed);
}

async function parseDelimitedTrackingFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = decodeText(bytes);

  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  if (!firstLine) {
    throw new Error("파일에 데이터가 없습니다");
  }

  const delimiter = detectDelimiter(firstLine);
  const parsed = parseDelimited(text, delimiter);

  return parseRowMatrix(parsed);
}

export async function parseTrackingUploadFile(file: File): Promise<ParseTrackingFileResult> {
  const fileName = file.name.toLowerCase();

  if (file.size <= 0) {
    throw new Error("비어 있는 파일입니다");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("파일 용량이 5MB를 초과합니다");
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    return parseXlsxTrackingFile(file);
  }

  return parseDelimitedTrackingFile(file);
}
