import {
  defaultTypeHandlers,
  serializeSingleValue as serializeSingleValueOrigin,
  serializeLogContent as serializeLogContentOrigin,
} from '@logbeacon/core/serializeLogContent';

export const serializeSingleValue = serializeSingleValueOrigin.bind(defaultTypeHandlers);
export const serializeLogContent = serializeLogContentOrigin.bind(defaultTypeHandlers);
