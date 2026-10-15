import { createWorker } from "tesseract.js";

export interface OcrProgress {
  status: string;
  progress: number;
}

/**
 * Preprocess receipt image locally using an offscreen canvas:
 * - Resizes if excessively large to keep OCR responsive and memory-safe
 * - Converts to high-contrast grayscale
 * - Enhances contrast to sharpen faint thermal receipt ink
 *
 * All operations occur purely in the browser memory. Zero image data is transmitted.
 */
export async function preprocessReceiptImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement("canvas");
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Bound max dimension to 2000px for performance and memory safety
      const maxDim = 2000;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Unable to obtain 2D canvas context for image preprocessing"));
        return;
      }

      // Draw original image
      ctx.drawImage(img, 0, 0, width, height);

      // Extract pixel data for grayscale and contrast enhancement
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // Contrast factor (contrast boost of ~1.3)
      const factor = (259 * (35 + 255)) / (255 * (259 - 35));

      for (let i = 0; i < data.length; i += 4) {
        // Standard luminance calculation
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // Contrast adjustment
        const contrast = Math.min(255, Math.max(0, factor * (gray - 128) + 128));

        data[i] = contrast;
        data[i + 1] = contrast;
        data[i + 2] = contrast;
      }

      ctx.putImageData(imgData, 0, 0);

      // Export processed image as local Data URL
      const dataUrl = canvas.toDataURL("image/png");

      // Clear canvas buffer from memory
      canvas.width = 0;
      canvas.height = 0;

      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load receipt image into browser. Please try another photo."));
    };

    img.src = objectUrl;
  });
}

/**
 * Perform privacy-preserving OCR on a receipt photo directly inside the user's browser.
 * No image bytes or recognition data are ever sent over the network.
 */
export async function recognizeReceiptText(
  file: File,
  onProgress?: (progress: OcrProgress) => void
): Promise<string> {
  onProgress?.({ status: "Preprocessing receipt photo...", progress: 0.1 });
  const preprocessedDataUrl = await preprocessReceiptImage(file);

  onProgress?.({ status: "Initializing private OCR engine...", progress: 0.25 });
  const worker = await createWorker("eng");

  try {
    onProgress?.({ status: "Recognizing receipt items...", progress: 0.45 });

    const ret = await worker.recognize(preprocessedDataUrl);
    onProgress?.({ status: "Processing completed", progress: 1.0 });

    return ret.data.text;
  } finally {
    // Terminate WebAssembly worker and clean up memory
    await worker.terminate();
  }
}
