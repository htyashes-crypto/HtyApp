export type DownloadStatus = "pending" | "downloading" | "paused" | "completed" | "failed" | "cancelled";

export type DownloadFilterStatus = "all" | DownloadStatus;

export type DownloadSortField = "createdAt" | "fileName" | "totalBytes" | "status";

export interface DownloadSegment {
  index: number;
  startByte: number;
  endByte: number;
  downloadedBytes: number;
}

export interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  savePath: string;
  totalBytes: number;
  downloadedBytes: number;
  status: DownloadStatus;
  segments: DownloadSegment[];
  segmentCount: number;
  speed: number;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  mimeType: string | null;
  resumable: boolean;
}

export interface DownloadProgress {
  id: string;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  segments: DownloadSegment[];
  status: DownloadStatus;
}

export interface CreateDownloadRequest {
  url: string;
  fileName?: string;
  savePath?: string;
  segmentCount?: number;
}

export interface DownloadSettings {
  defaultSaveDir: string;
  maxConcurrentDownloads: number;
  defaultSegmentCount: number;
  speedLimitKBps: number;
  autoStartDownloads: boolean;
}
