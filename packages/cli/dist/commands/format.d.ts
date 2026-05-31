export interface FormatResult {
    file: string;
    changed: boolean;
}
export declare function runFormat(options: {
    files: string[];
    write: boolean;
    silent?: boolean;
}): Promise<FormatResult[]>;
