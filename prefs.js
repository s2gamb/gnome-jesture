import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ThreeFingerDownWindowCyclePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Gesture Settings',
            icon_name: 'input-touchpad-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Three-Finger Down Window Cycling',
            description: 'Configure how sensitively a continuous three-finger downward swipe cycles through visible windows on the active workspace.',
        });
        page.add(group);

        const stepRow = new Adw.SpinRow({
            title: 'Switching Step Distance (px)',
            subtitle: 'Lower values switch windows more frequently; higher values require more downward travel per switch.',
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 200,
                step_increment: 5,
                page_increment: 20,
                value: settings.get_int('step-distance'),
            }),
        });
        settings.bind(
            'step-distance',
            stepRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        group.add(stepRow);

        const shortSwipeRow = new Adw.SwitchRow({
            title: 'Switch on Short Flick',
            subtitle: 'Advance one window on release even if the swipe is shorter than the step distance.',
        });
        settings.bind(
            'trigger-on-short-swipe',
            shortSwipeRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        group.add(shortSwipeRow);

        const previewOverlayRow = new Adw.SwitchRow({
            title: 'Show Window Preview Switcher',
            subtitle: 'Display horizontal live window previews while scrolling and activate the selected window on finger release.',
        });
        settings.bind(
            'show-preview-overlay',
            previewOverlayRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        group.add(previewOverlayRow);
    }
}
