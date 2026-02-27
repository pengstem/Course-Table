import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const CourseIndicator = GObject.registerClass(
class CourseIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Course Table Indicator');

        this._label = new St.Label({
            text: 'Course',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Course Table is loading...'));
    }

    setText(text) {
        this._label.set_text(text);
    }
});

export default class CourseTableExtension extends Extension {
    enable() {
        this._indicator = new CourseIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
