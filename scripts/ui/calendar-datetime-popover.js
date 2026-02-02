export class FGCalendarDateTimePopover {
    static enhance(root) {
        const nodes = root.querySelectorAll("[data-fg-dtp]");
        console.log("Enhancing FGCalendarDateTimePopover on", nodes.length, nodes);
        for (const el of nodes) this.#wireOne(el);
    }

    static #wireOne(el) {
        const calendar = game.time.calendar;
        const cfg = CONFIG.time?.worldCalendarConfig;

        const hidden = el.querySelector('input[type="hidden"]');
        const display = el.querySelector(".fg-dtp-display");
        const pop = el.querySelector(".fg-dtp-popover");
        const hint = el.querySelector(".fg-hint");

        const yearEl = el.querySelector(".fg-year");
        const monthEl = el.querySelector(".fg-month");
        const dayEl = el.querySelector(".fg-day");
        const hourEl = el.querySelector(".fg-hour");
        const minuteEl = el.querySelector(".fg-minute");

        const btnToggle = el.querySelector('[data-action="toggle"]');
        const btnClear = el.querySelector('[data-action="clear"]');
        const btnApply = el.querySelector('[data-action="apply"]');
        const btnClose = el.querySelector('[data-action="close"]');

        const required = (el.dataset.required === "true");

        // Calendar config
        const months = cfg?.months?.values ?? [];
        const daysCfg = cfg?.days ?? {};
        const hoursPerDay = daysCfg.hoursPerDay ?? 24;
        const minutesPerHour = daysCfg.minutesPerHour ?? 60;

        // Populate months
        monthEl.innerHTML = months.map((m, idx) => {
            console.log("month", m, idx);
            const value = (idx);
            const raw = (m.name ?? m.abbreviation ?? `Month ${idx + 1}`);
            // Calendar month names may be localization keys (e.g. "TIME.Months.January")
            const label = (typeof raw === "string") ? game.i18n.localize(raw) : String(raw);
            return `<option value="${value}">${label}</option>`;
        }).join("");

        // Time constraints
        hourEl.min = "0";
        hourEl.max = String(hoursPerDay - 1);
        minuteEl.min = "0";
        minuteEl.max = String(minutesPerHour - 1);

        // days in month helper
        const getDaysInMonth = (year, month) => {
            if (typeof calendar.daysInMonth === "function") return calendar.daysInMonth({ year, month });
            const mm = months[month] ?? months[0];
            return mm?.days ?? 30;
        };

        const dayAndMonthToDays = (year, month, day) => {
            let total = 0;
            for (let m = 0; m < month; m++) {
                total += getDaysInMonth(year, m);
            }
            return total + day - 1;
        }

        const clampDay = () => {
            const y = Number(yearEl.value || 0);
            const m = Number(monthEl.value || 0);
            const max = getDaysInMonth(y, m);
            dayEl.max = String(max);
            const d = Number(dayEl.value || 1);
            if (d < 1) dayEl.value = "1";
            if (d > max) dayEl.value = String(max);
        };

        const readFromHidden = () => {
            // We store seconds (recommended). If empty and required: default to now.
            console.log("FGCalendarDateTimePopover reading from hidden", hidden.value);
            let seconds = Number(hidden.value);
            console.log("FGCalendarDateTimePopover parsed seconds", seconds);
            if (!Number.isFinite(seconds)) {
                if (required) seconds = game.time.worldTime;
                else {
                    // optional blank
                    display.value = "";
                    hint.textContent = "";
                    return;
                }
            }

            const comps = calendar.timeToComponents(seconds);
            console.log("FGCalendarDateTimePopover computed components", comps);

            yearEl.value = String(comps.year ?? 0);
            monthEl.value = String(comps.month ?? 0);
            dayEl.value = String(comps.dayOfMonth + 1);
            hourEl.value = String(comps.hour ?? 0);
            minuteEl.value = String(comps.minute ?? 0);

            clampDay();
            display.value = FGCalendarDateTimePopover.#formatDisplay(calendar, seconds);
            hint.textContent = ""; // keep clean for now
        };

        const writeToHidden = () => {
            clampDay();
            const days = dayAndMonthToDays(Number(yearEl.value), Number(monthEl.value), Number(dayEl.value));
            const comps = {
                year: Number(yearEl.value),
                day: Number(days),
                hour: Number(hourEl.value),
                minute: Number(minuteEl.value),
                second: 0,
            };

            console.log("FGCalendarDateTimePopover writing components", comps);

            const seconds = calendar.componentsToTime(comps);
            console.log("FGCalendarDateTimePopover computed seconds", seconds);
            hidden.value = String(seconds);
            display.value = FGCalendarDateTimePopover.#formatDisplay(calendar, seconds);
        };

        const open = () => {
            readFromHidden();
            pop.hidden = false;
            FGCalendarDateTimePopover.#positionPopover(el, pop);
            // focus first input
            yearEl.focus();
        };

        const close = () => { pop.hidden = true; };

        // click outside to close
        const onDocMouseDown = (ev) => {
            if (pop.hidden) return;
            if (el.contains(ev.target)) return;
            close();
        };

        // Reposition on scroll/resize while open
        const onWin = () => { if (!pop.hidden) FGCalendarDateTimePopover.#positionPopover(el, pop); };

        btnToggle?.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (pop.hidden) open();
            else close();
        });

        btnClose?.addEventListener("click", (ev) => {
            ev.preventDefault();
            close();
        });

        btnApply?.addEventListener("click", (ev) => {
            ev.preventDefault();
            writeToHidden();
            close();
        });

        btnClear?.addEventListener("click", (ev) => {
            ev.preventDefault();
            hidden.value = "";
            display.value = "";
            hint.textContent = "";
            close();
        });

        // Live clamp day on month/year change
        yearEl.addEventListener("change", clampDay);
        monthEl.addEventListener("change", clampDay);

        // Optional: apply instantly on change (no need to press Apply)
        // If you prefer "Apply only", comment these lines.
        dayEl.addEventListener("change", writeToHidden);
        hourEl.addEventListener("change", writeToHidden);
        minuteEl.addEventListener("change", writeToHidden);

        document.addEventListener("mousedown", onDocMouseDown);
        window.addEventListener("resize", onWin);
        window.addEventListener("scroll", onWin, true);

        // Initial display fill
        readFromHidden();
    }

    static #formatDisplay(calendar, seconds) {
        // Keep formatting isolated so you can replace later with a “fantasy” formatter or localization
        console.log("FGCalendarDateTimePopover formatDisplay seconds", seconds);
        const comps = calendar.timeToComponents(seconds);
        console.log("FGCalendarDateTimePopover formatDisplay components", comps);
        // If calendar.format supports a "timestamp" style, use it. Otherwise fallback.
        try {
            console.log("FGCalendarDateTimePopover formatDisplay trying timestamp", calendar.format(comps, "timestamp"));
            return calendar.format(comps, "timestamp");
        } catch (e) {
            // fallback: show components
            const y = comps.year ?? 0;
            const m = (comps.month ?? 0);
            const d = (comps.dayOfMonth ?? 1);
            const hh = String(comps.hour ?? 0).padStart(2, "0");
            const mm = String(comps.minute ?? 0).padStart(2, "0");
            return `${y}-${m}-${d} ${hh}:${mm}`;
        }
    }

    static #positionPopover(wrapperEl, popEl) {
        // position below the input row
        const row = wrapperEl.querySelector(".fg-dtp-row");
        const r = row.getBoundingClientRect();

        // Use fixed positioning so it doesn't get clipped by window scroll containers
        popEl.style.position = "fixed";
        //    popEl.style.left = `${Math.round(r.left)}px`;
        //    popEl.style.top = `${Math.round(r.bottom + 4)}px`;
        popEl.style.zIndex = "99999";
        //popEl.style.minWidth = `${Math.round(r.width)}px`;
        popEl.style.minWidth = `400px`;

        // Make sure we can measure it reliably
        const prevVis = popEl.style.visibility;
        popEl.style.visibility = "hidden";
        popEl.hidden = false;

        // First guess: below the row
        let left = Math.round(r.left);
        let top = Math.round(r.bottom + 4);

        // Measure
        const pr = popEl.getBoundingClientRect();
        const pad = 8;

        // If overflow bottom, flip above
        if (top + pr.height > window.innerHeight - pad) {
            top = Math.round(r.top - pr.height - 4);
        }
        console.log("popel", popEl)
        console.log("wrapper", wrapperEl)
        console.log(left, top, pr, window.innerWidth, window.innerHeight, pad, r);
        // Clamp to viewport so it never ends up off-screen
        //        left = Math.min(Math.max(left, pad), Math.max(pad, window.innerWidth - pr.width - pad));
        //        top = Math.min(Math.max(top, pad), Math.max(pad, window.innerHeight - pr.height - pad));
        left = (Math.max(left, pad));
        top = (Math.max(top, pad));

        //        popEl.style.left = `${left}px`;
        //        popEl.style.top = `${top}px`;

        // If still too tall (small screens), constrain and allow scrolling
        const maxH = Math.max(120, window.innerHeight - pad * 2);
        popEl.style.maxHeight = `${maxH}px`;
        popEl.style.overflow = "auto";

        popEl.style.visibility = prevVis || "";
    }
}
