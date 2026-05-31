import { globSync } from 'glob'

export function walkVault(vaultRoot: string, pattern = 'content/**/*.md'): string[] {
  return globSync(pattern, { cwd: vaultRoot, absolute: true })
}
