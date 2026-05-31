"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStats = runStats;
const vault_1 = require("../lib/vault");
const frontmatter_1 = require("../lib/frontmatter");
async function runStats(options) {
    const root = options.vaultRoot ?? process.cwd();
    const topN = options.topN ?? 10;
    const files = (0, vault_1.walkVault)(root);
    const totals = {};
    const orphans = [];
    const tagCounts = {};
    for (const file of files) {
        const { data, content } = (0, frontmatter_1.parseFrontmatter)(file);
        const type = data.type;
        if (type)
            totals[type] = (totals[type] ?? 0) + 1;
        const hasLinks = /\[\[.+?\]\]/.test(content);
        if (!hasLinks)
            orphans.push(file);
        if (Array.isArray(data.tags)) {
            for (const tag of data.tags) {
                tagCounts[String(tag)] = (tagCounts[String(tag)] ?? 0) + 1;
            }
        }
    }
    const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([tag, count]) => ({ tag, count }));
    return { total: files.length, totals, orphans, topTags };
}
