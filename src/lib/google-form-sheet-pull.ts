import { parseCsvRows } from "./parse-csv";
import type { GoogleFormRowPayload } from "./google-form-sync";

export const GOOGLE_FORM_SPREADSHEET_ID =
  process.env.GOOGLE_FORM_SPREADSHEET_ID?.trim() ||
  "15hWsQM_0ht0XSEGn9LZsZhrswCEUxGiQxhem08VxVOo";

export const GOOGLE_FORM_SHEET_GID =
  process.env.GOOGLE_FORM_SHEET_GID?.trim() || "801601968";

export function buildGoogleFormCsvExportUrl(
  spreadsheetId = GOOGLE_FORM_SPREADSHEET_ID,
  gid = GOOGLE_FORM_SHEET_GID
): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

export async function fetchGoogleFormSheetRows(): Promise<{
  ok: true;
  rows: GoogleFormRowPayload[];
  totalInSheet: number;
} | { ok: false; error: string }> {
  const url = buildGoogleFormCsvExportUrl();

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "text/csv" },
    });
  } catch {
    return { ok: false, error: "Não foi possível acessar a planilha do Google Form." };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Planilha retornou HTTP ${response.status}. Verifique se o link está público (qualquer pessoa com o link).`,
    };
  }

  const csv = await response.text();
  const matrix = parseCsvRows(csv);

  if (matrix.length < 2) {
    return { ok: false, error: "Planilha vazia ou sem linhas de resposta." };
  }

  const dataRows = matrix.slice(1).map((values) => ({ values }));
  return { ok: true, rows: dataRows, totalInSheet: dataRows.length };
}
