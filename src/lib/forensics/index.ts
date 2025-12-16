/**
 * Forensics Library - Main exports
 */

export type {
  CheckStatus,
  CheckResult,
  Region,
  ImageFile,
  ForensicReport,
  ExifData,
} from './types';

export {
  loadImage,
  runForensicPipeline,
  runDeepCloneScan,
  exportReportJSON,
  getStatusMessage,
} from './pipeline';

export type { PipelineOptions } from './pipeline';

// Re-export individual check functions for advanced usage
export { runFileChecks } from './fileChecks';
export { runMetadataChecks, extractExif } from './metadataChecks';
export { runCompressionChecks } from './compressionChecks';
export { runPixelChecks } from './pixelChecks';
export { runELACheck, performELA } from './elaCheck';
export { runSocialMediaCheck } from './socialMediaHint';

// Utility exports
export {
  formatFileSize,
  detectFileType,
  grayscaleToHeatmap,
} from './utils';

