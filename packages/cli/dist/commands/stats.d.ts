type NoteType = 'note' | 'project' | 'study' | 'idea';
export interface VaultStats {
    total: number;
    totals: Partial<Record<NoteType, number>>;
    orphans: string[];
    topTags: Array<{
        tag: string;
        count: number;
    }>;
}
export declare function runStats(options: {
    vaultRoot?: string;
    topN?: number;
}): Promise<VaultStats>;
export {};
