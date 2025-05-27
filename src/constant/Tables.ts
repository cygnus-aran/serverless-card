/**
 * Tables identifiers
 */

export type TableList = {
  atomic_counter: string;
  bins: string;
  charges: string;
  credomatic_timed_out_trx: string;
  kushki_acq_timed_out_trx: string;
  merchants: string;
  processor_metadata: string;
  processors: string;
  prosa_timed_out_trx: string;
  redeban_timed_out_trx: string;
  subs_subscription: string;
  subs_transaction: string;
  timeoutTransaction: string;
  tokens: string;
  transaction: string;
  transaction_custom_ops: string;
  hierarchy_core: string;
};

const TABLES: TableList = {
  atomic_counter: `${process.env.DYNAMO_ATOMIC_COUNTER}`,
  bins: `${process.env.DYNAMO_BIN}`,
  charges: `${process.env.DYNAMO_CHARGES}`,
  credomatic_timed_out_trx: `${process.env.CREDOMATIC_TIMED_OUT_TRX}`,
  hierarchy_core: `${process.env.USRV_STAGE}-usrv-hierarchy-core`,
  kushki_acq_timed_out_trx: `${process.env.KUSHKI_ACQ_TIMED_OUT_TRX}`,
  merchants: `${process.env.DYNAMO_MERCHANT}`,
  processor_metadata: `${process.env.DYNAMO_PROCESSOR_METADATA}`,
  processors: `${process.env.DYNAMO_PROCESSOR}`,
  prosa_timed_out_trx: `${process.env.PROSA_TIMED_OUT_TRX}`,
  redeban_timed_out_trx: `${process.env.REDEBAN_TIMED_OUT_TRX}`,
  subs_subscription: `${process.env.DYNAMO_SUBSCRIPTION_SUBSCRIPTIONS}`,
  subs_transaction: `${process.env.DYNAMO_SUBSCRIPTION_TRANSACTION}`,
  timeoutTransaction: `${process.env.DYNAMO_TIMED_OUT_TRANSACTION}`,
  tokens: `${process.env.DYNAMO_TOKEN}`,
  transaction: `${process.env.DYNAMO_TRANSACTION}`,
  transaction_custom_ops: `${process.env.DYNAMO_TRANSACTION_CUSTOM_OPS}`,
};

export { TABLES };
