/**
 * MVP + FilaDock — script unificado
 *
 * Aba do Looker / fila: "Respostas ao formulário 1"
 * Aba do Form (se existir): "Respostas ao formulário 9"
 *
 * Propriedades do script:
 *   FILADOCK_WEBHOOK_URL = https://fila-lsl.vercel.app/api/integrations/google-form
 *   FILADOCK_WEBHOOK_SECRET = (mesmo token da Vercel)
 *
 * Executar uma vez: instalarGatilhosUnificado
 */

/***** CONFIG *****/

const ABA_FORM = "Respostas ao formulário 9";
const ABA_ESPELHO = "Respostas ao formulário 1";
const COL_STATUS = 11;
const STATUS_INICIAL = "AGUARDANDO DESCARREGAMENTO";
const FILADOCK_DATA_COLUMNS = 16;

/***** HELPERS *****/

function listarAbas_() {
  return SpreadsheetApp.getActiveSpreadsheet()
    .getSheets()
    .map(function (s) {
      return s.getName();
    })
    .join(" | ");
}

function sh(nome) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!s) {
    throw new Error(
      'Aba nao encontrada: "' + nome + '". Abas existentes: ' + listarAbas_()
    );
  }
  return s;
}

function shOpcional_(nome) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
}

function listarNomesDasAbas() {
  SpreadsheetApp.getUi().alert("Abas da planilha:\n\n" + listarAbas_());
}

/***** MVP — espelho Form → aba 1 *****/

function processarEnvio(e) {
  var origem = shOpcional_(ABA_FORM);
  var destino = sh(ABA_ESPELHO);

  // Se nao existe aba 9, o Form provavelmente ja grava direto na aba 1
  if (!origem) {
    console.log("Aba Form nao encontrada (" + ABA_FORM + "). Pulando espelho MVP.");
    return;
  }

  var linha;
  if (e && e.range) {
    if (e.range.getSheet().getName() !== ABA_FORM) return;
    linha = e.range.getRow();
  } else {
    linha = origem.getLastRow();
  }

  var ultimaColuna = origem.getLastColumn();
  var valores = origem.getRange(linha, 1, 1, ultimaColuna).getValues()[0];

  while (valores.length < COL_STATUS - 1) {
    valores.push("");
  }
  valores.push(STATUS_INICIAL);

  destino.getRange(destino.getLastRow() + 1, 1, 1, valores.length).setValues([valores]);
}

function testeManual() {
  processarEnvio();
}

/***** FILADOCK *****/

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

  secret = String(secret).trim().replace(/^["']|["']$/g, "");
  url = String(url).trim();

  console.log("Enviando para FilaDock...");

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-Google-Form-Secret": secret,
      Authorization: "Bearer " + secret,
    },
    payload: JSON.stringify({
      event: eventType,
      secret: secret,
      row: { values: rowValues },
    }),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) {
    console.error("FilaDock webhook falhou:", code, text);
  } else {
    console.log("FilaDock OK:", text);
  }
}

/**
 * RODE ESTA FUNCAO PRIMEIRO (corrige o 401).
 * Grava URL + secret iguais aos da Vercel, sem digitar na mao.
 */
function configurarFilaDockAgora() {
  console.log("Gravando URL e secret...");
  PropertiesService.getScriptProperties().setProperties(
    {
      FILADOCK_WEBHOOK_URL: "https://fila-lsl.vercel.app/api/integrations/google-form",
      FILADOCK_WEBHOOK_SECRET: "Fd7kQm2pLx9Rv4nW8sYcH6tB3jA5uE1zG0mK9pN4qR7wX2",
    },
    true
  );
  console.log("OK — configurado. Agora rode testarSyncLinhaAtiva");
}

/** Selecione uma linha na aba "Respostas ao formulário 1" e execute */
function testarSyncLinhaAtiva() {
  console.log("Iniciando teste...");
  var sheet = sh(ABA_ESPELHO);
  var row = sheet.getActiveRange().getRow();
  if (row < 2) {
    console.error("Clique em uma linha de dados na aba: " + ABA_ESPELHO + " (linha 2 ou abaixo)");
    return;
  }
  console.log("Linha selecionada: " + row);
  syncEspelhoRowToFilaDock_(sheet, row);
  console.log("Teste finalizado. Veja as linhas acima (OK ou erro).");
}

/** Nova resposta do Form → espelho MVP + FilaDock */
function onFormSubmitUnificado(e) {
  try {
    processarEnvio(e);
  } catch (err) {
    console.error("MVP processarEnvio:", err);
  }

  try {
    var destino = sh(ABA_ESPELHO);
    var linha = destino.getLastRow();
    if (linha >= 2) {
      syncEspelhoRowToFilaDock_(destino, linha);
    }
  } catch (err) {
    console.error("FilaDock apos form:", err);
  }
}

/** Mudou STATUS na aba 1 → FilaDock na hora */
function onEditFilaDock(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getName() !== ABA_ESPELHO) return;

  var row = e.range.getRow();
  if (row < 2) return;
  if (e.range.getColumn() !== COL_STATUS) return;

  syncEspelhoRowToFilaDock_(sheet, row);
}

function instalarGatilhosUnificado() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Confirma que a aba do Looker existe
  sh(ABA_ESPELHO);

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

  console.log("Gatilhos instalados. Aba: " + ABA_ESPELHO);
}
