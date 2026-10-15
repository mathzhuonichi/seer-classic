export interface DecodedSkillFrame {
  image: ImageBitmap;
  close: () => void;
}

/** A bounded source-frame window. Superseded asynchronous decodes are closed. */
export class SkillFrameBuffer {
  private readonly ready = new Map<number, DecodedSkillFrame>();
  private readonly pending = new Map<number, AbortController>();
  private wanted = new Set<number>();
  private frame = 0;
  private disposed = false;

  constructor(private readonly options: {
    frames: number;
    load: (frame: number, signal: AbortSignal) => Promise<DecodedSkillFrame>;
    clear: () => void;
    draw: (frame: number, bitmap: DecodedSkillFrame) => void;
    onError: () => void;
  }) {}

  seek(frame: number) {
    if (this.disposed) return;
    this.frame = Math.max(0, Math.min(this.options.frames - 1, frame));
    this.wanted = new Set(Array.from({ length: 3 }, (_, offset) => this.frame + offset)
      .filter(index => index < this.options.frames));
    for (const [index, bitmap] of this.ready) {
      if (!this.wanted.has(index)) {
        bitmap.close();
        this.ready.delete(index);
      }
    }
    for (const [index, controller] of this.pending) {
      if (!this.wanted.has(index)) controller.abort();
    }
    this.options.clear();
    const current = this.ready.get(this.frame);
    if (current) this.options.draw(this.frame, current);
    this.pump();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.pending.values()) controller.abort();
    for (const bitmap of this.ready.values()) bitmap.close();
    this.ready.clear();
    this.wanted.clear();
    this.options.clear();
    // In-flight decodes continue to occupy their slots until they settle. Their
    // completion handlers close the result instead of retaining or drawing it.
  }

  private pump() {
    if (this.disposed) return;
    for (const frame of this.wanted) {
      if (this.ready.size + this.pending.size >= 3) break;
      if (this.ready.has(frame) || this.pending.has(frame)) continue;
      const controller = new AbortController();
      this.pending.set(frame, controller);
      Promise.resolve().then(() => this.options.load(frame, controller.signal)).then(bitmap => {
        this.pending.delete(frame);
        if (this.disposed || controller.signal.aborted || !this.wanted.has(frame)) {
          bitmap.close();
        } else {
          this.ready.set(frame, bitmap);
          if (frame === this.frame) this.options.draw(frame, bitmap);
        }
        this.pump();
      }).catch(() => {
        this.pending.delete(frame);
        if (this.disposed) return;
        if (controller.signal.aborted) {
          this.pump();
          return;
        }
        this.dispose();
        this.options.onError();
      });
    }
  }
}

const compressedFrames = new Map<string, Blob>();
const compressedBudget = 16 * 1024 * 1024;
let compressedBytes = 0;
let decodedSlots = 0;
const decodeQueue: Array<() => void> = [];

// Slots include both pending decodes and live bitmaps across component instances.
// A move change cannot briefly double the decoded pixel budget.
function acquireDecodeSlot(signal: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const index = decodeQueue.indexOf(start);
      if (index >= 0) decodeQueue.splice(index, 1);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const start = () => {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) {
        cancel();
        return;
      }
      decodedSlots++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        decodedSlots--;
        while (decodedSlots < 3 && decodeQueue.length) decodeQueue.shift()?.();
      });
    };
    if (signal.aborted) cancel();
    else if (decodedSlots < 3) start();
    else {
      decodeQueue.push(start);
      signal.addEventListener('abort', cancel, { once: true });
    }
  });
}

/** Only compressed source bytes are shared between moves; decoded frames are not. */
export async function loadSkillFrame(url: string, signal: AbortSignal): Promise<DecodedSkillFrame> {
  let blob = compressedFrames.get(url);
  if (blob) {
    compressedFrames.delete(url);
    compressedFrames.set(url, blob);
  } else {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Original skill frame failed: ${response.status}`);
    blob = await response.blob();
    signal.throwIfAborted();
    if (blob.size <= compressedBudget) {
      const previous = compressedFrames.get(url);
      if (previous) {
        compressedBytes -= previous.size;
        compressedFrames.delete(url);
      }
      compressedFrames.set(url, blob);
      compressedBytes += blob.size;
      while (compressedBytes > compressedBudget) {
        const first = compressedFrames.entries().next().value;
        if (!first) break;
        compressedFrames.delete(first[0]);
        compressedBytes -= first[1].size;
      }
    }
  }
  signal.throwIfAborted();
  const release = await acquireDecodeSlot(signal);
  try {
    signal.throwIfAborted();
    const image = await createImageBitmap(blob);
    if (signal.aborted) {
      image.close();
      signal.throwIfAborted();
    }
    let closed = false;
    return { image, close: () => {
      if (closed) return;
      closed = true;
      image.close();
      release();
    } };
  } catch (error) {
    release();
    throw error;
  }
}
