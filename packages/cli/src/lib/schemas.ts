import Ajv from 'ajv'
import { readFileSync } from 'fs'
import { join } from 'path'

const ajv = new Ajv({ allErrors: true })

function getSchemaPath(type: string): string {
  return join(__dirname, '..', '..', '..', '..', 'schemas', `${type}.json`)
}

export function validateFrontmatter(data: object, type: string): string[] {
  const schemaPath = getSchemaPath(type)
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'))
  const validate = ajv.compile(schema)
  const valid = validate(data)
  if (valid) return []
  return (validate.errors ?? []).map(e => `${e.instancePath || (e.params as Record<string, unknown>)?.missingProperty || 'field'}: ${e.message}`)
}
