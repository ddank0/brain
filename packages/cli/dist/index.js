#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const vault_1 = require("./lib/vault");
const validate_1 = require("./commands/validate");
const create_1 = require("./commands/create");
const format_1 = require("./commands/format");
const stats_1 = require("./commands/stats");
const program = new commander_1.Command();
program
    .name('vault')
    .description('CLI para gerenciar o Second Brain Vault')
    .version('0.1.0');
// ── validate ──────────────────────────────────────────────
program
    .command('validate')
    .description('Valida frontmatter de todas as notas contra os schemas')
    .option('--path <path>', 'Limita validação a uma subpasta')
    .option('--strict', 'Falha com exit code 1 se houver erros')
    .action(async (opts) => {
    console.log(chalk_1.default.bold('\nvault validate\n'));
    const result = await (0, validate_1.runValidate)({ path: opts.path, strict: opts.strict });
    const status = result.success ? chalk_1.default.green('✓ OK') : chalk_1.default.red('✗ FAILED');
    console.log(`\n${status} — ${result.errors.length} erro(s), ${result.skipped.length} pulado(s)`);
    if (!result.success && opts.strict)
        process.exit(1);
});
// ── create ────────────────────────────────────────────────
program
    .command('create <title>')
    .description('Cria uma nova nota com template e frontmatter preenchido')
    .option('--type <type>', 'Tipo: note | project | study | idea', 'note')
    .option('--dir <dir>', 'Pasta destino (sobrescreve o padrão do tipo)')
    .action(async (title, opts) => {
    const filePath = await (0, create_1.runCreate)({ title, type: opts.type, dir: opts.dir });
    console.log(chalk_1.default.green(`✓ Criado: ${filePath}`));
});
// ── format ────────────────────────────────────────────────
program
    .command('format')
    .description('Normaliza frontmatter (tags lowercase, datas YYYY-MM-DD)')
    .option('--write', 'Aplica as mudanças (sem essa flag é dry run)')
    .option('--path <path>', 'Arquivo ou pasta a formatar')
    .action(async (opts) => {
    const files = opts.path
        ? (0, vault_1.walkVault)(process.cwd(), `${opts.path}/**/*.md`)
        : (0, vault_1.walkVault)(process.cwd());
    const results = await (0, format_1.runFormat)({ files, write: !!opts.write });
    const changed = results.filter(r => r.changed).length;
    const mode = opts.write ? 'escrito' : 'dry run';
    console.log(chalk_1.default.bold(`\nvault format (${mode})`));
    console.log(`${changed} arquivo(s) ${opts.write ? 'atualizados' : 'com diferenças'} de ${files.length} total`);
});
// ── stats ─────────────────────────────────────────────────
program
    .command('stats')
    .description('Exibe métricas do vault')
    .option('--orphans', 'Lista somente notas sem links')
    .option('--json', 'Output em JSON')
    .option('--top <n>', 'Top N tags', '10')
    .action(async (opts) => {
    const stats = await (0, stats_1.runStats)({ topN: parseInt(opts.top) });
    if (opts.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
    }
    console.log(chalk_1.default.bold('\nvault stats\n'));
    console.log(`Total de notas: ${chalk_1.default.cyan(stats.total)}`);
    console.log('\nPor tipo:');
    Object.entries(stats.totals).forEach(([type, count]) => console.log(`  ${type.padEnd(10)} ${chalk_1.default.cyan(count)}`));
    console.log(`\nÓrfãs (sem links): ${chalk_1.default.yellow(stats.orphans.length)}`);
    if (opts.orphans)
        stats.orphans.forEach(f => console.log(`  ${f}`));
    console.log('\nTop tags:');
    stats.topTags.forEach(({ tag, count }) => console.log(`  #${tag.padEnd(20)} ${chalk_1.default.cyan(count)}`));
});
program.parse();
