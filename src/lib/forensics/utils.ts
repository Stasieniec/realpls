/**
 * Utility functions for forensic analysis
 */

import { FILE_SIGNATURES } from './types';

/**
 * Detect file type from magic bytes
 */
export function detectFileType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);
  
  // Check JPEG
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }
  
  // Check PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }
  
  // Check GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  
  // Check WebP (RIFF....WEBP)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return 'image/webp';
    }
  }
  
  return null;
}

/**
 * Check if GIF is animated
 */
export function isAnimatedGif(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  let frameCount = 0;
  
  // Look for multiple graphic control extension blocks
  for (let i = 0; i < bytes.length - 3; i++) {
    // Graphic Control Extension: 0x21 0xF9
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xF9) {
      frameCount++;
      if (frameCount > 1) return true;
    }
  }
  
  return false;
}

/**
 * Check if WebP is animated
 */
export function isAnimatedWebP(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  
  // Look for ANIM chunk which indicates animation
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x41 && bytes[i + 1] === 0x4E && 
        bytes[i + 2] === 0x49 && bytes[i + 3] === 0x4D) {
      return true;
    }
  }
  
  return false;
}

/**
 * Format file size to human readable
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Get image data from canvas
 */
export function getImageData(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): ImageData {
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Create canvas from image
 */
export async function createCanvasFromFile(file: File): Promise<{
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  imageData: ImageData;
  dataUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        resolve({
          canvas,
          ctx,
          width: img.width,
          height: img.height,
          imageData,
          dataUrl: e.target?.result as string
        });
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Calculate standard deviation
 */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Calculate mean of array
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Apply Laplacian kernel to get edge/texture response
 */
export function applyLaplacian(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const result = new Float32Array(width * height);
  
  // Convert to grayscale first
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }
  
  // Laplacian kernel: [0, 1, 0], [1, -4, 1], [0, 1, 0]
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian = 
        -4 * gray[idx] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - width] +
        gray[idx + width];
      
      result[idx] = Math.abs(laplacian);
    }
  }
  
  return result;
}

/**
 * Convert grayscale values to heatmap ImageData
 */
export function grayscaleToHeatmap(
  values: Float32Array,
  width: number,
  height: number,
  normalize = true
): ImageData {
  const imageData = new ImageData(width, height);
  const data = imageData.data;
  
  let maxVal = 1;
  if (normalize) {
    // Avoid stack overflow by not using spread operator on large arrays
    maxVal = 1;
    for (let i = 0; i < values.length; i++) {
      if (values[i] > maxVal) maxVal = values[i];
    }
  }
  
  for (let i = 0; i < values.length; i++) {
    const normalized = Math.min(values[i] / maxVal, 1);
    const idx = i * 4;
    
    // Blue -> Cyan -> Green -> Yellow -> Red
    if (normalized < 0.25) {
      data[idx] = 0;
      data[idx + 1] = Math.floor(normalized * 4 * 255);
      data[idx + 2] = 255;
    } else if (normalized < 0.5) {
      data[idx] = 0;
      data[idx + 1] = 255;
      data[idx + 2] = Math.floor((1 - (normalized - 0.25) * 4) * 255);
    } else if (normalized < 0.75) {
      data[idx] = Math.floor((normalized - 0.5) * 4 * 255);
      data[idx + 1] = 255;
      data[idx + 2] = 0;
    } else {
      data[idx] = 255;
      data[idx + 1] = Math.floor((1 - (normalized - 0.75) * 4) * 255);
      data[idx + 2] = 0;
    }
    
    data[idx + 3] = Math.floor(normalized * 200) + 55; // Alpha based on intensity
  }
  
  return imageData;
}

/**
 * Simple hash for a block of pixels (for clone detection)
 */
export function hashBlock(
  imageData: ImageData,
  x: number,
  y: number,
  blockSize: number
): string {
  const { width, data } = imageData;
  let hash = 0;
  
  for (let dy = 0; dy < blockSize; dy++) {
    for (let dx = 0; dx < blockSize; dx++) {
      const idx = ((y + dy) * width + (x + dx)) * 4;
      // Simple hash combining RGB values
      const gray = Math.floor(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      // Quantize to reduce sensitivity
      const quantized = Math.floor(gray / 16);
      hash = ((hash << 5) - hash + quantized) | 0;
    }
  }
  
  return hash.toString(16);
}

/**
 * Re-encode image as JPEG at specified quality (for ELA)
 */
export async function reencodeJpeg(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<{
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageData: ImageData;
}> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create blob'));
          return;
        }
        
        const img = new Image();
        const url = URL.createObjectURL(blob);
        
        img.onload = () => {
          URL.revokeObjectURL(url);
          
          const newCanvas = document.createElement('canvas');
          newCanvas.width = canvas.width;
          newCanvas.height = canvas.height;
          
          const ctx = newCanvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, newCanvas.width, newCanvas.height);
          
          resolve({ canvas: newCanvas, ctx, imageData });
        };
        
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to load reencoded image'));
        };
        
        img.src = url;
      },
      'image/jpeg',
      quality
    );
  });
}

