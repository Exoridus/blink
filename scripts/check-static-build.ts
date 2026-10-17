import { checkStaticBuild } from './lib/staticBuild.ts';

const [root, base] = process.argv.slice(2);
if (!root || !base) throw new Error('Usage: node scripts/check-static-build.ts <directory> <base>');
console.log(JSON.stringify(checkStaticBuild(root, base)));
