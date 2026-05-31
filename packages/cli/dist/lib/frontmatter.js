"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFrontmatter = parseFrontmatter;
exports.writeFrontmatter = writeFrontmatter;
const gray_matter_1 = __importDefault(require("gray-matter"));
const fs_1 = require("fs");
function parseFrontmatter(filePath) {
    const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
    const { data, content } = (0, gray_matter_1.default)(raw);
    return { data: data, content };
}
function writeFrontmatter(filePath, data, content) {
    const output = gray_matter_1.default.stringify(content, data);
    (0, fs_1.writeFileSync)(filePath, output, 'utf-8');
}
