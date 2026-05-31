"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCreate = runCreate;
const fs_1 = require("fs");
const path_1 = require("path");
const TYPE_FOLDERS = {
    note: 'content/10_Dev',
    project: 'content/20_Projects',
    study: 'content/30_Studies',
    idea: 'content/50_Ideas',
};
function toSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}
function today() {
    return new Date().toISOString().split('T')[0];
}
function getTemplatePath(type) {
    return (0, path_1.join)(__dirname, '..', 'templates', `${type}.md`);
}
async function runCreate(options) {
    const root = options.vaultRoot ?? process.cwd();
    const folder = options.dir ?? (0, path_1.join)(root, TYPE_FOLDERS[options.type]);
    const slug = toSlug(options.title);
    const filePath = (0, path_1.join)(folder, `${slug}.md`);
    const templatePath = getTemplatePath(options.type);
    const template = (0, fs_1.readFileSync)(templatePath, 'utf-8');
    const content = template
        .replace('{{title}}', options.title)
        .replace('{{date}}', today());
    (0, fs_1.writeFileSync)(filePath, content, 'utf-8');
    return filePath;
}
