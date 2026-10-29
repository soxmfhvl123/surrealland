/**
 * SAM 2.1 (hiera tiny) in the browser through transformers.js, for 자동 누끼. The photo is
 * encoded once; after that any number of point prompts decode in batches, each giving three
 * candidate masks (part / object / whole) with the model's own quality score.
 *
 * The weights (~80MB on WebGPU, ~60MB on the CPU path) come from the Hugging Face hub on
 * first use and stay in the browser cache.
 */

type TF = typeof import('@huggingface/transformers');

const MODEL = 'onnx-community/sam2.1-hiera-tiny-ONNX';

interface Loaded {
  tf: TF;
  // the model and processor classes are loosely typed in transformers.js
  model: any;
  processor: any;
}

let loading: Promise<Loaded> | null = null;
let onLoadProgress: ((frac: number) => void) | null = null;

export function loadSam(onProgress?: (frac: number) => void): Promise<Loaded> {
  onLoadProgress = onProgress ?? null;
  if (!loading) {
    loading = (async () => {
      const tf = await import('@huggingface/transformers');
      const gpu = 'gpu' in navigator ? await (navigator as any).gpu.requestAdapter().catch(() => null) : null;
      const device = gpu ? 'webgpu' : 'wasm';
      // fp16 halves the download on GPUs that can do half floats; the CPU path uses 8-bit weights
      const dtype = !gpu ? 'q8' : gpu.features?.has('shader-f16') ? 'fp16' : 'fp32';
      // on the GPU the image embeddings stay there between prompts: ~16ms a prompt instead of ~55ms
      const session_options = gpu
        ? { preferredOutputLocation: Object.fromEntries([0, 1, 2].map((i) => [`image_embeddings.${i}`, 'gpu-buffer'])) }
        : undefined;
      const files = new Map<string, [number, number]>();
      const progress_callback = (e: any) => {
        if (e.status !== 'progress' || !e.total) return;
        files.set(e.file, [e.loaded, e.total]);
        let done = 0;
        let total = 0;
        for (const [a, b] of files.values()) {
          done += a;
          total += b;
        }
        onLoadProgress?.(done / total);
      };
      const [model, processor] = await Promise.all([
        tf.Sam2Model.from_pretrained(MODEL, { device, dtype, session_options, progress_callback } as any),
        tf.AutoProcessor.from_pretrained(MODEL),
      ]);
      return { tf, model, processor };
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

export interface SamMasks {
  /** predicted IoU of each of the three masks */
  iou: Float32Array;
  /** 3 × 256 × 256 mask logits over the whole (squashed) image */
  logits: Float32Array;
  /** below 0 the model sees no object there */
  objectness: number;
}

export const SAM_MASK = 256;

/** Encode `image` once; the returned `decode` prompts it with one normalized point at a time
 * (the exported decoder takes a single prompt per run). */
export async function samSession(image: HTMLCanvasElement) {
  const { tf, model, processor } = await loadSam();
  const inputs = await processor(tf.RawImage.fromCanvas(image));
  const embeddings = await model.get_image_embeddings(inputs);
  const [rh, rw] = inputs.reshaped_input_sizes[0] as [number, number];
  const decode = async (x: number, y: number): Promise<SamMasks> => {
    const out = await model({
      ...embeddings,
      input_points: new tf.Tensor('float32', Float32Array.of(x * rw, y * rh), [1, 1, 1, 2]),
      input_labels: new tf.Tensor('int64', BigInt64Array.of(1n), [1, 1, 1]),
    });
    return { iou: out.iou_scores.data, logits: out.pred_masks.data, objectness: out.object_score_logits.data[0] };
  };
  const release = () => Object.values(embeddings).forEach((t: any) => t.dispose?.());
  return { decode, release };
}
