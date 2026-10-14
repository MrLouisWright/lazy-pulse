import type { Report, Rule } from './core.js';
export * from './core.js';
export interface LazyOptions { baseUrl?: string; include?: string[]; exclude?: string[]; cleanUrls?: boolean; foldImages?: number; toolVersion?: string; now?: Date }
export interface Media { el: { tag: string; attrs: Record<string, string>; line: number }; kind: 'img' | 'iframe'; icon: boolean; chrome: boolean }
export declare const RULES: Record<string, Rule>;
export declare const DEFAULTS: { foldImages: number; iconSize: number };
export declare function parseHtml(html: string): unknown;
export declare function mediaOf(doc: unknown, opts?: { iconSize?: number }): Media[];
export declare function lcpCandidate(doc: unknown, media: Media[]): Media | null;
export declare function check(dir: string, opts?: LazyOptions, config?: Record<string, unknown>, configFile?: string): Report;
