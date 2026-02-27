import { DEFAULT_SCHEDULE, SCHEMA_VERSION } from "./constants.js";

const PARITY_VALUES = new Set(["all", "odd", "even"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ensureInt(value, fallback) {
  if (typeof value === "number" && Number.isInteger(value)) return value;

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) return parsed;
  }

  return fallback;
}

function ensureString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeWeeksRule(rule) {
  const source = isObject(rule) ? rule : {};

  const startWeek = Math.max(1, ensureInt(source.startWeek, 1));
  const endWeek = Math.max(startWeek, ensureInt(source.endWeek, startWeek));
  const parity = PARITY_VALUES.has(source.parity) ? source.parity : "all";

  const skipWeeks = Array.isArray(source.skipWeeks)
    ? source.skipWeeks
        .map((item) => ensureInt(item, -1))
        .filter((item) => item > 0)
    : [];

  const extraWeeks = Array.isArray(source.extraWeeks)
    ? source.extraWeeks
        .map((item) => ensureInt(item, -1))
        .filter((item) => item > 0)
    : [];

  return {
    startWeek,
    endWeek,
    parity,
    skipWeeks: [...new Set(skipWeeks)].sort((a, b) => a - b),
    extraWeeks: [...new Set(extraWeeks)].sort((a, b) => a - b),
  };
}

function normalizeException(item) {
  const source = isObject(item) ? item : {};
  const action = source.action === "override" ? "override" : "cancel";

  const normalized = {
    date: ensureString(source.date),
    action,
    note: ensureString(source.note),
  };

  if (action === "override") {
    normalized.weekday = Math.min(Math.max(1, ensureInt(source.weekday, 1)), 7);
    normalized.startPeriod = Math.max(1, ensureInt(source.startPeriod, 1));
    normalized.endPeriod = Math.max(
      normalized.startPeriod,
      ensureInt(source.endPeriod, normalized.startPeriod),
    );
  }

  return normalized;
}

function normalizeCourse(course, index) {
  const source = isObject(course) ? course : {};
  const startPeriod = Math.max(1, ensureInt(source.startPeriod, 1));

  return {
    id: ensureString(source.id, `course-${index + 1}`),
    name: ensureString(source.name, "Untitled Course"),
    location: ensureString(source.location),
    teacher: ensureString(source.teacher),
    weekday: Math.min(Math.max(1, ensureInt(source.weekday, 1)), 7),
    startPeriod,
    endPeriod: Math.max(startPeriod, ensureInt(source.endPeriod, startPeriod)),
    weeksRule: normalizeWeeksRule(source.weeksRule),
    exceptions: Array.isArray(source.exceptions)
      ? source.exceptions.map(normalizeException).filter((item) => item.date)
      : [],
  };
}

/**
 * Expand courses that specify a `weekdays` array (e.g. [1, 3]) into separate
 * course entries — one per weekday.  Courses using the single `weekday` field
 * pass through unchanged.  This keeps the internal model simple (one weekday
 * per entry) while letting users declare multi-day courses concisely.
 */
function expandWeekdaysArray(rawCourses) {
  const expanded = [];

  for (const course of rawCourses) {
    const source = isObject(course) ? course : {};
    const weekdays = Array.isArray(source.weekdays) ? source.weekdays : null;

    if (weekdays && weekdays.length > 0) {
      const seen = new Set();
      for (const wd of weekdays) {
        const day = ensureInt(wd, -1);
        if (day < 1 || day > 7 || seen.has(day)) continue;
        seen.add(day);
        expanded.push({
          ...source,
          weekday: day,
          weekdays: undefined,
          id: source.id ? `${source.id}-d${day}` : undefined,
        });
      }
    } else {
      expanded.push(course);
    }
  }

  return expanded;
}

export function normalizeSchedule(rawSchedule) {
  const source = isObject(rawSchedule) ? rawSchedule : {};
  const meta = isObject(source.meta) ? source.meta : {};

  const rawCourses = Array.isArray(source.courses) ? source.courses : [];
  const expanded = expandWeekdaysArray(rawCourses);

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      termName: ensureString(meta.termName),
      timezone: ensureString(meta.timezone),
      updatedAt: ensureString(meta.updatedAt),
    },
    courses: expanded.map(normalizeCourse),
  };
}

export function validateSchedule(schedule) {
  const errors = [];

  if (!isObject(schedule)) {
    errors.push("Schedule root must be an object.");
    return errors;
  }

  if (!Array.isArray(schedule.courses))
    errors.push("`courses` must be an array.");

  if (Array.isArray(schedule.courses)) {
    schedule.courses.forEach((course, index) => {
      const prefix = `courses[${index}]`;
      if (!isObject(course)) {
        errors.push(`${prefix} must be an object.`);
        return;
      }

      if (!course.name || typeof course.name !== "string")
        errors.push(`${prefix}.name must be a non-empty string.`);

      if (
        !Number.isInteger(course.weekday) ||
        course.weekday < 1 ||
        course.weekday > 7
      )
        errors.push(`${prefix}.weekday must be an integer between 1 and 7.`);

      if (!Number.isInteger(course.startPeriod) || course.startPeriod < 1)
        errors.push(`${prefix}.startPeriod must be an integer >= 1.`);

      if (
        !Number.isInteger(course.endPeriod) ||
        course.endPeriod < course.startPeriod
      )
        errors.push(`${prefix}.endPeriod must be an integer >= startPeriod.`);

      const weeksRule = isObject(course.weeksRule) ? course.weeksRule : null;
      if (!weeksRule) {
        errors.push(`${prefix}.weeksRule must be an object.`);
      } else {
        if (!Number.isInteger(weeksRule.startWeek) || weeksRule.startWeek < 1)
          errors.push(`${prefix}.weeksRule.startWeek must be >= 1.`);

        if (
          !Number.isInteger(weeksRule.endWeek) ||
          weeksRule.endWeek < weeksRule.startWeek
        )
          errors.push(`${prefix}.weeksRule.endWeek must be >= startWeek.`);

        if (!PARITY_VALUES.has(weeksRule.parity))
          errors.push(
            `${prefix}.weeksRule.parity must be one of all/odd/even.`,
          );
      }
    });
  }

  return errors;
}

export function makeDefaultSchedule() {
  return normalizeSchedule(DEFAULT_SCHEDULE);
}
