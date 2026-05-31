type NoteType = 'note' | 'project' | 'study' | 'idea';
export declare function runCreate(options: {
    title: string;
    type: NoteType;
    vaultRoot?: string;
    dir?: string;
}): Promise<string>;
export {};
