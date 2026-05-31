"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFrontmatter = validateFrontmatter;
const ajv_1 = __importDefault(require("ajv"));
const fs_1 = require("fs");
const path_1 = require("path");
const ajv = new ajv_1.default({ allErrors: true });
function getSchemaPath(type) {
    return (0, path_1.join)(__dirname, '..', '..', '..', '..', 'schemas', `${type}.json`);
}
function validateFrontmatter(data, type) {
    const schemaPath = getSchemaPath(type);
    const schema = JSON.parse((0, fs_1.readFileSync)(schemaPath, 'utf-8'));
    const validate = ajv.compile(schema);
    const valid = validate(data);
    if (valid)
        return [];
    return (validate.errors ?? []).map(e => `${e.instancePath || e.params?.missingProperty || 'field'}: ${e.message}`);
}
