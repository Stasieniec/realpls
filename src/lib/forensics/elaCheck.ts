/**
 * Error Level Analysis (ELA)
 * Detects potential edits by comparing original with recompressed version
 * 
 * IMPORTANT: ELA has significant limitations and can produce misleading results.
 * It should never be used as sole evidence of manipulation.
 */

import type { CheckResult, ImageFile } from './types';
import { detectFileType, reencodeJpeg, grayscaleToHeatmap } from './utils';

const ELA_QUALITY = 90; // Re-encode quality for comparison

/**
 * Perform Error Level Analysis on JPEG images
 */
export async function performELA(file: ImageFile): Promise<CheckResult | null> {
  const fileType = detectFileType(file.arrayBuffer);
  
  // ELA is primarily useful for JPEG images
  if (fileType !== 'image/jpeg') {
    return {
      id: 'ela',
      name: 'Error Level Analysis',
      status: 'info',
      summary: 'ELA not applicable (non-JPEG)',
      details: {
        'Format': fileType || 'Unknown',
        'Note': 'ELA is designed for JPEG images',
      },
      confidence: 0.3,
      notes: 'Error Level Analysis is most meaningful for JPEG images. For PNG or other formats, the analysis would not provide useful results.',
    };
  }
  
  try {
    // Re-encode at fixed quality
    const reencoded = await reencodeJpeg(file.canvas, ELA_QUALITY / 100);
    
    // Calculate difference
    const originalData = file.imageData.data;
    const reencodedData = reencoded.imageData.data;
    const width = file.width;
    const height = file.height;
    
    const diffValues = new Float32Array(width * height);
    let maxDiff = 0;
    let totalDiff = 0;
    
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      
      // Calculate difference per channel
      const diffR = Math.abs(originalData[idx] - reencodedData[idx]);
      const diffG = Math.abs(originalData[idx + 1] - reencodedData[idx + 1]);
      const diffB = Math.abs(originalData[idx + 2] - reencodedData[idx + 2]);
      
      // Combined difference
      const diff = (diffR + diffG + diffB) / 3;
      diffValues[i] = diff;
      
      totalDiff += diff;
      if (diff > maxDiff) maxDiff = diff;
    }
    
    // Calculate statistics
    const avgDiff = totalDiff / (width * height);
    
    // Analyze variance in differences
    let variance = 0;
    for (let i = 0; i < diffValues.length; i++) {
      variance += Math.pow(diffValues[i] - avgDiff, 2);
    }
    variance = Math.sqrt(variance / diffValues.length);
    
    // Scale for visualization (ELA differences are often subtle)
    const scaledDiff = new Float32Array(diffValues.length);
    const scale = maxDiff > 0 ? 255 / maxDiff : 1;
    
    for (let i = 0; i < diffValues.length; i++) {
      scaledDiff[i] = Math.min(diffValues[i] * scale * 2, 255);
    }
    
    // Generate heatmap overlay
    const overlay = grayscaleToHeatmap(scaledDiff, width, height, false);
    
    // Determine status based on variance
    // High variance might indicate edited regions (but many false positives!)
    let status: CheckResult['status'] = 'info';
    let summary = '';
    
    if (variance > 20) {
      status = 'warn';
      summary = 'ELA shows notable variation (review recommended)';
    } else {
      summary = 'ELA shows relatively uniform error levels';
    }
    
    return {
      id: 'ela',
      name: 'Error Level Analysis',
      status,
      summary,
      details: {
        'Re-encode Quality': `${ELA_QUALITY}%`,
        'Average Difference': avgDiff.toFixed(2),
        'Max Difference': maxDiff.toFixed(2),
        'Variance': variance.toFixed(2),
      },
      confidence: 0.4,
      notes: `⚠️ IMPORTANT CAVEATS:

• ELA results are highly prone to false positives
• Previously compressed/resaved images will show varied ELA regardless of editing
• Social media reuploads typically produce noisy ELA results
• Solid colors and smooth gradients naturally show different error levels than textured areas
• ELA cannot definitively prove or disprove image manipulation
• Use ELA as ONE data point among many, never as sole evidence

The overlay shows areas of higher error (potential edits) in warm colors. Look for unusual patterns that don't correspond to the image content, but interpret with extreme caution.`,
      overlay,
    };
  } catch (error) {
    return {
      id: 'ela',
      name: 'Error Level Analysis',
      status: 'info',
      summary: 'ELA analysis failed',
      details: {
        'Error': error instanceof Error ? error.message : 'Unknown error',
      },
      confidence: 0.1,
      notes: 'Could not perform Error Level Analysis. This may be due to image format issues or browser limitations.',
    };
  }
}

/**
 * Run ELA check
 */
export async function runELACheck(file: ImageFile): Promise<CheckResult[]> {
  const result = await performELA(file);
  return result ? [result] : [];
}

