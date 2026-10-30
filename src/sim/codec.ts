/** Effect schemas as Ritmo codecs, the one way the game gives Ritmo a schema. */
import { Schema } from "effect"

/** An Effect schema as a Ritmo codec: decodes saved JSON, and encodes values back to it. */
export const codec = <S extends Schema.Top & { readonly DecodingServices: never; readonly EncodingServices: never }>(schema: S) => {
  const json = Schema.toCodecJson(schema)
  return {
    "~standard": Schema.toStandardSchemaV1(json)["~standard"],
    "~encode": Schema.toStandardSchemaV1(Schema.flip(json))
  }
}
