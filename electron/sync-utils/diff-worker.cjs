const { parentPort, workerData } = require("node:worker_threads");
const { computeDiffs } = require("./diff-engine.cjs");

const { appDataDir, request, filterOptions } = workerData;

const onProgress = (done, total) => {
  parentPort.postMessage({ type: "progress", done, total });
};

try {
  const result = computeDiffs(appDataDir, request, filterOptions, onProgress);
  parentPort.postMessage({ type: "done", result });
} catch (err) {
  parentPort.postMessage({ type: "error", message: err.message || String(err) });
}
