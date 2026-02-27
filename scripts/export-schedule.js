#!/usr/bin/env node

const path = require('node:path');
const {
  expandHome,
  loadJsonFile,
  normalizeSchedule,
  saveJsonFile,
} = require('./schedule-utils');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const input = getArg('--input') || '~/.config/course-table/schedule.json';
const output = getArg('--output') || './data/schedule.export.json';

const inputPath = path.resolve(expandHome(input));
const outputPath = path.resolve(expandHome(output));

const raw = loadJsonFile(inputPath);
const normalized = normalizeSchedule(raw);
saveJsonFile(outputPath, normalized);

console.log(`Exported schedule from ${inputPath}`);
console.log(`Saved to ${outputPath}`);
