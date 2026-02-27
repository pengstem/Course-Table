#!/usr/bin/env node

const path = require('node:path');
const {
  expandHome,
  loadJsonFile,
  normalizeSchedule,
  saveJsonFile,
  validateSchedule,
} = require('./schedule-utils');

function usage() {
  console.error('Usage: node scripts/import-schedule.js --input <path> [--output <path>]');
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const input = getArg('--input');
const output = getArg('--output') || '~/.config/course-table/schedule.json';

if (!input) {
  usage();
  process.exit(1);
}

const inputPath = path.resolve(expandHome(input));
const outputPath = path.resolve(expandHome(output));

const raw = loadJsonFile(inputPath);
const normalized = normalizeSchedule(raw);
const errors = validateSchedule(normalized);

if (errors.length > 0) {
  console.error('Validation failed:');
  errors.forEach((item) => console.error(`- ${item}`));
  process.exit(2);
}

normalized.meta.updatedAt = new Date().toISOString();
saveJsonFile(outputPath, normalized);

console.log(`Imported schedule to ${outputPath}`);
console.log(`Courses: ${normalized.courses.length}`);
