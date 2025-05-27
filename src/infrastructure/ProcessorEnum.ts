/**
 * Processors available in Kushki
 */
export enum ProcessorEnum {
  BILLPOCKET = "BillPocket Processor",
  CREDIBANCO = "Credibanco Processor",
  CREDIMATIC = "Credimatic Processor",
  DATAFAST = "Datafast Processor",
  ELAVON = "Elavon Processor",
  MCPROCESSOR = "MC Processor",
  NIUBIZ = "Niubiz Processor",
  PROSA_AGR = "Prosa Agr",
  REDEBAN = "Redeban Processor",
  TRANSBANK = "Transbank Processor",
  VISANET = "VisaNet Processor",
  FIRST_DATA = "First Data Processor",
  PROSA = "Prosa Processor",
  CREDOMATIC = "Credomatic Processor",
  KUSHKI = "Kushki Acquirer Processor",
  FIS = "Fis Processor",
}

export const PROCESSORS: string[] = [
  ProcessorEnum.VISANET,
  ProcessorEnum.NIUBIZ,
  ProcessorEnum.REDEBAN,
  ProcessorEnum.BILLPOCKET,
  ProcessorEnum.CREDIBANCO,
  ProcessorEnum.TRANSBANK,
  ProcessorEnum.KUSHKI,
  ProcessorEnum.CREDIMATIC,
  ProcessorEnum.DATAFAST,
];

export const PARTIAL_VOID_DISABLED_PROCESSOR: string[] = [
  ProcessorEnum.CREDIMATIC,
  ProcessorEnum.DATAFAST,
];

export const PROCESSORS_SANDBOX: string[] = [ProcessorEnum.CREDIBANCO];

export const PARTIAL_VOID_PROCESSORS: ProcessorEnum[] = [
  ProcessorEnum.KUSHKI,
  ProcessorEnum.PROSA,
  ProcessorEnum.CREDIMATIC,
];
