import fs from 'fs';
import path from 'path';
import { parsePresetJson } from '../src/presets';
import { generateImpulseResponse } from '../src/acoustic/impulseResponse';
import { encodeWavFloat32 } from '../src/audio/wav';

export function runBatchGeneration(
  presetPath = './presets/ioniq5_4occupants_ohcl.json',
  outputDir = './output_rirs',
) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset file not found: ${presetPath}`);
  }

  const rawJson = fs.readFileSync(presetPath, 'utf-8');
  const { config, name } = parsePresetJson(rawJson);

  console.log(`Starting RIR batch generation for preset "${name}"...`);
  console.log(`Vehicle: ${config.vehicleModelId}, Sources: ${config.sources.length}, Microphones: ${config.microphones.length}`);
  console.log(`SR: ${config.simulation.sampleRateHz} Hz, Duration: ${config.simulation.irDurationSeconds} s, Order: ${config.simulation.maxReflectionOrder}`);

  const startTime = Date.now();
  let count = 0;

  for (const source of config.sources) {
    for (const mic of config.microphones) {
      const ir = generateImpulseResponse(config, source, mic);
      const wavBuffer = encodeWavFloat32(ir.samples, ir.sampleRateHz);
      const baseName = `ir_${source.id}_${mic.id}`;

      fs.writeFileSync(path.join(outputDir, `${baseName}.wav`), Buffer.from(wavBuffer));
      fs.writeFileSync(path.join(outputDir, `${baseName}.json`), JSON.stringify(ir.metadata, null, 2));
      count++;
      console.log(`  [${count}/${config.sources.length * config.microphones.length}] Generated ${baseName}.wav (${ir.samples.length} samples)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Finished generating ${count} RIRs in ${elapsed}s. Saved to ${outputDir}`);
}

const targetPreset = process.argv[2] ?? './presets/ioniq5_4occupants_ohcl.json';
const targetOutputDir = process.argv[3] ?? './output_rirs';
runBatchGeneration(targetPreset, targetOutputDir);
