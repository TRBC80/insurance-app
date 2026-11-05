// Runs in the browser. Turns a large PDF into something small enough to send
// under Vercel's 4.5 MB request cap, without losing what matters:
//   - the text of every page (tiny, even for 100+ page policies)
//   - images of the first few pages (usually the declarations page, whose
//     tables and layout don't survive text extraction)
//   - images of any scanned pages that have no extractable text
//
// PDF.js (Mozilla's PDF reader) is loaded only when needed. Its worker is
// copied to /public at build time (see "prebuild" in package.json).

const KEY_PAGES = 4; // always image the first N pages
const MAX_PAGE_IMAGES = 20; // total page images (key + scanned)
const IMAGE_EDGE = 1400; // px on the long edge — readable, but small
const JPEG_QUALITY = 0.75;
const SCANNED_THRESHOLD = 80; // fewer non-space chars than this = scanned page

export const MAX_PDF_PAGES = 300;

function byteSize(str) {
  return new Blob([str]).size;
}

async function renderPageToJpeg(page) {
  const base = page.getViewport({ scale: 1 });
  const scale = IMAGE_EDGE / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const data = canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1];
  canvas.width = canvas.height = 0; // free memory on phones
  return data;
}

/**
 * @param {File} file
 * @param {{ budgetBytes: number, onProgress?: (done: number, total: number) => void }} opts
 * @returns {Promise<{ text: string, images: {page: number, data: string}[], pageCount: number }>}
 */
export async function shrinkPdf(file, { budgetBytes, onProgress }) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  });
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    loadingTask.destroy();
    if (err?.name === "PasswordException") {
      throw new Error(
        "That PDF is password-protected. Please remove the password, or upload photos of the pages."
      );
    }
    throw new Error("Couldn't open that PDF. Try another copy, or upload photos of the pages.");
  }

  try {
    const pageCount = pdf.numPages;
    if (pageCount > MAX_PDF_PAGES) {
      throw new Error(
        `That PDF has ${pageCount} pages. Please upload one under ${MAX_PDF_PAGES} pages — ` +
          "usually the declarations page and policy wording are enough."
      );
    }

    const parts = [];
    const images = [];
    let readablePages = 0;

    for (let n = 1; n <= pageCount; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => (item.str || "") + (item.hasEOL ? "\n" : " "))
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const scanned = text.replace(/\s/g, "").length < SCANNED_THRESHOLD;
      if (!scanned) readablePages++;

      const wantImage = (n <= KEY_PAGES || scanned) && images.length < MAX_PAGE_IMAGES;
      if (wantImage) {
        images.push({ page: n, key: n <= KEY_PAGES, data: await renderPageToJpeg(page) });
      }

      parts.push({ n, scanned, text });
      page.cleanup();
      onProgress?.(n, pageCount);
    }

    const buildText = () => {
      const imaged = new Set(images.map((i) => i.page));
      return parts
        .map(({ n, scanned, text }) =>
          `--- Page ${n} ---\n` +
          (!scanned
            ? text
            : imaged.has(n)
              ? "[No text on this page — see the image of this page.]"
              : "[Scanned page — text could not be read.]")
        )
        .join("\n\n");
    };
    let text = buildText();
    if (!readablePages && !images.length) {
      throw new Error("Couldn't read any text in that PDF. Try uploading photos of the pages.");
    }

    // Keep under the request budget: drop images (scanned first, key pages
    // last) until it fits. JSON escaping adds a little, hence the margin.
    const textBytes = Math.ceil(byteSize(text) * 1.08);
    if (textBytes > budgetBytes) {
      throw new Error("That policy is too long to send in one go. Try uploading just the main pages.");
    }
    let total = textBytes + images.reduce((s, i) => s + i.data.length, 0);
    while (total > budgetBytes && images.length) {
      const dropAt = images.map((i) => i.key).lastIndexOf(false);
      const [dropped] = images.splice(dropAt === -1 ? images.length - 1 : dropAt, 1);
      total -= dropped.data.length;
    }
    text = buildText();

    return {
      text,
      images: images.map(({ page, data }) => ({ page, data })),
      pageCount,
    };
  } finally {
    // In PDF.js 6, cleanup lives on the loading task.
    loadingTask.destroy().catch(() => {});
  }
}
