/* 一页 · 图片文字识别（可选功能）
 *
 * 为什么不是默认路径：
 *  iPhone 自带「实况文本」的识别质量远好于网页 OCR。推荐流程是
 *  截图 → 相册长按文字 → 拷贝 → 回到一页粘贴。零等待、完全离线。
 *
 * 这里保留一个兜底：选图 → 浏览器里跑 Tesseract（首次需联网下载约 3MB 语言包）。
 */

const TESSERACT_VERSION = '5.1.1';
const CDNS = [
  `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`,
  `https://unpkg.com/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`,
  `https://fastly.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`,
];

const LABELS = {
  'loading tesseract core': '载入识别引擎…',
  'initializing tesseract': '初始化…',
  'loading language traineddata': '下载中文识别包（约 3MB，仅首次）…',
  'initializing api': '准备中文模型…',
  'recognizing text': '正在识别文字…',
};

let scriptPromise = null;
let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('load failed: ' + src));
    document.head.appendChild(s);
  });
}

async function ensureTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (!scriptPromise) {
    scriptPromise = (async () => {
      for (const url of CDNS) {
        try {
          await loadScript(url);
          if (window.Tesseract) return window.Tesseract;
        } catch {
          // 换下一个源
        }
      }
      scriptPromise = null;
      throw new Error('识别库加载失败');
    })();
  }
  return scriptPromise;
}

async function getWorker(onProgress) {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const Tesseract = await ensureTesseract();
    const worker = await Tesseract.createWorker('chi_sim+eng', 1, {
      logger: (m) => {
        if (!m || !m.status) return;
        const label = LABELS[m.status];
        if (label) onProgress?.({ label, progress: m.progress || 0, raw: m.status });
      },
      errorHandler: (e) => console.warn('OCR worker:', e),
    });
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6',
    });
    return worker;
  })();
  try {
    return await workerPromise;
  } catch (e) {
    workerPromise = null;
    throw e;
  }
}

/** 压缩到最长边 1800，既提速又不明显掉字 */
async function prepare(file) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas;
}

export async function recognizeImage(file, onProgress) {
  if (!file) throw new Error('没有选择图片');
  if (file.size > 20 * 1024 * 1024) throw new Error('图片太大了，换一张试试');
  const canvas = await prepare(file);
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(canvas);
  return String(data?.text || '').trim();
}

export async function warmupOcr(onProgress) {
  try {
    await getWorker(onProgress);
    return true;
  } catch {
    return false;
  }
}

export function hasOcrSupport() {
  return typeof createImageBitmap === 'function' && typeof WebAssembly === 'object';
}
