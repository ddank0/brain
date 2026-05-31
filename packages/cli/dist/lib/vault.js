"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walkVault = walkVault;
const glob_1 = require("glob");
function walkVault(vaultRoot, pattern = 'content/**/*.md') {
    return (0, glob_1.globSync)(pattern, { cwd: vaultRoot, absolute: true });
}
