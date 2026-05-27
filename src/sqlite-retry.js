const DEFAULT_CHUNK_SIZE = 64 * 1024;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 20;

export function runWithSqliteRetry(operation, options = {}) {
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs || DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep || sleepSync;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt === maxAttempts) {
        throw error;
      }
      lastError = error;
      sleep(baseDelayMs * attempt);
    }
  }

  throw lastError;
}

export function chunkContent(content, chunkSize = DEFAULT_CHUNK_SIZE) {
  const text = String(content);
  if (!text) {
    return [""];
  }

  const chunks = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks;
}

function isSqliteBusyError(error) {
  return error?.code === "SQLITE_BUSY" || error?.code === "SQLITE_LOCKED" || /database is locked|database is busy/i.test(error?.message || "");
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}
