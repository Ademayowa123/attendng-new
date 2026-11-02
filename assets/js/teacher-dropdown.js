/*************************************************
 * TEACHER-DROPDOWN.JS
 *
 * Reusable avatar dropdown used wherever a teacher
 * is picked (Class subjects page, Classes sheet).
 *
 *   const dd = createTeacherDropdown({
 *       options: [{ value: "id", label: "Full Name" }],
 *       value: currentId,            // "" / null = not assigned
 *       ariaLabel: "Teacher for Maths",
 *       placeholder: "Assign a teacher",   // optional
 *       emptyLabel: "Not assigned",        // optional
 *       onChange: (value) => { ... }       // value is "" when cleared
 *   });
 *   container.appendChild(dd);
 *
 * Desktop: floating panel under the button (flips upward
 * when there's no room below). Phones: bottom sheet.
 * Keyboard: Arrow keys, Home/End, Enter, Esc, Tab.
 *************************************************/

(function () {

    "use strict";

    const TONES = ["teal", "indigo", "amber", "green", "rose", "sky"];

    const ICON_CHEVRON =
        '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7.5l5 5 5-5"/></svg>';

    const ICON_CHECK =
        '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';

    const ICON_USER_PLUS =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M19 8v6M16 11h6"/></svg>';

    const ICON_SEARCH =
        '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="M13.5 13.5L17 17"/></svg>';

    let openInstance = null;
    let counter = 0;


    function esc(value) {

        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    }

    function initials(name) {

        const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

        if (!parts.length) {

            return "?";

        }

        if (parts.length === 1) {

            return parts[0].slice(0, 2).toUpperCase();

        }

        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

    }

    // Same hash as the Teachers page, so a person keeps the
    // same avatar colour everywhere in the app.

    function tone(name) {

        let hash = 0;

        for (const ch of String(name || "")) {

            hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

        }

        return TONES[hash % TONES.length];

    }


    // One dropdown open at a time; tapping elsewhere closes it.

    document.addEventListener("pointerdown", (e) => {

        if (openInstance && !openInstance.root.contains(e.target)) {

            openInstance.close();

        }

    });

    // Capture phase + stopPropagation so Esc only closes the
    // dropdown, not a detail sheet that happens to be open too.

    document.addEventListener("keydown", (e) => {

        if (e.key === "Escape" && openInstance) {

            e.preventDefault();

            e.stopPropagation();

            const inst = openInstance;

            inst.close();

            inst.trigger.focus();

        }

    }, true);


    window.createTeacherDropdown = function (config) {

        const id = ++counter;

        const emptyLabel = config.emptyLabel || "Not assigned";

        const placeholder = config.placeholder || "Assign a teacher";

        const people = (config.options || []).map(
            o => ({ value: String(o.value), label: String(o.label) })
        );

        let value = config.value ? String(config.value) : "";

        let visible = [];

        let activeIdx = -1;


        const root = document.createElement("div");

        root.className = "dd";

        root.innerHTML = `
            <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="dd-list-${id}" aria-label="${esc(config.ariaLabel || "Teacher")}">
                <span class="dd-av"></span>
                <span class="dd-label"></span>
                <span class="dd-chev-wrap">${ICON_CHEVRON}</span>
            </button>
            <div class="dd-backdrop"></div>
            <div class="dd-panel" hidden>
                <div class="dd-search">
                    ${ICON_SEARCH}
                    <input type="search" placeholder="Search teachers" aria-label="Search teachers" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="dd-list-${id}">
                </div>
                <div class="dd-list" id="dd-list-${id}" role="listbox"></div>
            </div>
        `;

        const trigger = root.querySelector(".dd-trigger");
        const avatarEl = root.querySelector(".dd-av");
        const labelEl = root.querySelector(".dd-label");
        const backdrop = root.querySelector(".dd-backdrop");
        const panel = root.querySelector(".dd-panel");
        const search = root.querySelector(".dd-search input");
        const list = root.querySelector(".dd-list");

        if (config.disabled) {

            trigger.disabled = true;

        }


        function updateTrigger() {

            const person = people.find(p => p.value === value);

            avatarEl.className =
                person ? `dd-av tm-tone-${tone(person.label)}` : "dd-av dd-av-empty";

            avatarEl.innerHTML =
                person ? esc(initials(person.label)) : ICON_USER_PLUS;

            labelEl.className =
                person ? "dd-label" : "dd-label is-placeholder";

            labelEl.textContent =
                person ? person.label : placeholder;

        }


        function renderList() {

            const q = search.value.trim().toLowerCase();

            const rows = [{ value: "", label: emptyLabel, isEmpty: true }, ...people];

            visible = rows.filter(
                r => !q || r.label.toLowerCase().includes(q)
            );

            if (!visible.length) {

                list.innerHTML =
                    `<div class="dd-empty">No teachers match “${esc(search.value.trim())}”</div>`;

                search.removeAttribute("aria-activedescendant");

                return;

            }

            list.innerHTML = visible.map((r, i) => {

                const selected = r.value === value;

                const avatar =
                    r.isEmpty ?
                        `<span class="dd-av dd-av-empty">${ICON_USER_PLUS}</span>` :
                        `<span class="dd-av tm-tone-${tone(r.label)}">${esc(initials(r.label))}</span>`;

                return `
                    <div class="dd-opt${selected ? " is-selected" : ""}${i === activeIdx ? " is-active" : ""}" role="option" id="dd-opt-${id}-${i}" aria-selected="${selected}" data-idx="${i}">
                        ${avatar}
                        <span class="dd-opt-name${r.isEmpty ? " is-muted" : ""}">${esc(r.label)}</span>
                        <span class="dd-check">${selected ? ICON_CHECK : ""}</span>
                    </div>
                `;

            }).join("");

        }


        function setActive(idx) {

            if (!visible.length) {

                return;

            }

            activeIdx = Math.max(0, Math.min(visible.length - 1, idx));

            [...list.children].forEach((el, i) => {

                el.classList.toggle("is-active", i === activeIdx);

            });

            const el = list.children[activeIdx];

            if (el) {

                search.setAttribute("aria-activedescendant", el.id);

                el.scrollIntoView({ block: "nearest" });

            }

        }


        function select(newValue) {

            const changed = newValue !== value;

            value = newValue;

            updateTrigger();

            close();

            trigger.focus();

            if (changed && typeof config.onChange === "function") {

                config.onChange(value);

            }

        }


        function open() {

            if (openInstance && openInstance !== instance) {

                openInstance.close();

            }

            openInstance = instance;

            search.value = "";

            activeIdx = 0;

            renderList();

            panel.hidden = false;

            root.classList.add("is-open");

            trigger.classList.add("is-open");

            trigger.setAttribute("aria-expanded", "true");

            // Desktop: flip upward when there isn't room below.

            root.classList.remove("dd-up");

            if (window.innerWidth > 560) {

                const rect = trigger.getBoundingClientRect();

                const needed = panel.offsetHeight + 16;

                const below = window.innerHeight - rect.bottom;

                if (below < needed && rect.top > below) {

                    root.classList.add("dd-up");

                }

            }

            const selectedIdx = visible.findIndex(r => r.value === value);

            setActive(selectedIdx >= 0 ? selectedIdx : 0);

            // On touch devices skip auto-focus so the keyboard
            // doesn't cover the list; tap the search box if wanted.

            if (!window.matchMedia("(pointer: coarse)").matches) {

                search.focus();

            }

        }


        function close() {

            panel.hidden = true;

            root.classList.remove("is-open", "dd-up");

            trigger.classList.remove("is-open");

            trigger.setAttribute("aria-expanded", "false");

            if (openInstance === instance) {

                openInstance = null;

            }

        }


        const instance = { root, trigger, close };


        trigger.addEventListener("click", () => {

            if (root.classList.contains("is-open")) {

                close();

            }
            else {

                open();

            }

        });

        trigger.addEventListener("keydown", (e) => {

            if (e.key === "ArrowDown" || e.key === "ArrowUp") {

                e.preventDefault();

                if (!root.classList.contains("is-open")) {

                    open();

                }

            }

        });

        backdrop.addEventListener("click", close);

        list.addEventListener("click", (e) => {

            const el = e.target.closest(".dd-opt");

            if (!el) {

                return;

            }

            const row = visible[Number(el.dataset.idx)];

            if (row) {

                select(row.value);

            }

        });

        search.addEventListener("input", () => {

            activeIdx = 0;

            renderList();

            if (visible.length) {

                setActive(0);

            }

        });

        search.addEventListener("keydown", (e) => {

            if (e.key === "ArrowDown") {

                e.preventDefault();

                setActive(activeIdx + 1);

            }
            else if (e.key === "ArrowUp") {

                e.preventDefault();

                setActive(activeIdx - 1);

            }
            else if (e.key === "Home") {

                e.preventDefault();

                setActive(0);

            }
            else if (e.key === "End") {

                e.preventDefault();

                setActive(visible.length - 1);

            }
            else if (e.key === "Enter") {

                e.preventDefault();

                if (visible[activeIdx]) {

                    select(visible[activeIdx].value);

                }

            }
            else if (e.key === "Tab") {

                close();

            }

        });


        updateTrigger();

        return root;

    };

})();