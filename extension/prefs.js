import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DEFAULT_PERIOD_TIMES} from './lib/constants.js';
import {normalizeSchedule, validateSchedule} from './lib/scheduleSchema.js';
import {loadScheduleFromPath, resolveSchedulePath, saveScheduleToPath} from './lib/storage.js';

function parsePeriodTimes(raw) {
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

function getBufferText(buffer) {
    const start = buffer.get_start_iter();
    const end = buffer.get_end_iter();
    return buffer.get_text(start, end, false);
}

function buildSampleCourse() {
    return {
        id: `course-${Date.now()}`,
        name: 'New Course',
        location: '',
        teacher: '',
        weekday: 1,
        startPeriod: 1,
        endPeriod: 2,
        weeksRule: {
            startWeek: 1,
            endWeek: 18,
            parity: 'all',
            skipWeeks: [],
            extraWeeks: [],
        },
        exceptions: [],
    };
}

export default class CourseTablePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(900, 760);

        const settings = this.getSettings();
        if (!settings.get_string('period-times-json'))
            settings.set_string('period-times-json', JSON.stringify(DEFAULT_PERIOD_TIMES));

        const page = new Adw.PreferencesPage({
            title: 'Course Table',
            icon_name: 'x-office-calendar-symbolic',
        });

        const baseGroup = new Adw.PreferencesGroup({
            title: 'General',
            description: 'Base configuration and reminder settings.',
        });

        const fileRow = new Adw.EntryRow({
            title: 'Schedule JSON Path',
            text: settings.get_string('schedule-file-path'),
        });
        fileRow.connect('changed', row => settings.set_string('schedule-file-path', row.get_text()));

        const week1Row = new Adw.EntryRow({
            title: 'Week 1 Start Date (YYYY-MM-DD)',
            text: settings.get_string('week1-start-date'),
        });
        week1Row.connect('changed', row => settings.set_string('week1-start-date', row.get_text()));

        const notifyRow = new Adw.SwitchRow({
            title: 'Enable Notifications',
            subtitle: 'Notify once before each class occurrence.',
            active: settings.get_boolean('notify-enabled'),
        });
        notifyRow.connect('notify::active', row => settings.set_boolean('notify-enabled', row.get_active()));

        const remindRow = new Adw.ActionRow({
            title: 'Notify Minutes Before Class',
            subtitle: 'Default is 30 minutes.',
        });
        const remindSpin = Gtk.SpinButton.new_with_range(1, 180, 1);
        remindSpin.set_value(settings.get_int('notify-minutes-before'));
        remindSpin.connect('value-changed', spin => settings.set_int('notify-minutes-before', spin.get_value_as_int()));
        remindRow.add_suffix(remindSpin);
        remindRow.activatable_widget = remindSpin;

        baseGroup.add(fileRow);
        baseGroup.add(week1Row);
        baseGroup.add(notifyRow);
        baseGroup.add(remindRow);

        const editorGroup = new Adw.PreferencesGroup({
            title: 'Data Editors',
            description: 'Edit period times and courses with week rules and exceptions.',
        });

        const periodEditorRow = new Adw.ActionRow({
            title: 'Edit Period Times',
            subtitle: 'Configure period start and end times.',
        });
        const periodEditorButton = new Gtk.Button({label: 'Open'});
        periodEditorButton.connect('clicked', () => this._openPeriodEditor(window, settings));
        periodEditorRow.add_suffix(periodEditorButton);
        periodEditorRow.activatable_widget = periodEditorButton;

        const scheduleEditorRow = new Adw.ActionRow({
            title: 'Edit Courses and Week Rules',
            subtitle: 'Edit full course JSON including skip/extra weeks and date overrides.',
        });
        const scheduleEditorButton = new Gtk.Button({label: 'Open'});
        scheduleEditorButton.connect('clicked', () => this._openScheduleEditor(window, settings));
        scheduleEditorRow.add_suffix(scheduleEditorButton);
        scheduleEditorRow.activatable_widget = scheduleEditorButton;

        const pathRow = new Adw.ActionRow({
            title: 'Resolved Data Path',
            subtitle: resolveSchedulePath(settings.get_string('schedule-file-path')),
        });

        editorGroup.add(periodEditorRow);
        editorGroup.add(scheduleEditorRow);
        editorGroup.add(pathRow);

        page.add(baseGroup);
        page.add(editorGroup);
        window.add(page);
    }

    _openPeriodEditor(parentWindow, settings) {
        const current = parsePeriodTimes(settings.get_string('period-times-json'));

        const dialog = new Gtk.Window({
            title: 'Period Times',
            transient_for: parentWindow,
            modal: true,
            default_width: 420,
            default_height: 640,
        });

        const root = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16,
        });

        const rows = [];

        for (let period = 1; period <= 13; period++) {
            const periodRow = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
                halign: Gtk.Align.FILL,
                hexpand: true,
            });

            const label = new Gtk.Label({
                label: `Period ${period}`,
                xalign: 0,
                width_chars: 8,
            });

            const start = new Gtk.Entry({
                hexpand: true,
                text: current[String(period)]?.start ?? '',
                placeholder_text: 'HH:MM',
            });

            const end = new Gtk.Entry({
                hexpand: true,
                text: current[String(period)]?.end ?? '',
                placeholder_text: 'HH:MM',
            });

            periodRow.append(label);
            periodRow.append(start);
            periodRow.append(end);

            rows.push({period: String(period), start, end});
            root.append(periodRow);
        }

        const status = new Gtk.Label({
            xalign: 0,
            wrap: true,
            css_classes: ['dim-label'],
        });
        root.append(status);

        const actions = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.END,
        });

        const save = new Gtk.Button({label: 'Save'});
        const cancel = new Gtk.Button({label: 'Close'});

        save.connect('clicked', () => {
            const next = {};
            for (const row of rows) {
                const startValue = row.start.get_text().trim();
                const endValue = row.end.get_text().trim();
                if (!startValue || !endValue)
                    continue;

                next[row.period] = {
                    start: startValue,
                    end: endValue,
                };
            }

            if (Object.keys(next).length === 0) {
                status.set_label('No valid period rows to save.');
                return;
            }

            settings.set_string('period-times-json', JSON.stringify(next));
            status.set_label('Saved period times.');
        });

        cancel.connect('clicked', () => dialog.close());

        actions.append(cancel);
        actions.append(save);
        root.append(actions);

        dialog.set_child(root);
        dialog.present();
    }

    _openScheduleEditor(parentWindow, settings) {
        const schedulePath = settings.get_string('schedule-file-path');
        const existing = loadScheduleFromPath(schedulePath);

        const dialog = new Gtk.Window({
            title: 'Courses and Week Rules Editor',
            transient_for: parentWindow,
            modal: true,
            default_width: 980,
            default_height: 760,
        });

        const root = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        const hint = new Gtk.Label({
            xalign: 0,
            wrap: true,
            label: 'Edit JSON directly. weeksRule supports startWeek/endWeek/parity/skipWeeks/extraWeeks. exceptions supports cancel/override by date.',
            css_classes: ['dim-label'],
        });
        root.append(hint);

        const scroller = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
            min_content_height: 450,
        });

        const textView = new Gtk.TextView({
            monospace: true,
            vexpand: true,
            hexpand: true,
        });
        const buffer = textView.get_buffer();
        buffer.set_text(JSON.stringify(existing, null, 2), -1);

        scroller.set_child(textView);
        root.append(scroller);

        const status = new Gtk.Label({
            xalign: 0,
            wrap: true,
            css_classes: ['dim-label'],
            label: `Path: ${resolveSchedulePath(schedulePath)}`,
        });
        root.append(status);

        const actions = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.END,
        });

        const reload = new Gtk.Button({label: 'Reload'});
        const addTemplate = new Gtk.Button({label: 'Add Course Template'});
        const validate = new Gtk.Button({label: 'Validate'});
        const save = new Gtk.Button({label: 'Save'});
        const close = new Gtk.Button({label: 'Close'});

        reload.connect('clicked', () => {
            const fresh = loadScheduleFromPath(schedulePath);
            buffer.set_text(JSON.stringify(fresh, null, 2), -1);
            status.set_label('Reloaded from file.');
        });

        addTemplate.connect('clicked', () => {
            try {
                const current = normalizeSchedule(JSON.parse(getBufferText(buffer)));
                current.courses.push(buildSampleCourse());
                buffer.set_text(JSON.stringify(current, null, 2), -1);
                status.set_label('Added course template.');
            } catch (_error) {
                status.set_label('Cannot add template: current JSON is invalid.');
            }
        });

        validate.connect('clicked', () => {
            try {
                const normalized = normalizeSchedule(JSON.parse(getBufferText(buffer)));
                const errors = validateSchedule(normalized);
                if (errors.length === 0)
                    status.set_label('Validation passed.');
                else
                    status.set_label(`Validation failed: ${errors.slice(0, 4).join(' | ')}`);
            } catch (error) {
                status.set_label(`JSON parse failed: ${error.message}`);
            }
        });

        save.connect('clicked', () => {
            try {
                const normalized = normalizeSchedule(JSON.parse(getBufferText(buffer)));
                const errors = validateSchedule(normalized);
                if (errors.length > 0) {
                    status.set_label(`Save blocked by validation: ${errors.slice(0, 4).join(' | ')}`);
                    return;
                }

                const path = saveScheduleToPath(schedulePath, normalized);
                status.set_label(`Saved to ${path}`);
            } catch (error) {
                status.set_label(`Save failed: ${error.message}`);
            }
        });

        close.connect('clicked', () => dialog.close());

        actions.append(reload);
        actions.append(addTemplate);
        actions.append(validate);
        actions.append(save);
        actions.append(close);

        root.append(actions);

        dialog.set_child(root);
        dialog.present();
    }
}
