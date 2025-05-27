export interface IEventBusDetail<T = object> {
  originUsrv: string;
  payload: T;
  action: string;
  mappingType: string;
}
