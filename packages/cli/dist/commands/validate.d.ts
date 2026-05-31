export interface ValidationError {
    file: string;
    messages: string[];
}
export interface ValidationResult {
    success: boolean;
    errors: ValidationError[];
    skipped: string[];
}
export declare function runValidate(options: {
    vaultRoot?: string;
    path?: string;
    strict?: boolean;
    silent?: boolean;
}): Promise<ValidationResult>;
