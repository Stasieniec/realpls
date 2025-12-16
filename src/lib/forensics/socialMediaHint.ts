/**
 * Social Media Reupload Detection
 * Heuristics to detect if an image has likely been shared through social media
 */

import type { CheckResult, ImageFile, ExifData } from './types';
import { SOCIAL_MEDIA_DIMENSIONS } from './types';
import { detectFileType } from './utils';

// We import the EXIF extraction function from metadata checks
// to avoid circular dependencies, we'll accept EXIF as parameter

/**
 * Check for signs of social media reupload
 */
export function checkSocialMediaHint(
  file: ImageFile,
  exifData: ExifData | null,
  jpegQuality: number | null
): CheckResult {
  const signals: string[] = [];
  let score = 0;
  
  // Check 1: Missing EXIF (common after social media)
  if (!exifData || Object.keys(exifData).length === 0) {
    signals.push('No EXIF metadata (stripped by most platforms)');
    score += 2;
  }
  
  // Check 2: Common social media dimensions
  const { width, height } = file;
  const maxDim = Math.max(width, height);
  
  for (const pattern of SOCIAL_MEDIA_DIMENSIONS) {
    if (maxDim === pattern.width) {
      signals.push(`Max dimension ${pattern.width}px (common for ${pattern.platform})`);
      score += 2;
      break;
    }
    // Also check for slight variations (within 10px)
    if (Math.abs(maxDim - pattern.width) < 10) {
      signals.push(`Max dimension ~${pattern.width}px (close to ${pattern.platform} limit)`);
      score += 1;
      break;
    }
  }
  
  // Check 3: JPEG format with lower quality
  const fileType = detectFileType(file.arrayBuffer);
  if (fileType === 'image/jpeg' && jpegQuality !== null) {
    if (jpegQuality < 85) {
      signals.push(`JPEG quality ~${jpegQuality}% (social platforms often recompress)`);
      score += 1;
    }
    if (jpegQuality < 70) {
      score += 1;
    }
  }
  
  // Check 4: Specific aspect ratios common on social media
  const aspectRatio = width / height;
  
  // Instagram square (1:1)
  if (Math.abs(aspectRatio - 1.0) < 0.01) {
    signals.push('Square aspect ratio (1:1) - common on Instagram');
    score += 1;
  }
  
  // Instagram portrait (4:5)
  if (Math.abs(aspectRatio - 0.8) < 0.02 || Math.abs(aspectRatio - 1.25) < 0.02) {
    signals.push('4:5 or 5:4 aspect ratio - common on Instagram');
    score += 1;
  }
  
  // Twitter/Facebook landscape (16:9)
  if (Math.abs(aspectRatio - 1.778) < 0.02 || Math.abs(aspectRatio - 0.5625) < 0.02) {
    signals.push('16:9 aspect ratio - common for video thumbnails');
    score += 1;
  }
  
  // Determine status
  let status: CheckResult['status'] = 'ok';
  let summary = '';
  let confidence = 0.4;
  
  if (score >= 4) {
    status = 'info';
    summary = 'Likely re-shared through social media';
    confidence = 0.7;
  } else if (score >= 2) {
    status = 'info';
    summary = 'Some signs of possible social media sharing';
    confidence = 0.5;
  } else {
    summary = 'No strong indicators of social media reupload';
    confidence = 0.4;
  }
  
  const details: Record<string, string | number | boolean | null> = {
    'Detection Score': `${score}/8`,
    'Signals Found': signals.length,
  };
  
  // Add signal details
  signals.forEach((signal, idx) => {
    details[`Signal ${idx + 1}`] = signal;
  });
  
  return {
    id: 'social-media-hint',
    name: 'Social Media Detection',
    status,
    summary,
    details,
    confidence,
    notes: score >= 2
      ? 'This image shows characteristics commonly associated with social media reuploads. Social platforms typically strip metadata, resize images, and recompress them. This is informational only and doesn\'t indicate manipulation.'
      : 'No strong indicators that this image has been shared through social media. The metadata and dimensions don\'t match common social media patterns.',
  };
}

/**
 * Run social media hint check
 */
export function runSocialMediaCheck(
  file: ImageFile,
  exifData: ExifData | null,
  jpegQuality: number | null
): CheckResult[] {
  return [checkSocialMediaHint(file, exifData, jpegQuality)];
}

