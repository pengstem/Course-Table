export const SCHEMA_VERSION = 1;

export const DEFAULT_PERIOD_TIMES = {
    '1': {start: '08:00', end: '08:45'},
    '2': {start: '08:50', end: '09:35'},
    '3': {start: '09:50', end: '10:35'},
    '4': {start: '10:40', end: '11:25'},
    '5': {start: '11:30', end: '12:15'},
    '6': {start: '14:05', end: '14:50'},
    '7': {start: '14:55', end: '15:40'},
    '8': {start: '15:45', end: '16:30'},
    '9': {start: '16:40', end: '17:25'},
    '10': {start: '17:30', end: '18:15'},
    '11': {start: '18:30', end: '19:15'},
    '12': {start: '19:20', end: '20:05'},
    '13': {start: '20:10', end: '20:55'},
};

export const DEFAULT_SCHEDULE = {
    schemaVersion: SCHEMA_VERSION,
    meta: {
        termName: '',
        timezone: '',
        updatedAt: '',
    },
    courses: [],
};
