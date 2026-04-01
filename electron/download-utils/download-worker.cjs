const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const MAX_REDIRECTS = 5;
const PROGRESS_INTERVAL = 500;
const SPEED_WINDOW = 3000;

class DownloadWorker {
  constructor({ item, onProgress, onComplete, onError }) {
    this.item = item;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onError = onError;

    this._requests = [];
    this._streams = [];
    this._stopped = false;
    this._progressTimer = null;
    this._speedSamples = [];
    this._segmentBytes = new Array(item.segments.length).fill(0);

    for (let i = 0; i < item.segments.length; i++) {
      this._segmentBytes[i] = item.segments[i].downloadedBytes || 0;
    }
  }

  start() {
    this._stopped = false;
    this._startProgressTimer();

    if (this.item.segments.length === 0 || (this.item.segments.length === 1 && !this.item.resumable)) {
      this._downloadSingle();
    } else {
      this._downloadSegments();
    }
  }

  pause() {
    this._stopped = true;
    this._stopProgressTimer();
    for (const req of this._requests) {
      try { req.destroy(); } catch {}
    }
    for (const stream of this._streams) {
      try { stream.close(); } catch {}
    }
    this._requests = [];
    this._streams = [];
  }

  cancel() {
    this.pause();
    this._cleanupTempFiles();
  }

  _startProgressTimer() {
    this._progressTimer = setInterval(() => {
      if (this._stopped) return;
      const totalDownloaded = this._segmentBytes.reduce((a, b) => a + b, 0);
      const speed = this._calculateSpeed();
      const segments = this.item.segments.map((seg, i) => ({
        ...seg,
        downloadedBytes: this._segmentBytes[i]
      }));
      this.onProgress({
        id: this.item.id,
        downloadedBytes: totalDownloaded,
        totalBytes: this.item.totalBytes,
        speed,
        segments,
        status: "downloading"
      });
    }, PROGRESS_INTERVAL);
  }

  _stopProgressTimer() {
    if (this._progressTimer) {
      clearInterval(this._progressTimer);
      this._progressTimer = null;
    }
  }

  _calculateSpeed() {
    const now = Date.now();
    const totalDownloaded = this._segmentBytes.reduce((a, b) => a + b, 0);
    this._speedSamples.push({ time: now, bytes: totalDownloaded });

    while (this._speedSamples.length > 0 && now - this._speedSamples[0].time > SPEED_WINDOW) {
      this._speedSamples.shift();
    }

    if (this._speedSamples.length < 2) return 0;
    const first = this._speedSamples[0];
    const last = this._speedSamples[this._speedSamples.length - 1];
    const elapsed = (last.time - first.time) / 1000;
    if (elapsed <= 0) return 0;
    return Math.round((last.bytes - first.bytes) / elapsed);
  }

  _downloadSingle() {
    const partPath = this.item.savePath + ".part0";
    const startByte = this._segmentBytes[0] || 0;
    const flags = startByte > 0 ? "a" : "w";

    const fileStream = fs.createWriteStream(partPath, { flags });
    this._streams.push(fileStream);

    const headers = {};
    if (startByte > 0 && this.item.resumable) {
      headers["Range"] = `bytes=${startByte}-`;
    }

    this._httpGet(this.item.url, headers, 0, (err, res) => {
      if (err) return this._handleError(err);

      res.on("data", (chunk) => {
        if (this._stopped) return;
        this._segmentBytes[0] += chunk.length;
        fileStream.write(chunk);
      });

      res.on("end", () => {
        if (this._stopped) return;
        fileStream.end(() => {
          this._mergeAndFinish();
        });
      });

      res.on("error", (e) => this._handleError(e));
    });
  }

  _downloadSegments() {
    let completedCount = 0;
    const totalSegments = this.item.segments.length;

    for (let i = 0; i < totalSegments; i++) {
      const seg = this.item.segments[i];
      const alreadyDownloaded = this._segmentBytes[i] || 0;
      const segmentSize = seg.endByte - seg.startByte + 1;

      if (alreadyDownloaded >= segmentSize) {
        completedCount++;
        if (completedCount === totalSegments) {
          this._mergeAndFinish();
        }
        continue;
      }

      const partPath = this.item.savePath + `.part${i}`;
      const flags = alreadyDownloaded > 0 ? "a" : "w";
      const fileStream = fs.createWriteStream(partPath, { flags });
      this._streams.push(fileStream);

      const rangeStart = seg.startByte + alreadyDownloaded;
      const rangeEnd = seg.endByte;
      const headers = { Range: `bytes=${rangeStart}-${rangeEnd}` };

      this._httpGet(this.item.url, headers, 0, (err, res) => {
        if (err) return this._handleError(err);

        res.on("data", (chunk) => {
          if (this._stopped) return;
          this._segmentBytes[i] += chunk.length;
          fileStream.write(chunk);
        });

        res.on("end", () => {
          if (this._stopped) return;
          fileStream.end(() => {
            completedCount++;
            if (completedCount === totalSegments) {
              this._mergeAndFinish();
            }
          });
        });

        res.on("error", (e) => this._handleError(e));
      });
    }
  }

  _httpGet(url, headers, redirectCount, callback) {
    if (redirectCount > MAX_REDIRECTS) {
      return callback(new Error("too many redirects"));
    }

    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;

    const req = client.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: {
          "User-Agent": "HtyApp-Downloader/1.0",
          ...headers
        }
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const location = res.headers.location;
          if (!location) return callback(new Error(`redirect without location header`));
          const redirectUrl = new URL(location, url).href;
          res.resume();
          return this._httpGet(redirectUrl, headers, redirectCount + 1, callback);
        }

        if (res.statusCode >= 400) {
          res.resume();
          return callback(new Error(`HTTP ${res.statusCode}`));
        }

        callback(null, res);
      }
    );

    req.on("error", (e) => callback(e));
    this._requests.push(req);
  }

  _mergeAndFinish() {
    this._stopProgressTimer();
    const segments = this.item.segments;

    if (segments.length === 1) {
      const partPath = this.item.savePath + ".part0";
      try {
        fs.renameSync(partPath, this.item.savePath);
      } catch {
        try { fs.copyFileSync(partPath, this.item.savePath); fs.unlinkSync(partPath); } catch {}
      }
      return this._finish();
    }

    try {
      const output = fs.createWriteStream(this.item.savePath);
      let i = 0;

      const writeNext = () => {
        if (i >= segments.length) {
          output.end(() => {
            this._cleanupTempFiles();
            this._finish();
          });
          return;
        }

        const partPath = this.item.savePath + `.part${i}`;
        const input = fs.createReadStream(partPath);
        input.on("end", () => {
          i++;
          writeNext();
        });
        input.on("error", (e) => this._handleError(e));
        input.pipe(output, { end: false });
      };

      writeNext();
    } catch (e) {
      this._handleError(e);
    }
  }

  _finish() {
    const totalDownloaded = this._segmentBytes.reduce((a, b) => a + b, 0);
    const segments = this.item.segments.map((seg, i) => ({
      ...seg,
      downloadedBytes: this._segmentBytes[i]
    }));
    this.onComplete({
      id: this.item.id,
      downloadedBytes: totalDownloaded,
      totalBytes: this.item.totalBytes,
      speed: 0,
      segments,
      status: "completed"
    });
  }

  _handleError(err) {
    if (this._stopped) return;
    this._stopped = true;
    this._stopProgressTimer();
    for (const req of this._requests) {
      try { req.destroy(); } catch {}
    }
    for (const stream of this._streams) {
      try { stream.close(); } catch {}
    }
    this.onError(this.item.id, err.message || String(err));
  }

  _cleanupTempFiles() {
    for (let i = 0; i < this.item.segments.length; i++) {
      const partPath = this.item.savePath + `.part${i}`;
      try { fs.unlinkSync(partPath); } catch {}
    }
  }

  getSegmentBytes() {
    return [...this._segmentBytes];
  }
}

// ── Probe utility ──

function probeUrl(url, callback, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    return callback(new Error("too many redirects"));
  }

  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;

  const req = client.request(
    {
      method: "HEAD",
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      headers: { "User-Agent": "HtyApp-Downloader/1.0" }
    },
    (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        if (!location) return callback(new Error("redirect without location"));
        const redirectUrl = new URL(location, url).href;
        res.resume();
        return probeUrl(redirectUrl, callback, redirectCount + 1);
      }

      res.resume();

      const contentLength = parseInt(res.headers["content-length"] || "-1", 10);
      const acceptRanges = (res.headers["accept-ranges"] || "").toLowerCase() === "bytes";
      const contentDisposition = res.headers["content-disposition"] || "";
      const mimeType = (res.headers["content-type"] || "").split(";")[0].trim() || null;

      let fileName = null;
      const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
      if (match) {
        fileName = decodeURIComponent(match[1].replace(/"/g, "").trim());
      }

      if (!fileName) {
        const urlPath = parsed.pathname;
        const segments = urlPath.split("/").filter(Boolean);
        if (segments.length > 0) {
          fileName = decodeURIComponent(segments[segments.length - 1]);
        }
      }

      callback(null, {
        totalBytes: contentLength,
        resumable: acceptRanges && contentLength > 0,
        fileName: fileName || "download",
        mimeType,
        finalUrl: url
      });
    }
  );

  req.on("error", (e) => callback(e));
  req.end();
}

function probeUrlAsync(url) {
  return new Promise((resolve, reject) => {
    probeUrl(url, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

module.exports = { DownloadWorker, probeUrlAsync };
