import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {makeDefaultSchedule, normalizeSchedule} from './scheduleSchema.js';

function expandPath(path) {
    if (!path)
        return '';

    if (path.startsWith('~/'))
        return GLib.build_filenamev([GLib.get_home_dir(), path.slice(2)]);

    return path;
}

function ensureParentDir(filePath) {
    const parent = GLib.path_get_dirname(filePath);
    if (!parent)
        return;

    GLib.mkdir_with_parents(parent, 0o755);
}

export function resolveSchedulePath(pathFromSettings) {
    const expanded = expandPath(pathFromSettings);
    if (GLib.path_is_absolute(expanded))
        return expanded;

    return GLib.build_filenamev([GLib.get_home_dir(), '.config', 'course-table', 'schedule.json']);
}

export function loadScheduleFromPath(filePath) {
    const resolved = resolveSchedulePath(filePath);
    const file = Gio.File.new_for_path(resolved);

    if (!file.query_exists(null))
        return makeDefaultSchedule();

    const [ok, bytes] = file.load_bytes(null);
    if (!ok)
        return makeDefaultSchedule();

    try {
        const raw = JSON.parse(new TextDecoder().decode(bytes.get_data()));
        return normalizeSchedule(raw);
    } catch (_error) {
        return makeDefaultSchedule();
    }
}

export function saveScheduleToPath(filePath, schedule) {
    const resolved = resolveSchedulePath(filePath);
    ensureParentDir(resolved);

    const normalized = normalizeSchedule(schedule);
    normalized.meta.updatedAt = new Date().toISOString();

    const payload = JSON.stringify(normalized, null, 2);
    const file = Gio.File.new_for_path(resolved);
    file.replace_contents(payload, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

    return resolved;
}
