import { Context } from "aws-lambda";

export interface IContext extends Context {
  credentialValidationBlock: string;
}
