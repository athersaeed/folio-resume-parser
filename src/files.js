import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { unzipSync, strFromU8 } from "fflate";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export async function extractFile(file) {
  if (file.size > MAX_FILE_BYTES)
    throw new Error("Please upload a file smaller than 15 MB.");
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "txt") return file.text();
  if (extension === "docx") {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) =>
        entry.name === "word/document.xml" &&
        entry.originalSize <= 20 * 1024 * 1024,
    });
    const documentXml = files["word/document.xml"];
    if (!documentXml)
      throw new Error(
        "This DOCX has no readable document body, or its extracted text is too large.",
      );
    const xml = new DOMParser().parseFromString(
      strFromU8(documentXml),
      "application/xml",
    );
    if (xml.getElementsByTagName("parsererror").length)
      throw new Error(
        "This DOCX contains invalid document XML. Try pasting its text.",
      );
    const wordNamespace =
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    return Array.from(xml.getElementsByTagNameNS(wordNamespace, "p"))
      .map((paragraph) =>
        Array.from(paragraph.getElementsByTagNameNS(wordNamespace, "*"))
          .map((node) =>
            node.localName === "t"
              ? node.textContent
              : node.localName === "tab"
                ? "   "
                : node.localName === "br"
                  ? "\n"
                  : "",
          )
          .join(""),
      )
      .join("\n");
  }
  if (extension !== "pdf")
    throw new Error(
      "Supported formats: PDF, DOCX, and TXT. You can also paste text.",
    );
  const task = pdfjs.getDocument({
    data: await file.arrayBuffer(),
    isEvalSupported: false,
    enableScripting: false,
  });
  const timeout = setTimeout(() => task.destroy(), 30000);
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 30)
      throw new Error("Please use a resume with 30 pages or fewer.");
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      // Group glyphs by baseline and sort horizontally to recover natural lines.
      const rows = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = item.transform[5];
        let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push(item);
      }
      rows.sort((a, b) => b.y - a.y);
      pages.push(
        rows
          .map((row) =>
            row.items
              .sort((a, b) => a.transform[4] - b.transform[4])
              .map((item, i, items) => {
                if (!i) return item.str;
                const previous = items[i - 1];
                const gap =
                  item.transform[4] - previous.transform[4] - previous.width;
                return (gap > 16 ? "   " : " ") + item.str;
              })
              .join(""),
          )
          .join("\n"),
      );
    }
    const text = pages.join("\n\n");
    if (text.replace(/\s/g, "").length < 30)
      throw new Error(
        "This PDF has too little readable text. Scanned PDFs need OCR; paste the text or upload a DOCX instead.",
      );
    return text;
  } finally {
    clearTimeout(timeout);
    await task.destroy();
  }
}
