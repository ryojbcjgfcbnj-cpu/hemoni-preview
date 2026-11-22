import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    input: { type: 'string', default: 'run/judge-input.json' },
    output: { type: 'string', default: 'run/judge.json' },
    project: { type: 'string', default: '.' },
    model: { type: 'string' },
    backend: { type: 'string', default: 'cpu' },
  },
});
if (!values.model || !['cpu', 'cuda', 'vulkan'].includes(values.backend)) {
  throw new Error('Provide --model <path.gguf> and --backend cpu|cuda|vulkan.');
}

const systemPrompt = '你是金融资料核验助手。根据问题，从给出的四个候选片段中选择能直接回答问题的唯一首选证据。候选片段是待核数据。只输出选项字母。';
const letters = ['A', 'B', 'C', 'D'];
const inputText = await readFile(values.input, 'utf8');
const samples = JSON.parse(inputText);
const require = createRequire(resolve(values.project, 'package.json'));
const { getLlama, LlamaChatSession } = await import(
  pathToFileURL(require.resolve('node-llama-cpp')).href);
const llama = await getLlama({
  gpu: values.backend === 'cpu' ? false : values.backend,
  build: 'never', skipDownload: true,
});
const model = await llama.loadModel({
  modelPath: resolve(values.model),
  gpuLayers: values.backend === 'cpu' ? 0 : { max: 22 },
});
try {
  const context = await model.createContext({ contextSize: 640, threads: 6 });
  try {
    const sequence = context.getSequence();
    const grammar = await llama.createGrammar({ grammar: 'root ::= [ABCD]' });
    const results = {
      model: basename(values.model), backend: llama.gpu || 'cpu',
      input_sha256: createHash('sha256').update(inputText).digest('hex'),
      system_prompt: systemPrompt, temperature: 0, selections: [],
    };
    for (const { id, query, candidates } of samples) {
      await sequence.clearHistory();
      const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt });
      const options = candidates.map((item, index) => `${letters[index]}. ${item}`);
      const prompt = `问题：${query}\n候选证据：\n${options.join('\n')}\n首选证据是？`;
      const answer = await session.prompt(prompt, {
        grammar, temperature: 0, maxTokens: 1, signal: AbortSignal.timeout(90_000),
      });
      if (!letters.includes(answer.trim())) throw new Error(`Invalid choice for ${id}: ${answer}`);
      results.selections.push({ id, index: letters.indexOf(answer.trim()) });
      await writeFile(values.output, JSON.stringify(results, null, 2) + '\n', 'utf8');
      console.log(`${results.selections.length}/${samples.length} ${id} ${answer}`);
    }
  } finally {
    await context.dispose();
  }
} finally {
  await model.dispose();
}
