/**
 * Forensic Analysis Pipeline
 * Orchestrates all checks and produces the final report
 */

import type { CheckResult, ImageFile, ForensicReport, ExifData } from './types';
import { runFileChecks } from './fileChecks';
import { runMetadataChecks, extractExif } from './metadataChecks';
import { runCompressionChecks, checkJpegQuality } from './compressionChecks';
import { runPixelChecks } from './pixelChecks';
import { runELACheck } from './elaCheck';
import { runSocialMediaCheck } from './socialMediaHint';
import { createCanvasFromFile, detectFileType } from './utils';

export interface PipelineOptions {
  deepCloneScan?: boolean;
  onProgress?: (stage: string, progress: number) => void;
}

/**
 * Load an image file and prepare it for analysis
 */
export async function loadImage(file: File): Promise<ImageFile> {
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    throw new Error('Unsupported file format. Please use JPG, PNG, GIF, or WebP.');
  }
  
  // Read file as ArrayBuffer for magic byte detection
  const arrayBuffer = await file.arrayBuffer();
  
  // Verify magic bytes
  const detectedType = detectFileType(arrayBuffer);
  if (!detectedType) {
    throw new Error('Could not verify file type. The file may be corrupted or in an unsupported format.');
  }
  
  // Create canvas and extract image data
  const canvasData = await createCanvasFromFile(file);
  
  return {
    file,
    dataUrl: canvasData.dataUrl,
    arrayBuffer,
    width: canvasData.width,
    height: canvasData.height,
    imageData: canvasData.imageData,
    canvas: canvasData.canvas,
    ctx: canvasData.ctx,
  };
}

/**
 * Run the full forensic analysis pipeline
 */
export async function runForensicPipeline(
  imageFile: ImageFile,
  options: PipelineOptions = {}
): Promise<ForensicReport> {
  const { deepCloneScan = false, onProgress } = options;
  const allChecks: CheckResult[] = [];
  
  // Stage 1: File checks (synchronous)
  onProgress?.('Analyzing file structure...', 10);
  const fileResults = runFileChecks(imageFile);
  allChecks.push(...fileResults);
  
  // Stage 2: Metadata checks (async)
  onProgress?.('Extracting metadata...', 25);
  const metadataResults = await runMetadataChecks(imageFile);
  allChecks.push(...metadataResults);
  
  // Extract EXIF for social media check
  const exifData = await extractExif(imageFile);
  
  // Stage 3: Compression checks
  onProgress?.('Analyzing compression...', 40);
  const compressionResults = runCompressionChecks(imageFile);
  allChecks.push(...compressionResults);
  
  // Get JPEG quality for social media hint
  const jpegQualityResult = compressionResults.find(r => r.id === 'jpeg-quality');
  const jpegQuality = jpegQualityResult?.details['Quality Estimate'] 
    ? parseInt(jpegQualityResult.details['Quality Estimate'] as string) 
    : null;
  
  // Stage 4: Pixel-level checks
  onProgress?.('Analyzing pixel consistency...', 55);
  const pixelResults = runPixelChecks(imageFile, deepCloneScan);
  allChecks.push(...pixelResults);
  
  // Stage 5: ELA (async)
  onProgress?.('Performing Error Level Analysis...', 75);
  const elaResults = await runELACheck(imageFile);
  allChecks.push(...elaResults);
  
  // Stage 6: Social media detection
  onProgress?.('Checking for social media patterns...', 90);
  const socialResults = runSocialMediaCheck(imageFile, exifData, jpegQuality);
  allChecks.push(...socialResults);
  
  // Calculate summary
  const summary = {
    okCount: allChecks.filter(c => c.status === 'ok').length,
    warnCount: allChecks.filter(c => c.status === 'warn').length,
    failCount: allChecks.filter(c => c.status === 'fail').length,
    infoCount: allChecks.filter(c => c.status === 'info').length,
  };
  
  // Determine overall status
  let overallStatus: ForensicReport['overallStatus'] = 'clean';
  
  if (summary.failCount > 0 || summary.warnCount >= 3) {
    overallStatus = 'suspicious';
  } else if (summary.warnCount > 0) {
    overallStatus = 'review';
  }
  
  onProgress?.('Analysis complete', 100);
  
  return {
    filename: imageFile.file.name,
    fileSize: imageFile.file.size,
    dimensions: {
      width: imageFile.width,
      height: imageFile.height,
    },
    mimeType: imageFile.file.type || detectFileType(imageFile.arrayBuffer) || 'unknown',
    timestamp: new Date().toISOString(),
    checks: allChecks,
    overallStatus,
    summary,
  };
}

/**
 * Run deep clone scan separately (can be triggered by user)
 */
export function runDeepCloneScan(imageFile: ImageFile): CheckResult {
  const pixelChecks = runPixelChecks(imageFile, true);
  return pixelChecks.find(c => c.id === 'clone-detection')!;
}

/**
 * Export report as JSON
 */
export function exportReportJSON(report: ForensicReport): string {
  // Remove ImageData overlays from export (they're huge)
  const exportable = {
    ...report,
    checks: report.checks.map(check => ({
      ...check,
      overlay: check.overlay ? '[ImageData - not exported]' : undefined,
    })),
  };
  
  return JSON.stringify(exportable, null, 2);
}

/**
 * Get overall status message
 */
export function getStatusMessage(status: ForensicReport['overallStatus']): string {
  switch (status) {
    case 'clean':
      return 'No strong signs of editing';
    case 'review':
      return 'Some signals worth reviewing';
    case 'suspicious':
      return 'Multiple anomalies detected';
  }
}

