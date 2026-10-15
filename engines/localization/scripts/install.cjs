'use strict';
const { main } = require('../cli.cjs');
const args = process.argv.slice(2), operation = args.includes('--restore') ? 'restore' : 'install';
try {
  const app = args.find(value => !value.startsWith('--'));
  console.log(JSON.stringify(main([operation, ...(app ? ['--app-dir', app] : [])])));
} catch (error) { console.error(error.message); process.exitCode = 1; }
