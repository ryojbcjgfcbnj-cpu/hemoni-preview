import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    input: { type: 'string', default: 'run/embed-input.json' },
    output: { type: 'string', default: 'run/embeddings.json' },
    project: { type: 'string', default: '.' },
    model: { type: 'string' },
    backend: { type: 'string', default: 'cpu' },
  },
});
if (!values.model || !['cpu', 'cuda', 'vulkan'].includes(values.backend)) {
  throw new Error('Provide --model <path.gguf> and --backend cpu|cuda|vulkan.');
}
const input = await readFile(values.input, 'utf8');
const samples = JSON.parse(input);
const require = createRequire(resolve(values.project, 'package.json'));
const { getLlama } = await import(pathToFileURL(require.resolve('node-llama-cpp')).href);
const llama = await getLlama({
  gpu: values.backend === 'cpu' ? false : values.backend, build: 'never', skipDownload: true,
});
const model = await llama.loadModel({
  modelPath: resolve(values.model), gpuLayers: values.backend === 'cpu' ? 0 : { max: 22 },
});
try {
  const embedding = await model.createEmbeddingContext({ contextSize: 512, threads: 6 });
  try {
    const pairs = {};
    const template = '核对待回答问题与候选金融证据之间的关系。\n问题：{query}\n证据：{evidence}\n相关性：';
    for (const [offset, { id, query, candidates }] of samples.entries()) {
      const rows = [];
      for (const evidence of candidates) {
        const prompt = template.replace('{query}', query).replace('{evidence}', evidence);
        const { vector } = await embedding.getEmbeddingFor(prompt);
        if (!vector.length || !vector.every(Number.isFinite) || !vector.some(Boolean)) {
          throw new Error(`Invalid embedding for ${id}`);
        }
        rows.push(vector.map(value => Number(value.toFixed(7))));
      }
      pairs[id] = rows;
      if ((offset + 1) % 10 === 0 || offset + 1 === samples.length) {
        console.log(`${offset + 1}/${samples.length}`);
      }
    }
    await writeFile(values.output, JSON.stringify({
      model: basename(values.model), backend: llama.gpu || 'cpu', template,
      input_sha256: createHash('sha256').update(input).digest('hex'), pairs,
    }) + '\n', 'utf8');
  } finally {
    await embedding.dispose();
  }
} finally {
  await model.dispose();
}
