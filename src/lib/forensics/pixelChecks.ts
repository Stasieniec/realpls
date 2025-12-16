/**
 * Pixel-level consistency checks
 * - Noise/texture inconsistency mapping
 * - Edge inconsistency detection
 * - Clone detection (coarse block hashing)
 */

import type { CheckResult, ImageFile, Region } from './types';
import { 
  applyLaplacian, 
  grayscaleToHeatmap, 
  hashBlock, 
  mean, 
  standardDeviation 
} from './utils';

/**
 * Analyze noise/texture consistency across the image
 * Uses Laplacian energy to detect regions with different noise characteristics
 */
export function checkNoiseConsistency(file: ImageFile): CheckResult {
  const { imageData, width, height } = file;
  
  // Apply Laplacian to get texture/noise response
  const laplacian = applyLaplacian(imageData);
  
  // Analyze texture energy per block
  const blockSize = 32;
  const blocksX = Math.floor(width / blockSize);
  const blocksY = Math.floor(height / blockSize);
  
  if (blocksX < 3 || blocksY < 3) {
    return {
      id: 'noise-consistency',
      name: 'Noise Consistency Analysis',
      status: 'info',
      summary: 'Image too small for reliable noise analysis',
      details: {
        'Analysis': 'Skipped - insufficient resolution',
      },
      confidence: 0.2,
      notes: 'The image is too small to perform meaningful noise consistency analysis.',
    };
  }
  
  const blockEnergies: number[] = [];
  const blockMap: number[][] = [];
  
  for (let by = 0; by < blocksY; by++) {
    blockMap[by] = [];
    for (let bx = 0; bx < blocksX; bx++) {
      let energy = 0;
      let count = 0;
      
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const x = bx * blockSize + dx;
          const y = by * blockSize + dy;
          const idx = y * width + x;
          
          if (idx < laplacian.length) {
            energy += laplacian[idx];
            count++;
          }
        }
      }
      
      const avgEnergy = count > 0 ? energy / count : 0;
      blockEnergies.push(avgEnergy);
      blockMap[by][bx] = avgEnergy;
    }
  }
  
  // Calculate statistics
  const meanEnergy = mean(blockEnergies);
  const stdEnergy = standardDeviation(blockEnergies);
  
  // Find outlier blocks
  const outlierThreshold = 2.5; // Standard deviations
  const outlierBlocks: Region[] = [];
  
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const energy = blockMap[by][bx];
      const zScore = stdEnergy > 0 ? Math.abs(energy - meanEnergy) / stdEnergy : 0;
      
      if (zScore > outlierThreshold) {
        outlierBlocks.push({
          x: bx * blockSize,
          y: by * blockSize,
          width: blockSize,
          height: blockSize,
          label: `Z-score: ${zScore.toFixed(1)}`,
        });
      }
    }
  }
  
  // Generate heatmap overlay
  const overlay = grayscaleToHeatmap(laplacian, width, height);
  
  // Determine status
  const outlierRatio = outlierBlocks.length / blockEnergies.length;
  let status: CheckResult['status'] = 'ok';
  let summary = '';
  let notes = '';
  
  if (outlierRatio > 0.15) {
    status = 'warn';
    summary = `Significant noise inconsistencies detected (${outlierBlocks.length} regions)`;
    notes = 'Multiple regions show significantly different noise/texture characteristics. This could indicate editing, compositing, or different image sources. However, it can also occur naturally at boundaries between textured and smooth areas.';
  } else if (outlierRatio > 0.05) {
    status = 'info';
    summary = `Some noise variation detected (${outlierBlocks.length} regions)`;
    notes = 'A few regions show different noise characteristics. This is often normal and can occur at natural boundaries in images.';
  } else {
    summary = 'Noise characteristics appear consistent';
    notes = 'The image shows relatively uniform noise characteristics throughout, which is expected for unedited photos.';
  }
  
  return {
    id: 'noise-consistency',
    name: 'Noise Consistency Analysis',
    status,
    summary,
    details: {
      'Blocks Analyzed': blockEnergies.length,
      'Outlier Blocks': outlierBlocks.length,
      'Outlier Ratio': `${(outlierRatio * 100).toFixed(1)}%`,
      'Mean Energy': meanEnergy.toFixed(2),
      'Std Dev': stdEnergy.toFixed(2),
    },
    confidence: 0.6,
    notes,
    overlay,
    regions: outlierBlocks,
  };
}

/**
 * Detect unusually sharp edges that might indicate compositing
 */
export function checkEdgeInconsistency(file: ImageFile): CheckResult {
  const { imageData, width, height } = file;
  const { data } = imageData;
  
  // Calculate edge strength using Sobel-like operator
  const edgeMap = new Float32Array(width * height);
  
  // Convert to grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }
  
  // Calculate gradient magnitude
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel X
      const gx = 
        -gray[idx - width - 1] + gray[idx - width + 1] +
        -2 * gray[idx - 1] + 2 * gray[idx + 1] +
        -gray[idx + width - 1] + gray[idx + width + 1];
      
      // Sobel Y
      const gy = 
        -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1] +
        gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];
      
      edgeMap[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  
  // Find strong edges and analyze their characteristics
  // Calculate mean and std without creating large arrays to avoid stack overflow
  let edgeSum = 0;
  let edgeCount = 0;
  for (let i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] > 0) {
      edgeSum += edgeMap[i];
      edgeCount++;
    }
  }
  const meanEdge = edgeCount > 0 ? edgeSum / edgeCount : 0;
  
  let varianceSum = 0;
  for (let i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] > 0) {
      varianceSum += Math.pow(edgeMap[i] - meanEdge, 2);
    }
  }
  const stdEdge = edgeCount > 0 ? Math.sqrt(varianceSum / edgeCount) : 0;
  
  // Count very strong edges (potential artificial edges)
  const strongEdgeThreshold = meanEdge + 3 * stdEdge;
  let strongEdgeCount = 0;
  
  for (const v of edgeMap) {
    if (v > strongEdgeThreshold) strongEdgeCount++;
  }
  
  const strongEdgeRatio = strongEdgeCount / (width * height);
  
  // Generate edge overlay
  const overlay = grayscaleToHeatmap(edgeMap, width, height);
  
  let status: CheckResult['status'] = 'ok';
  let summary = '';
  let notes = '';
  
  if (strongEdgeRatio > 0.02) {
    status = 'info';
    summary = 'Contains sharp edges worth reviewing';
    notes = 'The image contains notable sharp edges. Sharp edges can indicate artificial boundaries from editing, but are also common in high-contrast photos, text, or graphics.';
  } else {
    summary = 'Edge characteristics appear natural';
    notes = 'Edge distribution appears typical for a natural photograph.';
  }
  
  return {
    id: 'edge-consistency',
    name: 'Edge Analysis',
    status,
    summary,
    details: {
      'Mean Edge Strength': meanEdge.toFixed(2),
      'Strong Edge Ratio': `${(strongEdgeRatio * 100).toFixed(2)}%`,
    },
    confidence: 0.5,
    notes,
    overlay,
  };
}

/**
 * Simple clone detection using block hashing
 * This is a lightweight check that can find obvious duplicated regions
 */
export function checkCloneDetection(file: ImageFile, deepScan = false): CheckResult {
  const { imageData, width, height } = file;
  
  const blockSize = deepScan ? 16 : 32;
  const step = deepScan ? 8 : 16;
  
  const blocksX = Math.floor((width - blockSize) / step);
  const blocksY = Math.floor((height - blockSize) / step);
  
  if (blocksX < 4 || blocksY < 4) {
    return {
      id: 'clone-detection',
      name: 'Clone Detection',
      status: 'info',
      summary: 'Image too small for clone analysis',
      details: {
        'Analysis': 'Skipped - insufficient resolution',
      },
      confidence: 0.2,
      notes: 'The image is too small to perform meaningful clone detection.',
    };
  }
  
  // Build hash map
  const hashMap = new Map<string, { x: number; y: number }[]>();
  
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const x = bx * step;
      const y = by * step;
      
      const hash = hashBlock(imageData, x, y, blockSize);
      
      if (!hashMap.has(hash)) {
        hashMap.set(hash, []);
      }
      hashMap.get(hash)!.push({ x, y });
    }
  }
  
  // Find duplicate blocks (excluding neighbors)
  const duplicateRegions: Region[] = [];
  const minDistance = blockSize * 2;
  
  for (const positions of hashMap.values()) {
    if (positions.length > 1) {
      // Check if duplicates are far enough apart
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x;
          const dy = positions[i].y - positions[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > minDistance) {
            duplicateRegions.push({
              x: positions[i].x,
              y: positions[i].y,
              width: blockSize,
              height: blockSize,
            });
            duplicateRegions.push({
              x: positions[j].x,
              y: positions[j].y,
              width: blockSize,
              height: blockSize,
            });
          }
        }
      }
    }
  }
  
  // Deduplicate overlapping regions
  const uniqueRegions = deduplicateRegions(duplicateRegions, blockSize);
  
  let status: CheckResult['status'] = 'ok';
  let summary = '';
  let notes = '';
  
  if (uniqueRegions.length > 10) {
    status = 'warn';
    summary = `Potential cloned regions detected (${uniqueRegions.length} matches)`;
    notes = 'Multiple similar regions found that are spatially separated. This could indicate copy-paste editing. However, patterns, textures, and repeated elements in scenes can cause false positives.';
  } else if (uniqueRegions.length > 0) {
    status = 'info';
    summary = `Some similar regions found (${uniqueRegions.length} matches)`;
    notes = 'A few similar regions were detected. This is often caused by natural patterns or textures in the image.';
  } else {
    summary = 'No obvious cloned regions detected';
    notes = 'No significantly similar regions found. This doesn\'t guarantee no cloning occurred, as sophisticated edits may not be detected.';
  }
  
  return {
    id: 'clone-detection',
    name: deepScan ? 'Clone Detection (Deep Scan)' : 'Clone Detection',
    status,
    summary,
    details: {
      'Scan Type': deepScan ? 'Deep (slower, more thorough)' : 'Quick',
      'Block Size': `${blockSize}px`,
      'Matches Found': uniqueRegions.length,
      'Blocks Analyzed': blocksX * blocksY,
    },
    confidence: deepScan ? 0.6 : 0.4,
    notes,
    regions: uniqueRegions,
  };
}

/**
 * Remove overlapping regions
 */
function deduplicateRegions(regions: Region[], margin: number): Region[] {
  const unique: Region[] = [];
  
  for (const region of regions) {
    let isDuplicate = false;
    
    for (const existing of unique) {
      if (
        Math.abs(region.x - existing.x) < margin &&
        Math.abs(region.y - existing.y) < margin
      ) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      unique.push(region);
    }
  }
  
  return unique;
}

/**
 * Run all pixel-level checks
 */
export function runPixelChecks(file: ImageFile, deepCloneScan = false): CheckResult[] {
  return [
    checkNoiseConsistency(file),
    checkEdgeInconsistency(file),
    checkCloneDetection(file, deepCloneScan),
  ];
}

