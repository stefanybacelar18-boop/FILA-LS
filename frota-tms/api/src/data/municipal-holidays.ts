/**
 * Feriados municipais fixos das cidades com loja.
 * A data entra quando o mesmo dia/mês aparece em 2024 e em 2026 no
 * levantamento público joaopbini/feriados-brasil (MIT). Paixão, Corpus
 * Christi e Carnaval ficam de fora: já existem como feriado nacional ou
 * ponto facultativo federal. Nada aqui consulta serviço pago.
 * Cabaceiras do Paraguaçu não vinha nesse levantamento. 14/03 e 13/06
 * saem do Decreto municipal 035/2025, que trata essas duas datas como
 * feriado. São João, nesse decreto, é ponto facultativo da prefeitura.
 */
export type MunicipalHoliday = { month: number; day: number; name: string };

export const MUNICIPAL_HOLIDAYS: Record<string, MunicipalHoliday[]> = {
  "BA|ALAGOINHAS": [{ month: 6, day: 13, name: "Santo Antônio" }, { month: 6, day: 24, name: "São João" }],
  "BA|BELMONTE": [{ month: 1, day: 20, name: "São Sebastião" }, { month: 5, day: 23, name: "Feriado da cidade" }, { month: 7, day: 16, name: "Nossa Senhora do Carmo" }, { month: 7, day: 19, name: "Feriado da cidade" }],
  "BA|BOM JESUS DA LAPA": [{ month: 8, day: 6, name: "Bom Jesus" }, { month: 9, day: 15, name: "Feriado da cidade" }],
  "BA|BRUMADO": [{ month: 1, day: 20, name: "São Sebastião" }, { month: 6, day: 11, name: "Aniversário de Brumado" }, { month: 6, day: 24, name: "São João" }, { month: 8, day: 6, name: "Louvor ao Bom Jesus" }],
  "BA|CABACEIRAS DO PARAGUACU": [{ month: 3, day: 14, name: "Dia do Poeta Castro Alves" }, { month: 6, day: 13, name: "Emancipação Política" }],
  "BA|CAMACARI": [{ month: 1, day: 7, name: "São Tomás de Cantuária" }, { month: 6, day: 24, name: "São João" }, { month: 9, day: 28, name: "Aniversário de Camaçari" }],
  "BA|CAMPO FORMOSO": [{ month: 6, day: 13, name: "Santo Antônio" }, { month: 6, day: 24, name: "São João" }, { month: 7, day: 28, name: "Feriado da cidade" }],
  "BA|CANAVIEIRAS": [{ month: 1, day: 20, name: "São Sebastião" }, { month: 5, day: 25, name: "Feriado da cidade" }, { month: 7, day: 14, name: "Feriado da cidade" }],
  "BA|CANDEIAS": [{ month: 2, day: 2, name: "Nossa Senhora das Candeias" }, { month: 6, day: 24, name: "São João" }, { month: 8, day: 14, name: "Feriado da cidade" }],
  "BA|CRUZ DAS ALMAS": [{ month: 6, day: 24, name: "São João" }, { month: 7, day: 29, name: "Feriado da cidade" }, { month: 9, day: 15, name: "Feriado da cidade" }],
  "BA|ENTRE RIOS": [{ month: 6, day: 24, name: "São João" }, { month: 8, day: 15, name: "Assunção de Nossa Senhora" }],
  "BA|EUCLIDES DA CUNHA": [{ month: 6, day: 24, name: "São João" }, { month: 9, day: 19, name: "Feriado da cidade" }, { month: 12, day: 8, name: "Nossa Senhora da Conceição" }],
  "BA|EUNAPOLIS": [{ month: 5, day: 12, name: "Feriado da cidade" }, { month: 5, day: 24, name: "Feriado da cidade" }],
  "BA|FEIRA DE SANTANA": [{ month: 6, day: 24, name: "São João" }, { month: 7, day: 26, name: "Senhora Santana" }, { month: 9, day: 18, name: "Aniversário de Feira de Santana" }],
  "BA|GUANAMBI": [{ month: 6, day: 13, name: "Santo Antônio" }, { month: 8, day: 14, name: "Feriado da cidade" }],
  "BA|ILHEUS": [{ month: 4, day: 23, name: "São Jorge" }, { month: 6, day: 28, name: "Feriado da cidade" }, { month: 8, day: 15, name: "Assunção de Nossa Senhora" }],
  "BA|IPIAU": [{ month: 6, day: 24, name: "São João" }, { month: 8, day: 16, name: "Feriado da cidade" }, { month: 12, day: 2, name: "Feriado da cidade" }],
  "BA|IPIRA": [{ month: 6, day: 24, name: "São João" }, { month: 7, day: 26, name: "Santana" }],
  "BA|IRECE": [{ month: 5, day: 31, name: "Feriado da cidade" }, { month: 8, day: 4, name: "Feriado da cidade" }],
  "BA|ITABERABA": [{ month: 3, day: 26, name: "Feriado da cidade" }, { month: 5, day: 18, name: "Feriado da cidade" }, { month: 6, day: 24, name: "São João" }],
  "BA|ITABUNA": [{ month: 3, day: 19, name: "São José" }, { month: 6, day: 24, name: "São João" }, { month: 7, day: 28, name: "Aniversário de Itabuna" }],
  "BA|ITAMARAJU": [{ month: 6, day: 24, name: "São João" }, { month: 9, day: 27, name: "Cosme e Damião" }],
  "BA|ITAPETINGA": [{ month: 3, day: 19, name: "São José" }, { month: 6, day: 24, name: "São João" }, { month: 12, day: 12, name: "Nossa Senhora de Guadalupe" }],
  "BA|JACOBINA": [{ month: 6, day: 13, name: "Santo Antônio" }, { month: 12, day: 8, name: "Nossa Senhora da Conceição" }],
  "BA|JEQUIE": [{ month: 6, day: 13, name: "Santo Antônio" }, { month: 6, day: 24, name: "São João Batista" }, { month: 8, day: 20, name: "Dia do Evangélico" }, { month: 10, day: 25, name: "Aniversário de Jequié" }],
  "BA|LAURO DE FREITAS": [{ month: 1, day: 15, name: "Santo Amaro de Ipitanga" }, { month: 6, day: 24, name: "São João" }],
  "BA|MACAUBAS": [{ month: 6, day: 24, name: "São João" }, { month: 7, day: 6, name: "Feriado da cidade" }, { month: 12, day: 8, name: "Nossa Senhora da Conceição" }],
  "BA|PORTO SEGURO": [{ month: 4, day: 22, name: "Feriado da cidade" }, { month: 6, day: 30, name: "Feriado da cidade" }, { month: 8, day: 15, name: "Assunção de Nossa Senhora" }, { month: 9, day: 8, name: "Natividade de Nossa Senhora" }],
  "BA|RIBEIRA DO POMBAL": [{ month: 9, day: 19, name: "Feriado da cidade" }],
  "BA|SALVADOR": [{ month: 6, day: 24, name: "São João" }, { month: 12, day: 8, name: "Nossa Senhora da Conceição" }],
  "BA|SANTA MARIA DA VITORIA": [{ month: 6, day: 26, name: "Feriado da cidade" }, { month: 9, day: 8, name: "Natividade de Nossa Senhora" }],
  "BA|SANTO AMARO": [{ month: 1, day: 15, name: "Feriado da cidade" }, { month: 2, day: 2, name: "Nossa Senhora das Candeias" }],
  "BA|SANTO ANTONIO DE JESUS": [{ month: 5, day: 29, name: "Feriado da cidade" }, { month: 6, day: 13, name: "Santo Antônio" }, { month: 6, day: 24, name: "São João" }],
  "BA|SANTO ESTEVAO": [{ month: 6, day: 24, name: "São João" }, { month: 9, day: 21, name: "Feriado da cidade" }, { month: 12, day: 26, name: "Feriado da cidade" }],
  "BA|SEABRA": [{ month: 1, day: 20, name: "São Sebastião" }, { month: 5, day: 14, name: "Feriado da cidade" }, { month: 6, day: 24, name: "São João" }, { month: 12, day: 8, name: "Nossa Senhora da Conceição" }],
  "BA|SENHOR DO BONFIM": [{ month: 1, day: 17, name: "Feriado da cidade" }, { month: 5, day: 28, name: "Feriado da cidade" }, { month: 6, day: 24, name: "São João" }],
  "BA|SERRINHA": [{ month: 6, day: 13, name: "Santo Antônio" }, { month: 7, day: 26, name: "Santana" }, { month: 9, day: 23, name: "Feriado da cidade" }],
  "BA|TEIXEIRA DE FREITAS": [{ month: 5, day: 9, name: "Aniversário de Teixeira de Freitas" }, { month: 6, day: 29, name: "São Pedro" }],
  "BA|UNA": [{ month: 1, day: 20, name: "São Sebastião" }, { month: 3, day: 19, name: "São José" }, { month: 6, day: 13, name: "Santo Antônio" }, { month: 8, day: 2, name: "Feriado da cidade" }],
  "BA|VALENCA": [{ month: 6, day: 24, name: "São João" }, { month: 11, day: 8, name: "Feriado da cidade" }, { month: 11, day: 10, name: "Feriado da cidade" }],
  "BA|VITORIA DA CONQUISTA": [{ month: 6, day: 24, name: "São João" }, { month: 8, day: 15, name: "Nossa Senhora das Vitórias" }, { month: 11, day: 9, name: "Aniversário de Vitória da Conquista" }],
  "SE|ARACAJU": [{ month: 3, day: 17, name: "Aniversário de Aracaju" }, { month: 6, day: 24, name: "São João" }, { month: 12, day: 8, name: "Nossa Senhora da Conceição" }],
  "SE|ESTANCIA": [{ month: 5, day: 4, name: "Feriado da cidade" }, { month: 6, day: 24, name: "São João" }, { month: 12, day: 12, name: "Nossa Senhora de Guadalupe" }],
  "SE|ITABAIANA": [{ month: 6, day: 13, name: "Santo Antônio" }, { month: 8, day: 28, name: "Santo Agostinho" }],
  "SE|LAGARTO": [{ month: 4, day: 20, name: "Feriado da cidade" }, { month: 6, day: 24, name: "São João" }, { month: 9, day: 8, name: "Natividade de Nossa Senhora" }],
  "SE|NOSSA SENHORA DA GLORIA": [{ month: 1, day: 6, name: "Santos Reis" }, { month: 8, day: 15, name: "Assunção de Nossa Senhora" }, { month: 9, day: 26, name: "Feriado da cidade" }, { month: 11, day: 26, name: "Feriado da cidade" }],
  "SE|NOSSA SENHORA DO SOCORRO": [{ month: 2, day: 2, name: "Nossa Senhora das Candeias" }, { month: 7, day: 7, name: "Feriado da cidade" }, { month: 8, day: 15, name: "Assunção de Nossa Senhora" }],
  "SE|PORTO DA FOLHA": [{ month: 8, day: 20, name: "Feriado da cidade" }, { month: 12, day: 8, name: "Nossa Senhora da Conceição" }],
  "SE|TOBIAS BARRETO": [{ month: 6, day: 7, name: "Feriado da cidade" }, { month: 8, day: 15, name: "Assunção de Nossa Senhora" }],
};

