import chalk from 'chalk'
import { walkVault } from '../lib/vault'
import { parseFrontmatter } from '../lib/frontmatter'
import { validateFrontmatter } from '../lib/schemas'

export interface ValidationError {
  file: string
  messages: string[]
}

export interface ValidationResult {
  success: boolean
  errors: ValidationError[]
  skipped: string[]
}

export async function runValidate(options: {
  vaultRoot?: string
  path?: string
  strict?: boolean
  silent?: boolean
}): Promise<ValidationResult> {
  const root = options.vaultRoot ?? process.cwd()
  const pattern = options.path ? `${options.path}/**/*.md` : 'content/**/*.md'
  const files = walkVault(root, pattern)

  const errors: ValidationError[] = []
  const skipped: string[] = []

  for (const file of files) {
    const { data } = parseFrontmatter(file)

    if (!data.type) {
      skipped.push(file)
      if (!options.silent) console.log(chalk.dim(`  SKIP ${file}`))
      continue
    }

    const messages = validateFrontmatter(data, data.type as string)

    if (messages.length > 0) {
      errors.push({ file, messages })
      if (!options.silent) {
        console.log(chalk.red(`  FAIL ${file}`))
        messages.forEach(m => console.log(chalk.red(`       ${m}`)))
      }
    } else {
      if (!options.silent) console.log(chalk.green(`  OK   ${file}`))
    }
  }

  return { success: errors.length === 0, errors, skipped }
}
