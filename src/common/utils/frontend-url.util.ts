import type { Request } from 'express';

export function extractFrontendUrl(req: Request): string {
  // Try origin header first (most reliable for CORS requests)
  if (req.headers.origin && isValidUrl(req.headers.origin)) return req.headers.origin;

  // Fallback to referer header
  if (req.headers.referer) {
    const refererUrl = new URL(req.headers.referer);
    return `${refererUrl.protocol}//${refererUrl.host}`;
  }

  // Default fallback when headers are missing (development only - should not happen in production)
  return 'http://localhost:3001';
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
