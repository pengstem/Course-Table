#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCHEMA_VERSION = 1;

function ensureInt(value, fallback) {
  if (Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const v = Number.parseInt(value, 10);
    if (Number.isInteger(v)) return v;
  }
  return fallback;
}

function ensureString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function uniqSortedIntList(values) {
  return [...new Set(values.filter((v) => Number.isInteger(v) && v > 0))].sort((a, b) => a - b);
}

function normalizeWeeksRule(input = {}) {
  const startWeek = Math.max(1, ensureInt(input.startWeek, 1));
  const endWeek = Math.max(startWeek, ensureInt(input.endWeek, startWeek));
  const parity = ['all', 'odd', 'even'].includes(input.parity) ? input.parity : 'all';
  const skipWeeks = uniqSortedIntList(Array.isArray(input.skipWeeks) ? input.skipWeeks.map((x) => ensureInt(x, -1)) : []);
  const extraWeeks = uniqSortedIntList(Array.isArray(input.extraWeeks) ? input.extraWeeks.map((x) => ensureInt(x, -1)) : []);

  return {startWeek, endWeek, parity, skipWeeks, extraWeeks};
}

function normalizeException(exception = {}) {
  const action = exception.action === 'override' ? 'override' : 'cancel';
  const base = {
    date: ensureString(exception.date),
    action,
    note: ensureString(exception.note),
  };

  if (action === 'override') {
    const startPeriod = Math.max(1, ensureInt(exception.startPeriod, 1));
    base.weekday = Math.min(7, Math.max(1, ensureInt(exception.weekday, 1)));
    base.startPeriod = startPeriod;
    base.endPeriod = Math.max(startPeriod, ensureInt(exception.endPeriod, startPeriod));
  }

  return base;
}

function normalizeCourse(course = {}, index = 0) {
  const startPeriod = Math.max(1, ensureInt(course.startPeriod, 1));
  return {
    id: ensureString(course.id, `course-${index + 1}`),
    name: ensureString(course.name, 'Untitled Course'),
    location: ensureString(course.location),
    teacher: ensureString(course.teacher),
    weekday: Math.min(7, Math.max(1, ensureInt(course.weekday, 1))),
    startPeriod,
    endPeriod: Math.max(startPeriod, ensureInt(course.endPeriod, startPeriod)),
    weeksRule: normalizeWeeksRule(course.weeksRule || {}),
    exceptions: Array.isArray(course.exceptions)
      ? course.exceptions.map((item) => normalizeException(item)).filter((item) => item.date)
      : [],
  };
}

function normalizeSchedule(schedule = {}) {
  const meta = schedule && typeof schedule.meta === 'object' ? schedule.meta : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      termName: ensureString(meta.termName),
      timezone: ensureString(meta.timezone),
      updatedAt: ensureString(meta.updatedAt),
    },
    courses: Array.isArray(schedule.courses) ? schedule.courses.map((c, i) => normalizeCourse(c, i)) : [],
  };
}

function validateSchedule(schedule) {
  const errors = [];
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    return ['Schedule root must be an object'];
  }

  if (!Array.isArray(schedule.courses)) {
    errors.push('`courses` must be an array');
    return errors;
  }

  schedule.courses.forEach((course, index) => {
    const prefix = `courses[${index}]`;
    if (!course.name || typeof course.name !== 'string') {
      errors.push(`${prefix}.name must be non-empty string`);
    }

    if (!Number.isInteger(course.weekday) || course.weekday < 1 || course.weekday > 7) {
      errors.push(`${prefix}.weekday must be integer in [1,7]`);
    }

    if (!Number.isInteger(course.startPeriod) || course.startPeriod < 1) {
      errors.push(`${prefix}.startPeriod must be >=1`);
    }

    if (!Number.isInteger(course.endPeriod) || course.endPeriod < course.startPeriod) {
      errors.push(`${prefix}.endPeriod must be >= startPeriod`);
    }

    const wr = course.weeksRule || {};
    if (!Number.isInteger(wr.startWeek) || wr.startWeek < 1) {
      errors.push(`${prefix}.weeksRule.startWeek must be >=1`);
    }

    if (!Number.isInteger(wr.endWeek) || wr.endWeek < wr.startWeek) {
      errors.push(`${prefix}.weeksRule.endWeek must be >= startWeek`);
    }

    if (!['all', 'odd', 'even'].includes(wr.parity)) {
      errors.push(`${prefix}.weeksRule.parity must be all|odd|even`);
    }
  });

  return errors;
}

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

module.exports = {
  normalizeSchedule,
  validateSchedule,
  expandHome,
  loadJsonFile,
  saveJsonFile,
};
