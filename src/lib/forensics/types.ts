/**
 * Forensic check result types
 * Each check in the pipeline returns a CheckResult
 */

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  summary: string;
  details: Record<string, string | number | boolean | null>;
  confidence: number; // 0-1
  notes: string;
  overlay?: ImageData | null; // Optional heatmap/visualization
  regions?: Region[]; // Optional regions of interest
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface ImageFile {
  file: File;
  dataUrl: string;
  arrayBuffer: ArrayBuffer;
  width: number;
  height: number;
  imageData: ImageData;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface ForensicReport {
  filename: string;
  fileSize: number;
  dimensions: { width: number; height: number };
  mimeType: string;
  timestamp: string;
  checks: CheckResult[];
  overallStatus: 'clean' | 'review' | 'suspicious';
  summary: {
    okCount: number;
    warnCount: number;
    failCount: number;
    infoCount: number;
  };
}

export interface ExifData {
  Make?: string;
  Model?: string;
  Software?: string;
  DateTime?: string;
  DateTimeOriginal?: string;
  GPSLatitude?: number;
  GPSLongitude?: number;
  ExposureTime?: number;
  FNumber?: number;
  ISO?: number;
  [key: string]: unknown;
}

// Magic bytes for file type detection
export const FILE_SIGNATURES: Record<string, { bytes: number[]; offset?: number }> = {
  'image/jpeg': { bytes: [0xFF, 0xD8, 0xFF] },
  'image/png': { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  'image/gif': { bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  'image/webp': { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF, need to check WEBP at offset 8
};

// Known editing software signatures
export const EDITING_SOFTWARE = [
  'photoshop',
  'adobe',
  'gimp',
  'snapseed',
  'lightroom',
  'capture one',
  'affinity',
  'pixelmator',
  'paint.net',
  'corel',
  'photoscape',
  'fotor',
  'picasa',
  'instagram',
  'vsco',
  'facetune',
  'meitu',
  'beautycam',
  'snow',
  'b612',
  'remini',
  'faceapp',
  'airbrush',
];

// Common social media dimension patterns
export const SOCIAL_MEDIA_DIMENSIONS = [
  { width: 2048, platform: 'Facebook/Instagram' },
  { width: 1080, platform: 'Instagram' },
  { width: 1200, platform: 'Twitter' },
  { width: 1280, platform: 'Twitter/Telegram' },
  { width: 1600, platform: 'Various' },
  { width: 4096, platform: 'Twitter 4K' },
];

