import { spawnSync } from 'child_process';
import { join } from 'path';
import fs from 'fs'; // Add this import for directory creation

const outputDir = join(process.cwd(), 'src', 'generated');

// Create the output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const binPath = join(process.cwd(), 'node_modules', '.bin');
const pluginExe = process.platform === 'win32' ? 'protoc-gen-ts_proto.cmd' : 'protoc-gen-ts_proto';
const pluginPath = join(binPath, pluginExe);

const protocArgs = [
  `--plugin=protoc-gen-ts_proto=${pluginPath}`,
  '--ts_proto_out=./src/generated',
  '--ts_proto_opt=outputServices=nice-grpc,outputServices=generic-definitions,outputClientImpl=false,outputJsonMethods=false,useExactTypes=false,useAbortSignal=true',
  './proto/*.proto'
];

const result = spawnSync('protoc', protocArgs, { stdio: 'inherit', shell: true });

if (result.status !== 0) {
  process.exit(result.status || 1);
}