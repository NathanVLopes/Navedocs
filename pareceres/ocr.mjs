/**
 * NAVEDOCS — extração local de AIT. Os documentos não são transmitidos a APIs de terceiros.
 * O Tesseract.js pode baixar APENAS arquivos públicos de idioma no primeiro uso;
 * configure NAVEDOCS_OCR_LANG_PATH para usar os modelos de idioma hospedados internamente.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const MAX_PAGES = 3;
const MAX_PIXELS = 3_000_000;
const MAX_TEXT = 100_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function safePdfText(items) {
  // Mantém a sequência de leitura e diferencia linhas aproximadas por coordenada.
  let y = null; const out = [];
  for (const item of items || []) {
    if (typeof item.str !== 'string') continue;
    const current = Array.isArray(item.transform) ? item.transform[5] : null;
    if (y !== null && current !== null && Math.abs(y - current) > 3) out.push('\n');
    out.push(item.str, ' ');
    if (current !== null) y = current;
    if (out.join('').length >= MAX_TEXT) break;
  }
  return out.join('').slice(0, MAX_TEXT);
}

/**
 * Adaptadores opcionais permitem testar a lógica sem carregar bibliotecas nativas.
 * Em produção, as dependências são explicitamente declaradas no package.json.
 */
export async function recognizeAit(buffer, mime, { privateRoot, adapters = {} } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_FILE_BYTES) {
    throw new Error('Arquivo AIT inválido ou acima de 10 MB.');
  }
  if (!['image/png', 'image/jpeg', 'application/pdf'].includes(mime)) {
    throw new Error('Tipo de AIT não aceito.');
  }
  const canvasApi = adapters.canvas || await import('@napi-rs/canvas');
  const { createCanvas, loadImage } = canvasApi;
  let worker;
  let method = mime === 'application/pdf' ? 'pdf_texto' : 'ocr_imagem';
  let ocrPages = 0;
  const ocr = async (image) => {
    if (!worker) {
      const { createWorker } = adapters.tesseract || await import('tesseract.js');
      const workerOpts = {};
      if (process.env.NAVEDOCS_OCR_LANG_PATH) workerOpts.langPath = process.env.NAVEDOCS_OCR_LANG_PATH;
      if (privateRoot) {
        const cacheDir = path.join(privateRoot, 'ocr-language-cache');
        mkdirSync(cacheDir, { recursive: true });
        workerOpts.cachePath = path.join(cacheDir, 'por_eng');
      }
      worker = await createWorker(['por', 'eng'], 1, workerOpts);
    }
    ocrPages++;
    const { data } = await worker.recognize(image);
    return String(data?.text || '').slice(0, MAX_TEXT);
  };
  try {
    if (mime !== 'application/pdf') {
      const image = await loadImage(buffer);
      const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (image.width * image.height)));
      const w = Math.max(1, Math.round(image.width * scale));
      const h = Math.max(1, Math.round(image.height * scale));
      const canvas = createCanvas(w, h);
      canvas.getContext('2d').drawImage(image, 0, 0, w, h);
      const text = await ocr(await canvas.encode('png'));
      return { text, method, scannedPages: ocrPages, pages: 1 };
    }
    const pdfjs = adapters.pdfjs || await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false });
    const pdf = await task.promise;
    try {
      if (pdf.numPages > MAX_PAGES) {
        throw new Error(`AIT PDF com mais de ${MAX_PAGES} páginas. Envie apenas as páginas do auto.`);
      }
      let text = '';
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const nativeText = safePdfText((await page.getTextContent()).items);
        if (nativeText.replace(/\s/g, '').length > 100) {
          text += '\n' + nativeText;
          continue;
        }
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext('2d');
        await page.render({ canvas, canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;
        text += '\n' + nativeText + '\n' + await ocr(await canvas.encode('png'));
        page.cleanup();
      }
      method = ocrPages ? 'pdf_com_ocr' : 'pdf_texto';
      return { text: text.slice(0, MAX_TEXT), method, scannedPages: ocrPages, pages: pdf.numPages };
    } finally {
      await pdf.destroy();
    }
  } finally {
    if (worker) await worker.terminate();
  }
}
