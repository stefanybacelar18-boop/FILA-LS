/**
 * FilaDock — sync instantânea com a planilha "Respostas FORM VIG"
 *
 * 1. Abra a planilha → Extensões → Apps Script
 * 2. Cole este arquivo (substitua o conteúdo padrão)
 * 3. Projeto → Configurações do projeto → Propriedades do script:
 *    - FILADOCK_WEBHOOK_URL = https://fila-lsl.vercel.app/api/integrations/google-form
 *    - FILADOCK_WEBHOOK_SECRET = (mesmo valor de GOOGLE_FORM_WEBHOOK_SECRET na Vercel)
 * 4. Executar uma vez: instalarGatilhosFilaDock (autorize permissões)
 *
 * Gatilhos:
 * - onFormSubmit: nova resposta do Form → aguardando_descarregamento
 * - onEdit (coluna STATUS): Finalizado/Descarregado → finalizado no app
 */

var FORM_RESPONSES_SHEET_ID = 801601968;
var DATA_COLUMNS = 16; // A..P (inclui VENCIMENTO NF)

function getWebhookUrl_() {
  return PropertiesService.getScriptProperties().getProperty("FILADOCK_WEBHOOK_URL");
}

function getWebhookSecret_() {
  return PropertiesService.getScriptProperties().getProperty("FILADOCK_WEBHOOK_SECRET");
}

function instalarGatilhosFilaDock() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger("onFormSubmitFilaDock")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  ScriptApp.newTrigger("onEditFilaDock")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert(
    "Gatilhos FilaDock instalados!\n\n" +
    "- Nova resposta do Form -> fila em segundos\n" +
    "- Mudar STATUS para FINALIZADO ou DESCARREGADO -> finaliza no app na hora"
  );
}

/** Importa todas as linhas existentes na aba Form_Responses (1a configuracao). */
function importarHistoricoFilaDock() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetById(FORM_RESPONSES_SHEET_ID);
  if (!sheet) {
    console.error("Aba Form_Responses nao encontrada.");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var values = sheet.getRange(2, 1, lastRow, DATA_COLUMNS).getValues();
  for (var i = 0; i < values.length; i++) {
    syncRowToFilaDock_(values[i], "backfill");
  }
}

function onFormSubmitFilaDock(e) {
  if (!e || !e.values) return;
  syncRowToFilaDock_(e.values, "form_submit");
}

function onEditFilaDock(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getSheetId() !== FORM_RESPONSES_SHEET_ID) return;

  var row = e.range.getRow();
  if (row < 2) return;

  var col = e.range.getColumn();
  // Sync instantanea ao mudar STATUS (coluna K = 11)
  if (col !== 11) return;

  var values = sheet.getRange(row, 1, 1, DATA_COLUMNS).getValues()[0];
  syncRowToFilaDock_(values, "sheet_edit");
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

/** Teste manual: selecione uma linha de dados e execute esta função. */
function testarSyncLinhaAtiva() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetById(FORM_RESPONSES_SHEET_ID);
  var row = sheet.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert("Selecione uma linha de dados (linha 2 ou abaixo).");
    return;
  }
  var values = sheet.getRange(row, 1, 1, DATA_COLUMNS).getValues()[0];
  syncRowToFilaDock_(values, "sheet_edit");
  SpreadsheetApp.getUi().alert("Sync enviada para linha " + row + ". Veja Executions no Apps Script se falhar.");
}
