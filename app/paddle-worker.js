// Osobny wątek odczytu: sieć neuronowa i obróbka zdjęcia nie blokują strony (przyciski, podgląd aparatu).
self.PADDLE_BASE = new URL("./", self.location.href).href;
importScripts("paddle-core.js");
const cancelled = new Set();
self.onmessage = async ({ data: m }) => {
  if (m.type === "cancel") { cancelled.add(m.req); return; }
  const isCancelled = () => cancelled.has(m.req);
  PaddleCore.setProgress((p) => self.postMessage({ req: m.req, progress: p }));
  try {
    const result = m.type === "init" ? await PaddleCore.init()
      : m.type === "read" ? await PaddleCore.read(m.file, m.id, isCancelled)
      : await PaddleCore.reread(m.file, m.id, m.deg, m.variant, isCancelled);
    self.postMessage({ req: m.req, result: isCancelled() ? null : result });
  } catch (e) {
    self.postMessage({ req: m.req, error: String((e && e.message) || e) });
  }
  cancelled.delete(m.req);
};
