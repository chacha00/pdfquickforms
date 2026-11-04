/**
 * Free-tool limits. These protect the visitor's own device (browser memory) —
 * files are processed locally, so they are not a cost or security boundary.
 * There are no paid plans and no subscriptions.
 */
const MB = 1024 * 1024;

export interface FileLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
}

export const LIMITS = {
  pdf: { maxFileBytes: 100 * MB, maxTotalBytes: 100 * MB, maxFiles: 1 } satisfies FileLimits,
  image: { maxFileBytes: 10 * MB, maxTotalBytes: 10 * MB, maxFiles: 1 } satisfies FileLimits,
  maxPages: 500,
  maxElements: 2000,
};
