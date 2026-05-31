"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runValidate = runValidate;
const chalk_1 = __importDefault(require("chalk"));
const vault_1 = require("../lib/vault");
const frontmatter_1 = require("../lib/frontmatter");
const schemas_1 = require("../lib/schemas");
async function runValidate(options) {
    const root = options.vaultRoot ?? process.cwd();
    const pattern = options.path ? `${options.path}/**/*.md` : 'content/**/*.md';
    const files = (0, vault_1.walkVault)(root, pattern);
    const errors = [];
    const skipped = [];
    for (const file of files) {
        const { data } = (0, frontmatter_1.parseFrontmatter)(file);
        if (!data.type) {
            skipped.push(file);
            if (!options.silent)
                console.log(chalk_1.default.dim(`  SKIP ${file}`));
            continue;
        }
        const messages = (0, schemas_1.validateFrontmatter)(data, data.type);
        if (messages.length > 0) {
            errors.push({ file, messages });
            if (!options.silent) {
                console.log(chalk_1.default.red(`  FAIL ${file}`));
                messages.forEach(m => console.log(chalk_1.default.red(`       ${m}`)));
            }
        }
        else {
            if (!options.silent)
                console.log(chalk_1.default.green(`  OK   ${file}`));
        }
    }
    return { success: errors.length === 0, errors, skipped };
}
