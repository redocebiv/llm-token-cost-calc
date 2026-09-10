/**
 * A promise-based client for the counting worker.
 *
 * The worker's URL is passed in by each page's entry module rather than built
 * here. If this module ends up in a shared bundle chunk, `import.meta.url`
 * inside it points at the chunk's folder, and a worker URL resolved from it
 * would 404 in production while working fine in development.
 */

export function createTokenClient(workerUrl) {
  const worker = new Worker(workerUrl, { type: 'module' });
  const pending = new Map();
  let sequence = 0;

  worker.addEventListener('message', ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data);
  });

  worker.addEventListener('error', (event) => {
    const error = new Error(event.message || 'the counting worker failed to start');
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });

  return {
    /** Count each named piece of text. Resolves with { counts, chars, atypical, ms }. */
    measure(parts, encodings = ['o200k_base']) {
      sequence += 1;
      const id = sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, parts, encodings });
      });
    },
  };
}
