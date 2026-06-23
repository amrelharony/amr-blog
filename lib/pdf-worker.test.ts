import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guard against silent worker/API skew: PdfViewer loads public/pdf.worker.min.mjs,
// a committed copy of pdfjs-dist's build worker. If pdfjs-dist is bumped without
// re-copying the worker, the worker and the library API drift and the viewer breaks
// in subtle ways. This test fails until the worker is re-copied:
//   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
describe("pdf.js worker stays in sync with pdfjs-dist", () => {
  it("committed public/pdf.worker.min.mjs matches the installed build", () => {
    const committed = readFileSync("public/pdf.worker.min.mjs");
    const installed = readFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
    expect(committed.equals(installed)).toBe(true);
  });
});
