const cardTypes = ["CREDIT", "DEBIT"] as const;
export type CardTypes = (typeof cardTypes)[number];

const currencyTypes = [
  "USD",
  "COP",
  "PEN",
  "CLP",
  "UF",
  "MXN",
  "CRC",
  "GTQ",
  "HNL",
  "NIO",
  "BRL",
] as const;
export type CurrencyTypes = (typeof currencyTypes)[number];
