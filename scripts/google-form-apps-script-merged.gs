/**
 * MVP + FilaDock — script unificado (NÃO substitua o MVP!)
 *
 * MVP: Form → "Respostas ao formulário 9" → espelha em "Respostas ao formulário 1" + STATUS
 * FilaDock: lê o espelho (aba do Looker) e avisa o app na hora
 *
 * Configurar em: Projeto → Propriedades do script
 *   FILADOCK_WEBHOOK_URL = https://fila-lsl.vercel.app/api/integrations/google-form
 *   FILADOCK_WEBHOOK_SECRET = (mesmo token da Vercel)
 *
 * Executar uma vez: instalarGatilhosUnificado
 */

/***** CONFIG MVP (mantido) *****/

const ABA_FORM = "Respostas ao formulário 9";
const ABA_ESPELHO = "Respostas ao formulário 1";
const COL_STATUS = 11;
const STATUS_INICIAL = "AGUARDANDO DESCARREGAMENTO";

/***** CONFIG FILADOCK *****/

const FILADOCK_DATA_COLUMNS = 16;

/***** HELPERS MVP *****/

function sh(nome) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!s) {
    throw new Error("Aba não encontrada: " + nome);
  }
  return s;
}

/***** PROCESSA NOVA RESPOSTA (MVP — Looker) *****/

function processarEnvio(e) {
  const origem = sh(ABA_FORM);
  const destino = sh(ABA_ESPELHO);

  let linha;

  if (e && e.range) {
    const sheetEvento = e.range.getSheet();
    if (sheetEvento.getName() !== ABA_FORM) {
      return;
    }
    linha = e.range.getRow();
  } else {
    linha = origem.getLastRow();
  }

  const ultimaColuna = origem.getLastColumn();

  let valores = origem.getRange(linha, 1, 1, ultimaColuna).getValues()[0];

  while (valores.length < COL_STATUS - 1) {
    valores.push("");
  }

  valores.push(STATUS_INICIAL);

  destino.getRange(destino.getLastRow() + 1, 1, 1, valores.length).setValues([valores]);
}

function testeManual() {
  processarEnvio();
}

/***** FILADOCK (sync instantânea — só lê, não altera planilha) *****/

function getWebhookUrl_() {
  return PropertiesService.getScriptProperties().getProperty("FILADOCK_WEBHOOK_URL");
}

function getWebhookSecret_() {
  return PropertiesService.getScriptProperties().getProperty("FILADOCK_WEBHOOK_SECRET");
}

function syncEspelhoRowToFilaDock_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, FILADOCK_DATA_COLUMNS).getValues()[0];
  syncRowToFilaDock_(values, "sheet_sync");
}

function syncRowToFilaDock_(rowValues, eventType) {
  var url = getWebhookUrl_();
  var secret = getWebhookSecret_();

  if (!url || !secret) {
    console.error("Configure FILADOCK_WEBHOOK_URL e FILADOCK_WEBHOOK_SECRET nas propriedades do script.");
    return;
  }

  var payload = {
    event: eventType,
    row: { values: rowValues },
  };

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-Google-Form-Secret": secret,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    console.error("FilaDock webhook falhou:", code, response.getContentText());
  }
}

/** Form enviado: MVP espelha → depois avisa FilaDock */
function onFormSubmitUnificado(e) {
  processarEnvio(e);

  try {
    var destino = sh(ABA_ESPELHO);
    var linha = destino.getLastRow();
    if (linha >= 2) {
      syncEspelhoRowToFilaDock_(destino, linha);
    }
  } catch (err) {
    console.error("FilaDock após processarEnvio:", err);
  }
}

/** STATUS alterado no espelho (coluna K) → FilaDock na hora */
function onEditFilaDock(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getName() !== ABA_ESPELHO) return;

  var row = e.range.getRow();
  if (row < 2) return;
  if (e.range.getColumn() !== COL_STATUS) return;

  syncEspelhoRowToFilaDock_(sheet, row);
}

/**
 * Instala gatilhos unificados.
 * Substitui gatilho antigo de processarEnvio por onFormSubmitUnificado (MVP + FilaDock).
 */
function instalarGatilhosUnificado() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var fn = trigger.getHandlerFunction();
    if (
      fn === "processarEnvio" ||
      fn === "onFormSubmitFilaDock" ||
      fn === "onFormSubmitUnificado" ||
      fn === "onEditFilaDock" ||
      fn === "instalarGatilhosFilaDock"
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("onFormSubmitUnificado").forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger("onEditFilaDock").forSpreadsheet(ss).onEdit().create();

  SpreadsheetApp.getUi().alert(
    "Pronto!\n\n" +
      "MVP (Looker): continua espelhando Form -> aba 1\n" +
      "FilaDock: nova resposta + mudanca de STATUS sincronizam na hora"
  );
}

/** Teste: selecione uma linha na aba espelho e execute */
function testarSyncLinhaAtiva() {
  var sheet = sh(ABA_ESPELHO);
  var row = sheet.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert("Selecione uma linha na aba: " + ABA_ESPELHO);
    return;
  }
  syncEspelhoRowToFilaDock_(sheet, row);
  SpreadsheetApp.getUi().alert("Sync enviada linha " + row + ". Veja Execucoes se falhar.");
}
