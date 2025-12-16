/**
 * Compression and encoding checks
 * - JPEG quantization table analysis
 * - Double compression detection (experimental)
 * - Block boundary analysis
 */

import type { CheckResult, ImageFile } from './types';
import { detectFileType, mean, standardDeviation } from './utils';

/**
 * Estimate JPEG quality from quantization tables
 * This is a rough heuristic based on analyzing DCT coefficient distributions
 */
export function checkJpegQuality(file: ImageFile): CheckResult | null {
  const fileType = detectFileType(file.arrayBuffer);
  
  if (fileType !== 'image/jpeg') {
    return null;
  }
  
  // Try to find and analyze quantization tables in JPEG
  const qualityEstimate = estimateJpegQuality(file.arrayBuffer);
  
  if (qualityEstimate === null) {
    return {
      id: 'jpeg-quality',
      name: 'JPEG Quality Analysis',
      status: 'info',
      summary: 'Could not determine JPEG quality',
      details: {
        'Format': 'JPEG',
        'Quality Estimate': 'Unknown',
      },
      confidence: 0.3,
      notes: 'Unable to extract quantization tables from this JPEG file.',
    };
  }
  
  let status: CheckResult['status'] = 'info';
  let notes = '';
  
  if (qualityEstimate < 50) {
    status = 'warn';
    notes = 'Low quality JPEG. Heavy compression may obscure forensic analysis and suggests multiple resaves.';
  } else if (qualityEstimate < 75) {
    notes = 'Medium quality JPEG. Some compression artifacts may be present.';
  } else if (qualityEstimate < 90) {
    notes = 'Good quality JPEG. Minimal compression artifacts expected.';
  } else {
    notes = 'High quality JPEG. Very little compression artifact expected.';
  }
  
  return {
    id: 'jpeg-quality',
    name: 'JPEG Quality Analysis',
    status,
    summary: `Estimated quality: ${qualityEstimate}%`,
    details: {
      'Format': 'JPEG',
      'Quality Estimate': `${qualityEstimate}%`,
      'Quality Level': getQualityLevel(qualityEstimate),
    },
    confidence: 0.6,
    notes,
  };
}

/**
 * Estimate JPEG quality from quantization tables
 * Based on the standard JPEG quantization matrix scaled by quality factor
 */
function estimateJpegQuality(buffer: ArrayBuffer): number | null {
  const bytes = new Uint8Array(buffer);
  
  // Look for DQT marker (0xFF 0xDB)
  for (let i = 0; i < bytes.length - 70; i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xDB) {
      // Found DQT marker
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      
      if (length >= 67) { // Standard 8x8 quantization table
        // Skip marker, length, and precision/table ID byte
        const tableStart = i + 5;
        
        // Get first few values of quantization table
        const q0 = bytes[tableStart]; // DC component
        const q1 = bytes[tableStart + 1];
        
        if (q0 === 0 || q0 === undefined) continue;
        
        // Estimate quality based on DC quantization value
        // Standard quality 50 has DC quant of 16
        // Quality scales the table: Q = 50 - (q0 - 16) * 2 approximately
        let quality: number;
        
        if (q0 < 2) {
          quality = 98;
        } else if (q0 < 10) {
          quality = Math.round(100 - q0 * 2);
        } else if (q0 < 50) {
          quality = Math.round(5000 / q0);
        } else {
          quality = Math.round((200 - q0 * 2));
        }
        
        return Math.max(1, Math.min(100, quality));
      }
    }
  }
  
  return null;
}

function getQualityLevel(quality: number): string {
  if (quality >= 90) return 'High';
  if (quality >= 75) return 'Good';
  if (quality >= 50) return 'Medium';
  return 'Low';
}

/**
 * Detect potential double JPEG compression
 * This is experimental and has many false positives
 */
export function checkDoubleCompression(file: ImageFile): CheckResult | null {
  const fileType = detectFileType(file.arrayBuffer);
  
  if (fileType !== 'image/jpeg') {
    return null;
  }
  
  // Analyze 8x8 block boundaries for artifacts
  const blockAnalysis = analyzeBlockBoundaries(file.imageData);
  
  let status: CheckResult['status'] = 'info';
  let summary = '';
  let notes = '';
  
  if (blockAnalysis.boundaryStrength > 0.7) {
    status = 'warn';
    summary = 'Strong block boundary artifacts detected';
    notes = 'EXPERIMENTAL: Pronounced 8×8 block boundaries may indicate double JPEG compression or heavy editing. However, this can also occur in low-quality JPEGs or after certain processing operations. Use with caution.';
  } else if (blockAnalysis.boundaryStrength > 0.4) {
    summary = 'Moderate block boundaries present';
    notes = 'Some JPEG block boundaries are visible, which is normal for JPEG compression. May indicate moderate compression quality.';
  } else {
    summary = 'Block boundaries within normal range';
    notes = 'JPEG block boundaries are minimal, suggesting either high quality compression or non-JPEG source.';
  }
  
  return {
    id: 'double-compression',
    name: 'Compression Artifacts (Experimental)',
    status,
    summary,
    details: {
      'Block Boundary Strength': `${(blockAnalysis.boundaryStrength * 100).toFixed(1)}%`,
      'Analysis Type': '8×8 DCT Block Analysis',
    },
    confidence: 0.4,
    notes,
  };
}

/**
 * Analyze 8x8 block boundaries for JPEG artifacts
 */
function analyzeBlockBoundaries(imageData: ImageData): { boundaryStrength: number } {
  const { width, height, data } = imageData;
  
  if (width < 16 || height < 16) {
    return { boundaryStrength: 0 };
  }
  
  // Convert to grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }
  
  // Measure gradient differences at block boundaries vs. within blocks
  const boundaryGradients: number[] = [];
  const innerGradients: number[] = [];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gradient = Math.abs(gray[idx] - gray[idx - 1]) + Math.abs(gray[idx] - gray[idx - width]);
      
      // Check if on 8x8 block boundary
      if (x % 8 === 0 || y % 8 === 0) {
        boundaryGradients.push(gradient);
      } else if (x % 8 === 4 && y % 8 === 4) {
        // Sample from block centers
        innerGradients.push(gradient);
      }
    }
  }
  
  if (boundaryGradients.length === 0 || innerGradients.length === 0) {
    return { boundaryStrength: 0 };
  }
  
  const boundaryMean = mean(boundaryGradients);
  const innerMean = mean(innerGradients);
  
  // Calculate ratio - higher ratio means stronger boundaries
  const ratio = innerMean > 0 ? boundaryMean / innerMean : 0;
  
  // Normalize to 0-1 range (ratio of 2+ is considered strong)
  const strength = Math.min(1, Math.max(0, (ratio - 0.8) / 1.2));
  
  return { boundaryStrength: strength };
}

/**
 * Check for suspicious uniform areas
 */
export function checkUniformAreas(file: ImageFile): CheckResult {
  const analysis = analyzeUniformity(file.imageData);
  
  let status: CheckResult['status'] = 'info';
  let summary = '';
  let notes = '';
  
  // Generate overlay showing uniform areas
  const overlay = generateUniformAreasOverlay(file.imageData, analysis.uniformMap);
  
  if (analysis.uniformRatio > 0.3) {
    status = 'warn';
    summary = `Large uniform areas detected (${(analysis.uniformRatio * 100).toFixed(0)}%)`;
    notes = 'Significant portions of the image have very uniform color/texture. This can indicate editing (cloning, filling) but is also common in images with solid backgrounds, sky, or simple graphics.';
  } else if (analysis.uniformRatio > 0.1) {
    summary = `Some uniform areas present (${(analysis.uniformRatio * 100).toFixed(0)}%)`;
    notes = 'Some uniform regions detected. This is often normal, especially in images with simple backgrounds.';
  } else {
    summary = 'Natural texture variation throughout';
    notes = 'The image shows typical texture variation without suspicious uniform regions.';
  }
  
  return {
    id: 'uniform-areas',
    name: 'Uniform Area Analysis',
    status,
    summary,
    details: {
      'Uniform Ratio': `${(analysis.uniformRatio * 100).toFixed(1)}%`,
      'Analysis': 'Texture variance per block',
    },
    confidence: 0.5,
    notes,
    overlay,
  };
}

/**
 * Analyze image for uniform areas
 */
function analyzeUniformity(imageData: ImageData): { uniformRatio: number; uniformMap: number[][] } {
  const { width, height, data } = imageData;
  const blockSize = 16;
  
  const blocksX = Math.floor(width / blockSize);
  const blocksY = Math.floor(height / blockSize);
  
  if (blocksX < 2 || blocksY < 2) {
    return { uniformRatio: 0, uniformMap: [] };
  }
  
  let uniformBlocks = 0;
  let totalBlocks = 0;
  const uniformMap: number[][] = [];
  
  for (let by = 0; by < blocksY; by++) {
    uniformMap[by] = [];
    for (let bx = 0; bx < blocksX; bx++) {
      const values: number[] = [];
      
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const x = bx * blockSize + dx;
          const y = by * blockSize + dy;
          const idx = (y * width + x) * 4;
          
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          values.push(gray);
        }
      }
      
      const variance = standardDeviation(values);
      
      // Store uniformity score (inverse of variance, normalized)
      const uniformityScore = Math.max(0, 1 - variance / 10);
      uniformMap[by][bx] = uniformityScore;
      
      // Very low variance indicates uniform area
      if (variance < 3) {
        uniformBlocks++;
      }
      
      totalBlocks++;
    }
  }
  
  return { uniformRatio: totalBlocks > 0 ? uniformBlocks / totalBlocks : 0, uniformMap };
}

/**
 * Generate overlay showing uniform areas
 */
function generateUniformAreasOverlay(imageData: ImageData, uniformMap: number[][]): ImageData {
  const { width, height } = imageData;
  const overlay = new ImageData(width, height);
  const blockSize = 16;
  
  for (let by = 0; by < uniformMap.length; by++) {
    for (let bx = 0; bx < uniformMap[by].length; bx++) {
      const score = uniformMap[by][bx];
      
      // Map score to color: low uniform (blue) to high uniform (red)
      const r = Math.floor(score * 255);
      const g = Math.floor((1 - score) * 128);
      const b = Math.floor((1 - score) * 255);
      const a = Math.floor(score * 200); // More transparent for less uniform areas
      
      // Fill the block
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const x = bx * blockSize + dx;
          const y = by * blockSize + dy;
          
          if (x < width && y < height) {
            const idx = (y * width + x) * 4;
            overlay.data[idx] = r;
            overlay.data[idx + 1] = g;
            overlay.data[idx + 2] = b;
            overlay.data[idx + 3] = a;
          }
        }
      }
    }
  }
  
  return overlay;
}

/**
 * Run all compression checks
 */
export function runCompressionChecks(file: ImageFile): CheckResult[] {
  const results: CheckResult[] = [];
  
  const jpegQuality = checkJpegQuality(file);
  if (jpegQuality) results.push(jpegQuality);
  
  const doubleComp = checkDoubleCompression(file);
  if (doubleComp) results.push(doubleComp);
  
  results.push(checkUniformAreas(file));
  
  return results;
}

