import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CourseTablePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage({
            title: 'Course Table',
            icon_name: 'x-office-calendar-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: 'General',
            description: 'Course Table settings will appear here.',
        });

        const row = new Adw.ActionRow({
            title: 'Status',
            subtitle: 'Preferences UI scaffold is ready.',
        });

        const badge = new Gtk.Label({
            label: 'v0',
            css_classes: ['dim-label'],
        });
        row.add_suffix(badge);

        group.add(row);
        page.add(group);
        window.add(page);
    }
}
