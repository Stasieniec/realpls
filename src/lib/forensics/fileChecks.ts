/**
 * File and container level checks
 * - File type detection from magic bytes
 * - File size, dimensions, color depth
 * - Animation detection
 */

import type { CheckResult, ImageFile } from './types';
import { 
  detectFileType, 
  isAnimatedGif, 
  isAnimatedWebP, 
  formatFileSize 
} from './utils';

/**
 * Check file type matches magic bytes
 */
export function checkFileType(file: ImageFile): CheckResult {
  const detectedType = detectFileType(file.arrayBuffer);
  const declaredType = file.file.type;
  const extension = file.file.name.split('.').pop()?.toLowerCase();
  
  const extensionToMime: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  
  const expectedFromExt = extension ? extensionToMime[extension] : null;
  
  let status: CheckResult['status'] = 'ok';
  let summary = '';
  let notes = '';
  
  if (!detectedType) {
    status = 'warn';
    summary = 'Could not verify file type from magic bytes';
    notes = 'The file signature could not be recognized. This may indicate a corrupted or unusual file format.';
  } else if (detectedType !== declaredType && declaredType) {
    status = 'warn';
    summary = `File signature (${detectedType}) differs from declared type (${declaredType})`;
    notes = 'This mismatch could indicate the file was renamed or modified. Not necessarily suspicious, but worth noting.';
  } else if (expectedFromExt && detectedType !== expectedFromExt) {
    status = 'warn';
    summary = `File extension (.${extension}) doesn't match actual type (${detectedType})`;
    notes = 'The file extension may have been changed. The actual content appears to be a different format.';
  } else {
    summary = `File type verified: ${detectedType || declaredType}`;
    notes = 'File signature matches the expected format.';
  }
  
  return {
    id: 'file-type',
    name: 'File Type Detection',
    status,
    summary,
    details: {
      'Detected Type': detectedType || 'Unknown',
      'Declared Type': declaredType || 'None',
      'Extension': extension || 'None',
      'Match': detectedType === declaredType ? 'Yes' : 'No',
    },
    confidence: detectedType ? 0.95 : 0.5,
    notes,
  };
}

/**
 * Check file properties (size, dimensions)
 */
export function checkFileProperties(file: ImageFile): CheckResult {
  const { width, height } = file;
  const fileSize = file.file.size;
  const aspectRatio = (width / height).toFixed(2);
  
  // Check for suspicious dimensions
  let status: CheckResult['status'] = 'info';
  let notes = '';
  
  // Very small images might be thumbnails
  if (width < 100 || height < 100) {
    notes = 'Very small image dimensions. May be a thumbnail or icon.';
  }
  // Very large images
  else if (width > 8000 || height > 8000) {
    notes = 'Very high resolution image.';
  }
  // Check for non-standard aspect ratios
  else {
    notes = 'Standard image dimensions.';
  }
  
  // Check for alpha channel
  const hasAlpha = checkAlphaChannel(file.imageData);
  
  return {
    id: 'file-properties',
    name: 'File Properties',
    status,
    summary: `${width}×${height} px, ${formatFileSize(fileSize)}`,
    details: {
      'Width': `${width} px`,
      'Height': `${height} px`,
      'File Size': formatFileSize(fileSize),
      'Aspect Ratio': aspectRatio,
      'Has Alpha': hasAlpha ? 'Yes' : 'No',
      'Megapixels': ((width * height) / 1000000).toFixed(2) + ' MP',
    },
    confidence: 1,
    notes,
  };
}

/**
 * Check for alpha channel usage
 */
function checkAlphaChannel(imageData: ImageData): boolean {
  const { data } = imageData;
  
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check for animation
 */
export function checkAnimation(file: ImageFile): CheckResult | null {
  const detectedType = detectFileType(file.arrayBuffer);
  
  let isAnimated = false;
  let format = '';
  
  if (detectedType === 'image/gif') {
    isAnimated = isAnimatedGif(file.arrayBuffer);
    format = 'GIF';
  } else if (detectedType === 'image/webp') {
    isAnimated = isAnimatedWebP(file.arrayBuffer);
    format = 'WebP';
  } else {
    return null; // Not applicable for other formats
  }
  
  if (!isAnimated) {
    return {
      id: 'animation',
      name: 'Animation Detection',
      status: 'ok',
      summary: `Static ${format} image (not animated)`,
      details: {
        'Format': format,
        'Animated': 'No',
      },
      confidence: 0.9,
      notes: 'Single-frame image detected.',
    };
  }
  
  return {
    id: 'animation',
    name: 'Animation Detection',
    status: 'warn',
    summary: `Animated ${format} detected`,
    details: {
      'Format': format,
      'Animated': 'Yes',
    },
    confidence: 0.9,
    notes: 'Animated images have limited forensic analysis support. Only the first frame is analyzed. Forensic checks may not reflect the full content.',
  };
}

/**
 * Run all file checks
 */
export function runFileChecks(file: ImageFile): CheckResult[] {
  const results: CheckResult[] = [
    checkFileType(file),
    checkFileProperties(file),
  ];
  
  const animationCheck = checkAnimation(file);
  if (animationCheck) {
    results.push(animationCheck);
  }
  
  return results;
}

