"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFormat = runFormat;
const frontmatter_1 = require("../lib/frontmatter");
function normalizeDate(raw) {
    if (typeof raw !== 'string')
        return String(raw);
    const parts = raw.split('-');
    if (parts.length !== 3)
        return raw;
    const [y, m, d] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function normalizeFrontmatter(data) {
    return {
        ...data,
        tags: Array.isArray(data.tags) ? data.tags.map(t => String(t).toLowerCase()) : data.tags,
        created: data.created ? normalizeDate(data.created) : data.created,
        ...(data.updated ? { updated: normalizeDate(data.updated) } : {}),
    };
}
async function runFormat(options) {
    const results = [];
    for (const file of options.files) {
        const { data, content } = (0, frontmatter_1.parseFrontmatter)(file);
        const normalized = normalizeFrontmatter(data);
        const changed = JSON.stringify(data) !== JSON.stringify(normalized);
        if (changed && options.write) {
            (0, frontmatter_1.writeFrontmatter)(file, normalized, content);
        }
        results.push({ file, changed });
    }
    return results;
}
