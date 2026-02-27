import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {DEFAULT_PERIOD_TIMES} from './lib/constants.js';
import {findNextOccurrence, getOccurrencesInRange, summarizeToday} from './lib/scheduleEngine.js';
import {ReminderScheduler} from './lib/reminders.js';
import {loadScheduleFromPath} from './lib/storage.js';

function parsePeriodTimesFromSettings(raw) {
    if (!raw)
        return DEFAULT_PERIOD_TIMES;

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return DEFAULT_PERIOD_TIMES;

        const result = {};
        for (const [period, window] of Object.entries(parsed)) {
            if (!window || typeof window !== 'object')
                continue;
            if (typeof window.start !== 'string' || typeof window.end !== 'string')
                continue;
            result[period] = {
                start: window.start,
                end: window.end,
            };
        }

        return Object.keys(result).length > 0 ? result : DEFAULT_PERIOD_TIMES;
    } catch (_error) {
        return DEFAULT_PERIOD_TIMES;
    }
}

function formatDuration(minutes) {
    if (minutes < 60)
        return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return remain > 0 ? `${hours}h ${remain}m` : `${hours}h`;
}

function weekdayLabel(weekday) {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday - 1] ?? '?';
}

function buildAllCourseRows(schedule, periodTimes) {
    const courses = Array.isArray(schedule?.courses) ? schedule.courses : [];

    const rows = courses.map(course => {
        const startText = periodTimes[String(course.startPeriod)]?.start ?? `P${course.startPeriod}`;
        const endText = periodTimes[String(course.endPeriod)]?.end ?? `P${course.endPeriod}`;

        return {
            name: course.name,
            location: course.location,
            teacher: course.teacher,
            weekday: course.weekday,
            startText,
            endText,
        };
    });

    return rows.sort((a, b) => {
        if (a.weekday !== b.weekday)
            return a.weekday - b.weekday;

        return a.startText.localeCompare(b.startText);
    });
}

const CourseIndicator = GObject.registerClass(
class CourseIndicator extends PanelMenu.Button {
    _init(onRefresh, onOpenPreferences) {
        super._init(0.0, 'Course Table Indicator');

        this._onRefresh = onRefresh;
        this._onOpenPreferences = onOpenPreferences;
        this._searchText = '';
        this._lastState = null;

        this._label = new St.Label({
            text: 'Course',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'course-table-heading',
        });

        this.add_child(this._label);
    }

    _filteredRows(rows) {
        if (!this._searchText)
            return rows.slice(0, 8);

        const key = this._searchText.toLowerCase();
        return rows.filter(row => {
            return row.name.toLowerCase().includes(key)
                || row.location.toLowerCase().includes(key)
                || row.teacher.toLowerCase().includes(key);
        }).slice(0, 12);
    }

    _addSearchEntry() {
        const inputItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const entry = new St.Entry({
            text: this._searchText,
            hint_text: 'Search course / location / teacher',
            can_focus: true,
            x_expand: true,
            track_hover: true,
        });

        entry.get_clutter_text().connect('text-changed', () => {
            this._searchText = entry.get_text().trim();
            if (this._lastState)
                this.render(this._lastState);
        });

        inputItem.add_child(entry);
        this.menu.addMenuItem(inputItem);
    }

    _addSearchRows(rows) {
        const filtered = this._filteredRows(rows);

        if (filtered.length === 0) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem('No course matched current keyword.', {
                reactive: false,
                can_focus: false,
            }));
            return;
        }

        filtered.forEach(row => {
            const title = `[${weekdayLabel(row.weekday)}] ${row.startText}-${row.endText}  ${row.name}`;
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(title, {
                reactive: false,
                can_focus: false,
            }));
        });
    }

    render(state) {
        this._lastState = state;
        this.menu.removeAll();

        const {nextOccurrence, todaySummary, allCourses} = state;

        if (nextOccurrence)
            this._label.set_text(`Next ${nextOccurrence.startText}`);
        else
            this._label.set_text('No Class');

        const nextHeading = new PopupMenu.PopupMenuItem('Next Class', {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(nextHeading);

        if (nextOccurrence) {
            const subtitle = `${nextOccurrence.startText}-${nextOccurrence.endText}  ${nextOccurrence.name}  (in ${formatDuration(nextOccurrence.minutesUntilStart)})`;
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(subtitle, {
                reactive: false,
                can_focus: false,
            }));
        } else {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem('No upcoming class in next 4 weeks.', {
                reactive: false,
                can_focus: false,
            }));
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const todayHeading = new PopupMenu.PopupMenuItem(`Today (${todaySummary.count})`, {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(todayHeading);

        if (todaySummary.courses.length === 0) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem('No classes today.', {
                reactive: false,
                can_focus: false,
            }));
        } else {
            todaySummary.courses.forEach(item => {
                const title = `${item.startText}-${item.endText}  ${item.name}`;
                this.menu.addMenuItem(new PopupMenu.PopupMenuItem(title, {
                    reactive: false,
                    can_focus: false,
                }));
            });
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const searchHeading = new PopupMenu.PopupMenuItem('All Courses', {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(searchHeading);

        this._addSearchEntry();
        this._addSearchRows(allCourses);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupMenuItem('Refresh');
        refreshItem.connect('activate', () => this._onRefresh());
        this.menu.addMenuItem(refreshItem);

        const settingsItem = new PopupMenu.PopupMenuItem('Open Settings');
        settingsItem.connect('activate', () => this._onOpenPreferences());
        this.menu.addMenuItem(settingsItem);
    }
});

export default class CourseTableExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._reminderScheduler = new ReminderScheduler((title, body) => Main.notify(title, body));

        this._indicator = new CourseIndicator(
            () => this._refreshView(),
            () => this.openPreferences()
        );

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._settingsSignals = [
            this._settings.connect('changed::schedule-file-path', () => this._refreshView()),
            this._settings.connect('changed::period-times-json', () => this._refreshView()),
            this._settings.connect('changed::week1-start-date', () => this._refreshView()),
        ];

        this._refreshView();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._refreshView();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }

        if (this._settingsSignals && this._settings) {
            this._settingsSignals.forEach(signalId => this._settings.disconnect(signalId));
            this._settingsSignals = null;
        }

        this._settings = null;
        this._reminderScheduler = null;

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _refreshView() {
        if (!this._indicator || !this._settings)
            return;

        const scheduleFilePath = this._settings.get_string('schedule-file-path');
        const periodTimes = parsePeriodTimesFromSettings(this._settings.get_string('period-times-json'));
        const week1StartDate = this._settings.get_string('week1-start-date');

        const schedule = loadScheduleFromPath(scheduleFilePath);

        const now = new Date();
        const options = {
            periodTimes,
            week1StartDate,
        };

        const nextOccurrence = findNextOccurrence(schedule, now, options);
        const todaySummary = summarizeToday(schedule, now, options);
        const allCourses = buildAllCourseRows(schedule, periodTimes);
        const rangeOccurrences = getOccurrencesInRange(schedule, now, 3, options);

        this._reminderScheduler.updateConfig({
            enabled: this._settings.get_boolean('notify-enabled'),
            minutesBefore: this._settings.get_int('notify-minutes-before'),
        });
        this._reminderScheduler.process(now, rangeOccurrences);

        this._indicator.render({
            nextOccurrence,
            todaySummary,
            allCourses,
        });
    }
}
