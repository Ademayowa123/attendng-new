/*************************************************
 * SETUP-PANEL.JS
 * The "pick a class and term, then generate" panel
 * shared by the Broadsheet and Report Card pages.
 *
 * The real <select id="classSelect"> and <select id="termSelect">
 * stay in the page (hidden) and remain the source of truth, so
 * broadsheet.js / report-card.js keep reading and listening to
 * them exactly as before. This file only draws the class cards
 * and the term control on top, and folds the panel into a single
 * line once a result is on screen.
 *************************************************/

(function () {

    const state =
        { forceOpen: false };

    const NOTICE_IDS =
        ["noClassesNotice", "noSubjectsNotice", "noStudentsNotice"];


    function byId(id) {

        return document.getElementById(id);

    }


    function esc(value) {

        const text =
            (value === null || value === undefined) ? "" : String(value);

        return text.replace(
            /[&<>"']/g,
            ch => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;"
            }[ch])
        );

    }


    // Same tile colours as the Results, Roster and Students pages.
    function classTone(name) {

        const tones =
            ["rs-tone-teal", "rs-tone-indigo", "rs-tone-amber"];

        const digits =
            String(name || "").match(/\d+/);

        if (digits) {

            return tones[(((parseInt(digits[0], 10) - 1) % 3) + 3) % 3];

        }

        let sum = 0;

        String(name || "").split("").forEach(
            ch => { sum += ch.charCodeAt(0); }
        );

        return tones[sum % 3];

    }


    function plural(count, word) {

        return `${count} ${word}${Number(count) === 1 ? "" : "s"}`;

    }


    function selectedText(select) {

        const option =
            select.options[select.selectedIndex];

        return option ? option.textContent : "";

    }


    function isShown(element) {

        return !!element && window.getComputedStyle(element).display !== "none";

    }


    /* ---------- drawing ---------- */

    function buildClassCards() {

        const select =
            byId("classSelect");

        const host =
            byId("classCards");

        const single =
            select.options.length <= 1 || select.disabled;

        host.innerHTML =
            Array.from(select.options).map(
                option => `
                    <button type="button" class="sp-cls" data-value="${esc(option.value)}" aria-pressed="false"${single ? " disabled" : ""}>
                        <span class="rs-tile ${classTone(option.textContent)}">${esc(option.textContent)}</span>
                        <span class="sp-cls-name">${esc(option.textContent)}</span>
                        <i class="fa-solid fa-circle-check sp-tick" aria-hidden="true"></i>
                    </button>
                `
            ).join("");

    }


    function buildTermControl() {

        const select =
            byId("termSelect");

        const current =
            (window.AttendNGContext && AttendNGContext.currentTerm) || "";

        byId("termSeg").innerHTML =
            Array.from(select.options).map(
                option => `
                    <button type="button" class="sp-seg-btn" data-value="${esc(option.value)}" aria-pressed="false">
                        ${esc(option.textContent)}${option.value === current ? `<span class="sp-dot" title="Current term"></span>` : ""}
                    </button>
                `
            ).join("");

    }


    function sessionName() {

        return (window.AttendNGContext && AttendNGContext.sessionName) || "";

    }


    function updateSelection() {

        const classSelect =
            byId("classSelect");

        const termSelect =
            byId("termSelect");

        document.querySelectorAll("#classCards .sp-cls").forEach(
            button => {

                const on =
                    button.dataset.value === classSelect.value;

                button.classList.toggle("is-on", on);

                button.setAttribute("aria-pressed", String(on));

            }
        );

        document.querySelectorAll("#termSeg .sp-seg-btn").forEach(
            button => {

                const on =
                    button.dataset.value === termSelect.value;

                button.classList.toggle("is-on", on);

                button.setAttribute("aria-pressed", String(on));

            }
        );

        const className =
            selectedText(classSelect);

        const term =
            selectedText(termSelect);

        const session =
            sessionName();

        const when =
            session ? `${term}, ${session}` : term;

        byId("spSummary").textContent =
            className ? `${className} · ${when}` : when;

        byId("spTile").textContent =
            className;

        byId("spTile").className =
            "rs-tile " + classTone(className);

        byId("spFoldedTitle").textContent =
            when;

    }


    function readCounts() {

        const students =
            byId("cardStudents");

        const subjects =
            byId("cardSubjects");

        if (students) {

            return [
                plural(students.textContent, "student"),
                subjects ? plural(subjects.textContent, "subject") : ""
            ].filter(Boolean).join(" · ");

        }

        const studentSelect =
            byId("studentSelect");

        if (studentSelect && studentSelect.options.length > 1) {

            return plural(studentSelect.options.length - 1, "student");

        }

        return "";

    }


    // Fold when a result is on screen; show the empty preview only
    // when there is neither a result nor a "no subjects / students" notice.
    function refresh() {

        const panel =
            byId("setupPanel");

        const resultVisible =
            isShown(byId(panel.dataset.result));

        if (!resultVisible) {

            state.forceOpen = false;

        }

        panel.classList.toggle("is-folded", resultVisible && !state.forceOpen);

        byId("spPlaceholder").hidden =
            resultVisible || NOTICE_IDS.some(id => isShown(byId(id)));

        byId("spFoldedMeta").textContent =
            readCounts();

    }


    function choose(select, value) {

        if (select.value === value) {

            return;

        }

        select.value =
            value;

        // The page script listens for this and clears the stale result.
        select.dispatchEvent(new Event("change", { bubbles: true }));

        updateSelection();

        refresh();

    }


    function sync() {

        buildClassCards();

        buildTermControl();

        updateSelection();

        refresh();

    }


    function init() {

        const panel =
            byId("setupPanel");

        if (!panel) {

            return;

        }

        byId("classCards").addEventListener(
            "click",
            (event) => {

                const button =
                    event.target.closest(".sp-cls");

                if (button && !button.disabled) {

                    choose(byId("classSelect"), button.dataset.value);

                }

            }
        );

        byId("termSeg").addEventListener(
            "click",
            (event) => {

                const button =
                    event.target.closest(".sp-seg-btn");

                if (button) {

                    choose(byId("termSelect"), button.dataset.value);

                }

            }
        );

        byId("spChange").addEventListener(
            "click",
            () => {

                state.forceOpen = true;

                refresh();

                const first =
                    document.querySelector("#classCards .sp-cls.is-on") ||
                    document.querySelector("#termSeg .sp-seg-btn.is-on");

                if (first) {

                    first.focus();

                }

            }
        );

        byId("generateBtn").addEventListener(
            "click",
            () => { state.forceOpen = false; }
        );

        // Keep the page in step if the scripts change either select directly.
        byId("classSelect").addEventListener("change", updateSelection);
        byId("termSelect").addEventListener("change", updateSelection);

        // The page scripts show and hide the result and the notices by
        // changing their inline style — watch for that.
        const observer =
            new MutationObserver(refresh);

        [panel.dataset.result].concat(NOTICE_IDS).forEach(
            id => {

                const element =
                    byId(id);

                if (element) {

                    observer.observe(element, { attributes: true, attributeFilter: ["style"] });

                }

            }
        );

        const studentSelect =
            byId("studentSelect");

        if (studentSelect) {

            observer.observe(studentSelect, { childList: true });

            initStudentDropdown();

        }

        sync();

    }


    /* ---------- "Show" student dropdown (Report Card) ----------
       The real <select id="studentSelect"> stays in the page, hidden,
       and report-card.js keeps filling it and listening to it. This is
       a searchable face for it — handy when a class has dozens of names. */

    function initStudentDropdown() {

        const select =
            byId("studentSelect");

        const button =
            byId("studentBtn");

        const menu =
            byId("studentMenu");

        const list =
            byId("studentOptions");

        const filter =
            byId("studentFilter");

        const empty =
            byId("studentEmpty");

        if (!button || !menu || !list || !filter) {

            return;

        }

        let items =
            [];


        function optionHtml(option) {

            if (option.value === "all") {

                return `
                    <button type="button" class="se-opt" role="option" data-value="all" data-search="">
                        <span class="sp-opt-av sp-opt-all"><i class="fa-solid fa-users" aria-hidden="true"></i></span>
                        <span class="sp-opt-name">${esc(option.textContent)}</span>
                        <i class="fa-solid fa-check se-check" aria-hidden="true"></i>
                    </button>
                    <div class="sp-sep" aria-hidden="true"></div>
                `;

            }

            const text =
                option.textContent.trim();

            const space =
                text.indexOf(" ");

            const surname =
                space === -1 ? text : text.slice(0, space);

            const rest =
                space === -1 ? "" : text.slice(space + 1);

            const initials =
                ((surname.charAt(0) || "") + (rest.charAt(0) || "")).toUpperCase() || "?";

            let hash = 0;

            text.split("").forEach(
                ch => { hash += ch.charCodeAt(0); }
            );

            return `
                <button type="button" class="se-opt" role="option" data-value="${esc(option.value)}" data-search="${esc(text.toLowerCase())}">
                    <span class="sp-opt-av rs-av-${hash % 5}">${esc(initials)}</span>
                    <span class="sp-opt-name"><b>${esc(surname)}</b> ${esc(rest)}</span>
                    <i class="fa-solid fa-check se-check" aria-hidden="true"></i>
                </button>
            `;

        }


        function build() {

            close(false);

            list.innerHTML =
                Array.from(select.options).map(optionHtml).join("");

            items =
                Array.from(list.querySelectorAll(".se-opt"));

            syncStudent();

        }


        function syncStudent() {

            const option =
                select.options[select.selectedIndex];

            byId("studentValue").textContent =
                option ? option.textContent.trim() : "All students";

            items.forEach(
                item => {

                    const on =
                        item.dataset.value === select.value;

                    item.classList.toggle("is-selected", on);

                    item.setAttribute("aria-selected", String(on));

                }
            );

        }


        function visibleItems() {

            return items.filter(item => !item.hidden);

        }


        function applyFilter() {

            const tokens =
                filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);

            let shown = 0;

            items.forEach(
                item => {

                    // "All students" only shows when nothing is typed.
                    const match =
                        item.dataset.value === "all" ?
                            tokens.length === 0 :
                            tokens.every(token => item.dataset.search.includes(token));

                    item.hidden =
                        !match;

                    if (match) {

                        shown++;

                    }

                }
            );

            const separator =
                list.querySelector(".sp-sep");

            if (separator) {

                separator.hidden =
                    tokens.length > 0;

            }

            empty.hidden =
                shown !== 0;

        }


        function open() {

            filter.value =
                "";

            applyFilter();

            menu.hidden =
                false;

            button.setAttribute("aria-expanded", "true");

            const selected =
                items.find(item => item.classList.contains("is-selected"));

            if (selected) {

                list.scrollTop =
                    Math.max(0, selected.offsetTop - list.clientHeight / 2 + selected.offsetHeight / 2);

            }

            filter.focus();

        }


        function close(returnFocus) {

            menu.hidden =
                true;

            button.setAttribute("aria-expanded", "false");

            if (returnFocus) {

                button.focus();

            }

        }


        function choose(value) {

            const changed =
                select.value !== value;

            select.value =
                value;

            syncStudent();

            close(true);

            // report-card.js listens for this and shows that student's card.
            if (changed) {

                select.dispatchEvent(new Event("change", { bubbles: true }));

            }

        }


        button.addEventListener(
            "click",
            (event) => {

                event.stopPropagation();

                if (menu.hidden) {

                    open();

                }
                else {

                    close(false);

                }

            }
        );

        button.addEventListener(
            "keydown",
            (event) => {

                if ((event.key === "ArrowDown" || event.key === "ArrowUp") && menu.hidden) {

                    event.preventDefault();

                    open();

                }

            }
        );

        filter.addEventListener("input", applyFilter);

        menu.addEventListener("click", event => event.stopPropagation());

        list.addEventListener(
            "click",
            (event) => {

                const item =
                    event.target.closest(".se-opt");

                if (item) {

                    choose(item.dataset.value);

                }

            }
        );

        menu.addEventListener(
            "keydown",
            (event) => {

                const shown =
                    visibleItems();

                const index =
                    shown.indexOf(document.activeElement);

                if (event.key === "Escape") {

                    event.preventDefault();

                    close(true);

                }
                else if (event.key === "Tab") {

                    close(false);

                }
                else if (event.key === "ArrowDown") {

                    event.preventDefault();

                    if (shown.length) {

                        shown[Math.min(index + 1, shown.length - 1)].focus();

                    }

                }
                else if (event.key === "ArrowUp") {

                    event.preventDefault();

                    if (index <= 0) {

                        filter.focus();

                    }
                    else {

                        shown[index - 1].focus();

                    }

                }
                else if (event.key === "Home" && index !== -1) {

                    event.preventDefault();

                    shown[0].focus();

                }
                else if (event.key === "End" && index !== -1) {

                    event.preventDefault();

                    shown[shown.length - 1].focus();

                }
                else if (event.key === "Enter" && document.activeElement === filter) {

                    // Enter in the search box picks the first match.
                    event.preventDefault();

                    const first =
                        shown.find(item => item.dataset.value !== "all") || shown[0];

                    if (first) {

                        choose(first.dataset.value);

                    }

                }

            }
        );

        document.addEventListener(
            "click",
            () => {

                if (!menu.hidden) {

                    close(false);

                }

            }
        );

        // report-card.js refills the list for each generated class.
        new MutationObserver(build).observe(select, { childList: true });

        select.addEventListener("change", syncStudent);

        build();

    }


    window.SetupPanel =
        { sync, refresh };

    document.addEventListener("DOMContentLoaded", init);

})();