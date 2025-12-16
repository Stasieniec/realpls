/**
 * Metadata and EXIF checks
 * - Extract EXIF data
 * - Detect editing software signatures
 * - Flag missing metadata
 */

import type { CheckResult, ImageFile, ExifData } from './types';
import { EDITING_SOFTWARE } from './types';

// We use exifr library for EXIF parsing - it's lightweight (~30KB) and handles
// most image formats well. Imported dynamically to avoid SSR issues.
let exifr: typeof import('exifr') | null = null;

async function getExifr() {
  if (!exifr) {
    exifr = await import('exifr');
  }
  return exifr;
}

/**
 * Extract EXIF metadata from image
 */
export async function extractExif(file: ImageFile): Promise<ExifData | null> {
  try {
    const exifrLib = await getExifr();
    const data = await exifrLib.parse(file.arrayBuffer, {
      // Request all useful tags
      pick: [
        'Make', 'Model', 'Software', 'DateTime', 'DateTimeOriginal',
        'GPSLatitude', 'GPSLongitude', 'ExposureTime', 'FNumber',
        'ISO', 'ImageWidth', 'ImageHeight', 'Orientation',
        'ColorSpace', 'Flash', 'FocalLength', 'WhiteBalance',
        'ExposureMode', 'MeteringMode', 'Artist', 'Copyright',
      ],
    });
    
    return data || null;
  } catch (e) {
    // EXIF parsing can fail for various reasons
    console.warn('EXIF extraction failed:', e);
    return null;
  }
}

/**
 * Check EXIF presence and camera info
 */
export async function checkExifPresence(file: ImageFile): Promise<CheckResult> {
  const exif = await extractExif(file);
  
  if (!exif || Object.keys(exif).length === 0) {
    return {
      id: 'exif-presence',
      name: 'EXIF Metadata',
      status: 'info',
      summary: 'No EXIF metadata found',
      details: {
        'EXIF Present': 'No',
      },
      confidence: 0.8,
      notes: 'Missing EXIF is common after social media uploads, screenshots, or intentional stripping. This is not necessarily suspicious, but original camera photos typically contain EXIF data.',
    };
  }
  
  const details: Record<string, string | number | boolean | null> = {
    'EXIF Present': 'Yes',
  };
  
  if (exif.Make) details['Camera Make'] = exif.Make;
  if (exif.Model) details['Camera Model'] = exif.Model;
  if (exif.Software) details['Software'] = exif.Software;
  if (exif.DateTime) details['Date/Time'] = formatExifDate(exif.DateTime);
  if (exif.DateTimeOriginal) details['Original Date'] = formatExifDate(exif.DateTimeOriginal);
  if (exif.ExposureTime) details['Exposure'] = formatExposure(exif.ExposureTime);
  if (exif.FNumber) details['Aperture'] = `f/${exif.FNumber}`;
  if (exif.ISO) details['ISO'] = exif.ISO;
  
  const hasGps = exif.GPSLatitude !== undefined && exif.GPSLongitude !== undefined;
  details['GPS Data'] = hasGps ? 'Present' : 'None';
  
  return {
    id: 'exif-presence',
    name: 'EXIF Metadata',
    status: 'ok',
    summary: buildExifSummary(exif),
    details,
    confidence: 0.9,
    notes: 'EXIF data is present. This suggests the image may be closer to its original form, though EXIF can be modified or copied.',
  };
}

/**
 * Check for editing software in EXIF
 */
export async function checkEditingSoftware(file: ImageFile): Promise<CheckResult> {
  const exif = await extractExif(file);
  
  if (!exif?.Software) {
    return {
      id: 'editing-software',
      name: 'Editing Software Detection',
      status: 'info',
      summary: 'No software tag in metadata',
      details: {
        'Software Tag': 'Not present',
      },
      confidence: 0.6,
      notes: 'The absence of a software tag doesn\'t mean the image wasn\'t edited. Many tools don\'t add metadata, and metadata can be stripped.',
    };
  }
  
  const software = exif.Software.toLowerCase();
  const matchedEditors: string[] = [];
  
  for (const editor of EDITING_SOFTWARE) {
    if (software.includes(editor)) {
      matchedEditors.push(editor);
    }
  }
  
  if (matchedEditors.length > 0) {
    return {
      id: 'editing-software',
      name: 'Editing Software Detection',
      status: 'warn',
      summary: `Editing software detected: ${exif.Software}`,
      details: {
        'Software Tag': exif.Software,
        'Known Editors Found': matchedEditors.join(', '),
      },
      confidence: 0.7,
      notes: 'The software tag indicates this image was processed by image editing software. This doesn\'t mean malicious editing occurred—many photographers use editing software for legitimate purposes like color correction or cropping.',
    };
  }
  
  // Check for common camera software
  const cameraKeywords = ['camera', 'dcim', 'photo', 'imaging'];
  const isLikelyCamera = cameraKeywords.some(kw => software.includes(kw));
  
  return {
    id: 'editing-software',
    name: 'Editing Software Detection',
    status: 'ok',
    summary: `Software: ${exif.Software}`,
    details: {
      'Software Tag': exif.Software,
      'Type': isLikelyCamera ? 'Camera/Device Software' : 'Unknown Software',
    },
    confidence: 0.7,
    notes: isLikelyCamera 
      ? 'The software tag appears to be from a camera or device, not a known image editor.'
      : 'The software tag is present but doesn\'t match known editing software. This could be camera software, an unknown editor, or other processing software.',
  };
}

/**
 * Helper to format EXIF date
 */
function formatExifDate(date: string | Date): string {
  if (date instanceof Date) {
    return date.toLocaleString();
  }
  // EXIF dates are often in format "2023:01:15 14:30:00"
  return date.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
}

/**
 * Helper to format exposure time
 */
function formatExposure(time: number): string {
  if (time >= 1) {
    return `${time}s`;
  }
  const denominator = Math.round(1 / time);
  return `1/${denominator}s`;
}

/**
 * Build EXIF summary string
 */
function buildExifSummary(exif: ExifData): string {
  const parts: string[] = [];
  
  if (exif.Make && exif.Model) {
    parts.push(`${exif.Make} ${exif.Model}`);
  } else if (exif.Make) {
    parts.push(exif.Make);
  } else if (exif.Model) {
    parts.push(exif.Model);
  }
  
  if (exif.DateTimeOriginal || exif.DateTime) {
    const date = exif.DateTimeOriginal || exif.DateTime;
    if (date instanceof Date) {
      parts.push(date.toLocaleDateString());
    } else if (typeof date === 'string') {
      parts.push(date.split(' ')[0].replace(/:/g, '-'));
    }
  }
  
  if (parts.length === 0) {
    return 'EXIF data present';
  }
  
  return parts.join(' • ');
}

/**
 * Run all metadata checks
 */
export async function runMetadataChecks(file: ImageFile): Promise<CheckResult[]> {
  const results = await Promise.all([
    checkExifPresence(file),
    checkEditingSoftware(file),
  ]);
  
  return results;
}

