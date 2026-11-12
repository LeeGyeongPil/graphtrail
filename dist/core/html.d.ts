import type { RenderOptions } from "./report.ts";
import type { Report } from "./model.ts";
export declare function esc(text: string): string;
export declare function renderHtml(report: Report, options?: RenderOptions): string;
