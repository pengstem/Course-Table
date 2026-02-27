#!/usr/bin/env node

const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {
  expandHome,
  normalizeSchedule,
  saveJsonFile,
  validateSchedule,
} = require('./schedule-utils');

const WEEKDAY_MAP = new Map([
  ['mon', 1], ['monday', 1], ['zhouyi', 1], ['week1', 1], ['周一', 1],
  ['tue', 2], ['tuesday', 2], ['zhouer', 2], ['week2', 2], ['周二', 2],
  ['wed', 3], ['wednesday', 3], ['zhousan', 3], ['week3', 3], ['周三', 3],
  ['thu', 4], ['thursday', 4], ['zhousi', 4], ['week4', 4], ['周四', 4],
  ['fri', 5], ['friday', 5], ['zhouwu', 5], ['week5', 5], ['周五', 5],
  ['sat', 6], ['saturday', 6], ['zhouliu', 6], ['week6', 6], ['周六', 6],
  ['sun', 7], ['sunday', 7], ['zhouri', 7], ['week7', 7], ['周日', 7], ['周天', 7],
]);

function usage() {
  console.error('Usage: node scripts/import-from-screenshot.js --image <img> [--output <path>] [--term <name>]');
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function parseIntList(value) {
  if (!value) return [];
  return value
    .split(/[，,\s]+/)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function normalizeForMatch(line) {
  return line.toLowerCase().replace(/[（）()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectWeekday(line) {
  const normalized = normalizeForMatch(line);
  for (const [key, value] of WEEKDAY_MAP.entries()) {
    if (normalized.includes(key)) return value;
  }
  return null;
}

function removeWeekdayToken(line) {
  return line
    .replace(/周[一二三四五六日天]/g, ' ')
    .replace(/星期[一二三四五六日天]/g, ' ')
    .replace(/\b(Mon(day)?|Tue(sday)?|Wed(nesday)?|Thu(rsday)?|Fri(day)?|Sat(urday)?|Sun(day)?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePeriods(line) {
  const m = line.match(/(\d{1,2})\s*[-~—–]\s*(\d{1,2})\s*(节)?/);
  if (!m) return null;
  const start = Number.parseInt(m[1], 10);
  const end = Number.parseInt(m[2], 10);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
  return {start, end};
}

function parseWeeksRule(line) {
  const range = line.match(/(\d{1,2})\s*[-~—–]\s*(\d{1,2})\s*周/);
  const startWeek = range ? Number.parseInt(range[1], 10) : 1;
  const endWeek = range ? Number.parseInt(range[2], 10) : 18;

  let parity = 'all';
  if (line.includes('单周')) parity = 'odd';
  if (line.includes('双周')) parity = 'even';

  const skipMatch = line.match(/停[:：]?\s*([0-9，,\s]+)/);
  const extraMatch = line.match(/补[:：]?\s*([0-9，,\s]+)/);

  return {
    startWeek,
    endWeek,
    parity,
    skipWeeks: parseIntList(skipMatch ? skipMatch[1] : ''),
    extraWeeks: parseIntList(extraMatch ? extraMatch[1] : ''),
  };
}

function parseNameLocationTeacher(line) {
  let remaining = line;
  let location = '';
  let teacher = '';

  const locationMatch = remaining.match(/@([^#]+)(#|$)/);
  if (locationMatch) {
    location = locationMatch[1].trim();
    remaining = remaining.replace(locationMatch[0], ' ');
  }

  const teacherMatch = remaining.match(/#([^@]+)(@|$)/);
  if (teacherMatch) {
    teacher = teacherMatch[1].trim();
    remaining = remaining.replace(teacherMatch[0], ' ');
  }

  remaining = remaining
    .replace(/\d{1,2}\s*[-~—–]\s*\d{1,2}\s*节?/g, ' ')
    .replace(/\d{1,2}\s*[-~—–]\s*\d{1,2}\s*周/g, ' ')
    .replace(/单周|双周/g, ' ')
    .replace(/停[:：]?[0-9，,\s]+/g, ' ')
    .replace(/补[:：]?[0-9，,\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    name: remaining || 'Untitled Course',
    location,
    teacher,
  };
}

function parseLine(rawLine, index) {
  const line = rawLine.trim();
  if (!line) return null;

  const weekday = detectWeekday(line);
  if (!weekday) return null;

  const periods = parsePeriods(line);
  if (!periods) return null;

  const weeksRule = parseWeeksRule(line);
  const detail = parseNameLocationTeacher(removeWeekdayToken(line));

  return {
    id: `ocr-${index + 1}`,
    name: detail.name,
    location: detail.location,
    teacher: detail.teacher,
    weekday,
    startPeriod: periods.start,
    endPeriod: periods.end,
    weeksRule,
    exceptions: [],
  };
}

function ocrImage(imagePath) {
  return execFileSync('tesseract', [imagePath, 'stdout', '-l', 'chi_sim+eng'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const image = getArg('--image');
const output = getArg('--output') || '~/.config/course-table/schedule.json';
const termName = getArg('--term') || '';

if (!image) {
  usage();
  process.exit(1);
}

const imagePath = path.resolve(expandHome(image));
const outputPath = path.resolve(expandHome(output));

let text;
try {
  text = ocrImage(imagePath);
} catch (error) {
  console.error(`OCR failed: ${error.message}`);
  process.exit(2);
}

const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const courses = lines.map((line, i) => parseLine(line, i)).filter(Boolean);

if (courses.length === 0) {
  console.error('No course line recognized from OCR text.');
  process.exit(3);
}

const schedule = normalizeSchedule({
  meta: {
    termName,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    updatedAt: new Date().toISOString(),
  },
  courses,
});

const errors = validateSchedule(schedule);
if (errors.length > 0) {
  console.error('Parsed schedule failed validation:');
  errors.forEach((item) => console.error(`- ${item}`));
  process.exit(4);
}

saveJsonFile(outputPath, schedule);
console.log(`Imported ${schedule.courses.length} courses from screenshot.`);
console.log(`Saved to ${outputPath}`);
