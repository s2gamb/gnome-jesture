import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const APP_ICON_SIZE = 72;
const FADE_TIME_MS = 100;

export class WindowPreviewOverlay {
    constructor() {
        this._container = null;
        this._scrollView = null;
        this._itemsBox = null;
        this._titleLabel = null;
        this._items = [];
        this._windows = [];
        this._selectedIndex = -1;
    }

    show(windows, selectedIndex) {
        this.hide();

        if (!windows || windows.length === 0)
            return;

        this._windows = windows;
        this._items = [];

        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        const tracker = Shell.WindowTracker.get_default();

        this._container = new St.BoxLayout({
            style_class: 'switcher-list tfd-switcher-overlay',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: false,
            opacity: 0,
        });

        this._scrollView = new St.ScrollView({
            style_class: 'tfd-switcher-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            overlay_scrollbars: true,
        });

        this._itemsBox = new St.BoxLayout({
            style_class: 'tfd-switcher-items',
            orientation: Clutter.Orientation.HORIZONTAL,
        });

        for (const win of windows) {
            const card = new St.BoxLayout({
                style_class: 'item-box tfd-switcher-item',
                orientation: Clutter.Orientation.VERTICAL,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const app = tracker.get_window_app(win);
            const icon = app
                ? app.create_icon_texture(APP_ICON_SIZE)
                : new St.Icon({
                    icon_name: 'application-x-executable',
                    icon_size: APP_ICON_SIZE,
                });
            icon.x_align = Clutter.ActorAlign.CENTER;
            icon.y_align = Clutter.ActorAlign.CENTER;

            card.add_child(icon);
            this._itemsBox.add_child(card);
            this._items.push(card);
        }

        this._scrollView.set_child(this._itemsBox);
        this._container.add_child(this._scrollView);

        this._titleLabel = new St.Label({
            style_class: 'tfd-switcher-title',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._container.add_child(this._titleLabel);

        const maxOverlayWidth = Math.floor(monitor.width * 0.88);
        this._container.style = `max-width: ${maxOverlayWidth}px;`;

        Main.layoutManager.uiGroup.add_child(this._container);

        const [, iconsNatWidth] = this._itemsBox.get_preferred_width(-1);
        const titleMaxWidth = Math.max(120, Math.min(iconsNatWidth, maxOverlayWidth - 32));
        this._titleLabel.style = `max-width: ${titleMaxWidth}px;`;

        this.select(selectedIndex);

        const [, natWidth] = this._container.get_preferred_width(-1);
        const [, natHeight] = this._container.get_preferred_height(natWidth);
        const width = Math.min(natWidth, maxOverlayWidth);
        const x = Math.round(monitor.x + (monitor.width - width) / 2);
        const y = Math.round(monitor.y + (monitor.height - natHeight) / 2);

        this._container.set_position(x, y);
        this._container.ease({
            opacity: 255,
            duration: FADE_TIME_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    select(index) {
        if (!this._container || this._items.length === 0)
            return;

        const clamped = ((index % this._items.length) + this._items.length) % this._items.length;

        if (this._selectedIndex >= 0 && this._selectedIndex < this._items.length) {
            this._items[this._selectedIndex].remove_style_pseudo_class('selected');
            this._items[this._selectedIndex].remove_style_class_name('tfd-switcher-item-selected');
        }

        this._selectedIndex = clamped;
        const selectedItem = this._items[clamped];
        selectedItem.add_style_pseudo_class('selected');
        selectedItem.add_style_class_name('tfd-switcher-item-selected');

        const win = this._windows[clamped];
        this._titleLabel.text = win?.get_title() || win?.get_wm_class() || '';

        this._ensureItemVisible(selectedItem);
    }

    _ensureItemVisible(item) {
        if (!this._scrollView)
            return;

        const hadjustment = this._scrollView.hadjustment;
        if (!hadjustment)
            return;

        const box = item.get_allocation_box();
        const itemWidth = box.x2 - box.x1;
        if (itemWidth <= 0)
            return;

        const pageSize = hadjustment.page_size;
        const target = Math.max(
            0,
            Math.min(
                hadjustment.upper - pageSize,
                box.x1 + itemWidth / 2 - pageSize / 2
            )
        );
        hadjustment.value = target;
    }

    hide() {
        if (!this._container)
            return;

        const container = this._container;
        this._container = null;
        this._scrollView = null;
        this._itemsBox = null;
        this._titleLabel = null;
        this._items = [];
        this._windows = [];
        this._selectedIndex = -1;

        container.remove_all_transitions();
        if (container.get_parent())
            container.get_parent().remove_child(container);
        container.destroy();
    }

    destroy() {
        this.hide();
    }
}
