export interface NoteFrontmatter {
    title: string;
    type: 'note' | 'project' | 'study' | 'idea';
    tags: string[];
    created: string;
    [key: string]: unknown;
}
export declare function parseFrontmatter(filePath: string): {
    data: NoteFrontmatter;
    content: string;
};
export declare function writeFrontmatter(filePath: string, data: NoteFrontmatter, content: string): void;
