import fs from "fs";
import path from "path";

import { handlePatchRequest } from "../patchHandler";
import { CachedMetadata } from "obsidian";

describe("patchHandler", () => {
  const getSampleDocument = (): { doc: string; meta: CachedMetadata } => {
    return {
      doc: fs
        .readFileSync(path.resolve(__dirname, "./docs/sample_document.md"))
        .toString(),
      meta: {
        links: [
          {
            position: {
              start: { line: 15, col: 21, offset: 145 },
              end: { line: 15, col: 33, offset: 157 },
            },
            link: "#^484ef2",
            original: "[[#^484ef2]]",
            displayText: "^484ef2",
          },
          {
            position: {
              start: { line: 24, col: 46, offset: 301 },
              end: { line: 24, col: 58, offset: 313 },
            },
            link: "#^2c7cfa",
            original: "[[#^2c7cfa]]",
            displayText: "^2c7cfa",
          },
        ],
        headings: [
          {
            position: {
              start: { line: 11, col: 0, offset: 74 },
              end: { line: 11, col: 11, offset: 85 },
            },
            heading: "Heading 1",
            level: 1,
          },
          {
            position: {
              start: { line: 17, col: 0, offset: 159 },
              end: { line: 17, col: 17, offset: 176 },
            },
            heading: "Subheading 1:1",
            level: 2,
          },
          {
            position: {
              start: { line: 20, col: 0, offset: 205 },
              end: { line: 20, col: 23, offset: 228 },
            },
            heading: "Subsubheading 1:1:1",
            level: 3,
          },
          {
            position: {
              start: { line: 22, col: 0, offset: 230 },
              end: { line: 22, col: 23, offset: 253 },
            },
            heading: "Subsubheading 1:1:2",
            level: 3,
          },
          {
            position: {
              start: { line: 28, col: 0, offset: 370 },
              end: { line: 28, col: 17, offset: 387 },
            },
            heading: "Subheading 1:2",
            level: 2,
          },
          {
            position: {
              start: { line: 34, col: 0, offset: 463 },
              end: { line: 34, col: 17, offset: 480 },
            },
            heading: "Subheading 1:3",
            level: 2,
          },
        ],
        sections: [
          {
            type: "yaml",
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 9, col: 3, offset: 72 },
            },
          },
          {
            type: "heading",
            position: {
              start: { line: 11, col: 0, offset: 74 },
              end: { line: 11, col: 11, offset: 85 },
            },
          },
          {
            type: "paragraph",
            position: {
              start: { line: 13, col: 0, offset: 87 },
              end: { line: 13, col: 35, offset: 122 },
            },
          },
          {
            type: "paragraph",
            position: {
              start: { line: 15, col: 0, offset: 124 },
              end: { line: 15, col: 33, offset: 157 },
            },
          },
          {
            type: "heading",
            position: {
              start: { line: 17, col: 0, offset: 159 },
              end: { line: 17, col: 17, offset: 176 },
            },
          },
          {
            type: "paragraph",
            position: {
              start: { line: 18, col: 0, offset: 177 },
              end: { line: 18, col: 26, offset: 203 },
            },
          },
          {
            type: "heading",
            position: {
              start: { line: 20, col: 0, offset: 205 },
              end: { line: 20, col: 23, offset: 228 },
            },
          },
          {
            type: "heading",
            position: {
              start: { line: 22, col: 0, offset: 230 },
              end: { line: 22, col: 23, offset: 253 },
            },
          },
          {
            type: "paragraph",
            position: {
              start: { line: 24, col: 0, offset: 255 },
              end: { line: 25, col: 36, offset: 350 },
            },
          },
          {
            type: "paragraph",
            position: {
              start: { line: 27, col: 0, offset: 352 },
              end: { line: 27, col: 17, offset: 369 },
            },
          },
          {
            type: "heading",
            position: {
              start: { line: 28, col: 0, offset: 370 },
              end: { line: 28, col: 17, offset: 387 },
            },
          },
          {
            type: "paragraph",
            position: {
              start: { line: 30, col: 0, offset: 389 },
              end: { line: 30, col: 27, offset: 416 },
            },
          },
          {
            type: "paragraph",
            position: {
              start: { line: 32, col: 0, offset: 418 },
              end: { line: 32, col: 43, offset: 461 },
            },
            id: "484ef2",
          },
          {
            type: "heading",
            position: {
              start: { line: 34, col: 0, offset: 463 },
              end: { line: 34, col: 17, offset: 480 },
            },
          },
          {
            type: "table",
            position: {
              start: { line: 35, col: 0, offset: 481 },
              end: { line: 38, col: 29, offset: 600 },
            },
            id: "2c7cfa",
          },
        ],
        blocks: {
          "484ef2": {
            position: {
              start: { line: 32, col: 0, offset: 418 },
              end: { line: 32, col: 43, offset: 461 },
            },
            id: "484ef2",
          },
          "2c7cfa": {
            position: {
              start: { line: 35, col: 0, offset: 481 },
              end: { line: 38, col: 29, offset: 600 },
            },
            id: "2c7cfa",
          },
        },
        frontmatter: {
          alpha: 1,
          beta: "test",
          delta: { zeta: 1, yotta: 1 },
          gamma: ["one", "two"],
        },
        frontmatterPosition: {
          start: { line: 0, col: 0, offset: 0 },
          end: { line: 9, col: 3, offset: 72 },
        },
        frontmatterLinks: [],
      },
    };
  };

  describe("append", () => {
    test("heading", () => {
      const { meta, doc } = getSampleDocument();

      const expectedDocument = fs
        .readFileSync(
          path.resolve(__dirname, "./docs/sample_document.append.heading.md")
        )
        .toString();

      const result = handlePatchRequest(
        meta,
        doc,
        "Beep beep boop\n",
        "append",
        "heading",
        "Subheading 1:1"
      );

      expect(result).toMatch(expectedDocument);
    });
  });
});
