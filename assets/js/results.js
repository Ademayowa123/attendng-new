/*************************************************
 * RESULTS.JS
 *************************************************/

let myAssignments = [];    // this teacher's class_subjects, with class + subject names joined in
let selectedAssignmentId = null;
let students = [];
let scoresMap = {};        // student_id -> { id (score row id, if saved), ca_score, exam_score }
let drafts = {};           // student_id -> { ca_score, exam_score } while a box is being typed in, before it is saved
let rowEls = {};           // student_id -> that student's row element
let activeFilter = "all";  // all | missing | done
let searchTerm = "";
let shownCount = 0;


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    document.getElementById("termLabel").textContent =
        AttendNGContext.currentTerm ?
            `${AttendNGContext.currentTerm} — ${AttendNGContext.sessionName || ""}` :
            "";

    bindUI();

    await loadMyAssignments();

});


function waitForContext() {

    return new Promise(
        (resolve) => {

            const check =
                () => {

                    if (AttendNGContext.loaded) {

                        resolve();

                    }
                    else {

                        setTimeout(check, 50);

                    }

                };

            check();

        }
    );

}


/* ==========================================
   LOAD
========================================== */

// The teacher's subject list hardly ever changes, so it is kept in the
// browser for a few minutes. The page then goes straight to the students
// and re-checks the list quietly in the background.

const ASSIGNMENTS_CACHE_KEY = "attendng_assignments_v1";
const ASSIGNMENTS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;


function readAssignmentsCache() {

    try {

        const saved =
            JSON.parse(localStorage.getItem(ASSIGNMENTS_CACHE_KEY));

        if (
            saved &&
            saved.memberId === AttendNGContext.memberId &&
            saved.sessionId === AttendNGContext.sessionId &&
            Array.isArray(saved.rows) &&
            Date.now() - saved.savedAt < ASSIGNMENTS_CACHE_MAX_AGE_MS
        ) {

            return saved.rows;

        }

    }
    catch (error) {

        // Unreadable or blocked storage: act as if nothing is saved.

    }

    return null;

}


function writeAssignmentsCache(rows) {

    try {

        localStorage.setItem(
            ASSIGNMENTS_CACHE_KEY,
            JSON.stringify({
                memberId: AttendNGContext.memberId,
                sessionId: AttendNGContext.sessionId,
                savedAt: Date.now(),
                rows
            })
        );

    }
    catch (error) {

        // Not saved; everything still works.

    }

}


async function fetchMyAssignments() {

    const {
        data,
        error

    } =
        await supabaseClient
            .from("class_subjects")
            .select(
                `
                id,
                classes ( id, name, is_finalized ),
                subjects ( id, name )
                `
            )
            .eq("teacher_id", AttendNGContext.memberId);

    if (error) {

        throw error;

    }

    return (data || [])
        .filter(row => row.classes && row.subjects) // drop any orphaned rows
        .map(
            row => ({
                id: row.id,
                class_id: row.classes.id,
                class_name: row.classes.name,
                class_is_finalized: row.classes.is_finalized,
                subject_name: row.subjects.name
            })
        )
        .sort(
            (a, b) =>
                a.class_name.localeCompare(b.class_name) ||
                a.subject_name.localeCompare(b.subject_name)
        );

}


// Shows the class & subject cards. Returns false if the teacher has none.
function showAssignments(rows) {

    myAssignments =
        rows;

    const section =
        byId("assignmentSection");

    const noAssignmentsNotice =
        byId("noAssignmentsNotice");

    const scoresCard =
        byId("scoresCard");


    if (myAssignments.length === 0) {

        section.style.display =
            "none";

        noAssignmentsNotice.style.display =
            "block";

        scoresCard.style.display =
            "none";

        return false;

    }

    section.style.display =
        "block";

    noAssignmentsNotice.style.display =
        "none";


    if (!myAssignments.some(a => a.id === selectedAssignmentId)) {

        selectedAssignmentId =
            myAssignments[0].id;

    }

    renderPicker();

    return true;

}


async function loadMyAssignments() {

    const cachedRows =
        readAssignmentsCache();

    if (cachedRows) {

        // Fast path: show the saved list and fetch the students at once.

        const hasAny =
            showAssignments(cachedRows);

        const studentsLoading =
            hasAny ? loadStudentsAndScores() : Promise.resolve();

        // Meanwhile, check the list is still right.
        fetchMyAssignments()
            .then(
                async (freshRows) => {

                    writeAssignmentsCache(freshRows);

                    if (JSON.stringify(freshRows) === JSON.stringify(cachedRows)) {

                        return;

                    }

                    // The admin changed this teacher's subjects.
                    const previousId =
                        selectedAssignmentId;

                    const stillAny =
                        showAssignments(freshRows);

                    if (stillAny && selectedAssignmentId !== previousId) {

                        await loadStudentsAndScores();

                    }

                }
            )
            .catch(
                error => console.warn("Subject list refresh failed:", error)
            );

        await studentsLoading;

        return;

    }


    let rows;

    try {

        rows =
            await fetchMyAssignments();

    }
    catch (error) {

        console.error(
            "Unable to load your assignments:",
            error
        );

        return;

    }

    writeAssignmentsCache(rows);

    if (showAssignments(rows)) {

        await loadStudentsAndScores();

    }

}


/* ==========================================
   SMALL HELPERS
========================================== */

function byId(id) {

    return document.getElementById(id);

}


function rsEscape(value) {

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


function hashText(text) {

    let sum = 0;

    String(text || "").split("").forEach(
        ch => { sum += ch.charCodeAt(0); }
    );

    return sum;

}


// Class tile colour: JSS1 / Basic 1 teal, 2 indigo, 3 amber, then repeats.
function classTone(name) {

    const tones =
        ["rs-tone-teal", "rs-tone-indigo", "rs-tone-amber"];

    const digits =
        String(name || "").match(/\d+/);

    if (digits) {

        const n =
            parseInt(digits[0], 10);

        return tones[(((n - 1) % 3) + 3) % 3];

    }

    return tones[hashText(name) % 3];

}


function avatarTone(name) {

    return hashText(name) % 5;

}


function gradeTone(letter) {

    if (["A", "B", "C", "P", "F"].includes(letter)) {

        return "g-" + letter;

    }

    // A grade letter the scale has added later: fall back on its badge colour.
    const badge =
        gradeBadgeClass(letter);

    if (badge === "badge-success") return "g-B";
    if (badge === "badge-warning") return "g-P";

    return "g-F";

}


function formatNumber(value) {

    return Number.isInteger(value) ?
        String(value) :
        String(Math.round(value * 10) / 10);

}


function isEntered(value) {

    return value !== null && value !== undefined && value !== "";

}


// What a student's row currently shows, from either the saved
// scores or what is being typed into the boxes right now.
function effectiveScores(studentId) {

    return drafts[studentId] ||
        scoresMap[studentId] ||
        { ca_score: null, exam_score: null };

}


function describeRow(values) {

    const hasCA =
        isEntered(values.ca_score);

    const hasExam =
        isEntered(values.exam_score);

    if (hasCA && hasExam) {

        const total =
            Math.round((Number(values.ca_score) + Number(values.exam_score)) * 100) / 100;

        return {
            status: "done",
            total,
            grade: gradeFor(total),
            label: null
        };

    }

    return {
        status: hasCA ? "no-exam" : hasExam ? "no-ca" : "none",
        total: null,
        grade: null,
        label: hasCA ? "Exam missing" : hasExam ? "CA missing" : "Not started"
    };

}


/* ==========================================
   CLASS & SUBJECT CARDS
========================================== */

function renderPicker() {

    const picker =
        byId("assignmentPicker");

    picker.innerHTML =
        myAssignments.map(
            a => {

                const selected =
                    a.id === selectedAssignmentId;

                return `
                    <button type="button" class="rs-pick${selected ? " is-selected" : ""}"
                            data-id="${rsEscape(a.id)}" aria-pressed="${selected}">
                        <span class="rs-tile ${classTone(a.class_name)}">${rsEscape(a.class_name)}</span>
                        <span class="rs-pick-text">
                            <strong>${rsEscape(a.subject_name)}</strong>
                            <span>${rsEscape(a.class_name)}</span>
                        </span>
                        <span class="rs-tick" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
                    </button>
                `;

            }
        ).join("");

    scrollPickerToSelected();

}


function updatePickerSelection() {

    byId("assignmentPicker").querySelectorAll(".rs-pick").forEach(
        button => {

            const selected =
                button.dataset.id === String(selectedAssignmentId);

            button.classList.toggle("is-selected", selected);

            button.setAttribute("aria-pressed", String(selected));

        }
    );

    scrollPickerToSelected();

}


// With many assignments the row scrolls sideways; keep the chosen card in view.
function scrollPickerToSelected() {

    const picker =
        byId("assignmentPicker");

    const selected =
        picker.querySelector(".rs-pick.is-selected");

    if (!selected) {

        return;

    }

    const left =
        selected.offsetLeft;

    const right =
        left + selected.offsetWidth;

    if (left >= picker.scrollLeft && right <= picker.scrollLeft + picker.clientWidth) {

        return;

    }

    picker.scrollTo({
        left: Math.max(0, left - (picker.clientWidth - selected.offsetWidth) / 2),
        behavior: "smooth"
    });

}


/* ==========================================
   LOAD STUDENTS + SCORES
========================================== */

async function loadStudentsAndScores() {

    const assignment =
        myAssignments.find(a => a.id === selectedAssignmentId);

    if (!assignment) {

        return;

    }

    byId("scoresCard").classList.add("rs-loading");


    let studentsQuery =
        supabaseClient
            .from("students")
            .select("id, surname, first_name, position")
            .eq("class_id", assignment.class_id);

    studentsQuery =
        assignment.class_is_finalized ?
            studentsQuery.order("position") :
            studentsQuery.order("surname").order("first_name");


    // Students and their scores don't depend on each other,
    // so both are requested at the same time.
    const [
        {
            data: studentRows,
            error: studentsError
        },
        {
            data: scoreRows,
            error: scoresError
        }

    ] =
        await Promise.all([

            studentsQuery,

            supabaseClient
                .from("scores")
                .select("id, student_id, ca_score, exam_score")
                .eq("class_subject_id", assignment.id)
                .eq("term", AttendNGContext.currentTerm)

        ]);


    // The teacher switched subject while this was loading.
    if (assignment.id !== selectedAssignmentId) {

        return;

    }


    if (studentsError) {

        console.error(
            "Unable to load students:",
            studentsError
        );

        byId("scoresCard").classList.remove("rs-loading");

        showToast("Unable to load students — try again.");

        return;

    }

    students =
        studentRows;


    scoresMap =
        {};

    students.forEach(
        student => {

            scoresMap[student.id] = {
                id: null,
                ca_score: null,
                exam_score: null
            };

        }
    );


    if (scoresError) {

        console.error(
            "Unable to load existing scores:",
            scoresError
        );

    }
    else {

        (scoreRows || []).forEach(
            row => {

                // Ignore scores of students no longer in this class.
                if (!scoresMap[row.student_id]) {

                    return;

                }

                scoresMap[row.student_id] = {
                    id: row.id,
                    ca_score: row.ca_score,
                    exam_score: row.exam_score
                };

            }
        );

    }


    drafts =
        {};

    resetFilters();

    renderScores();

}


/* ==========================================
   RENDER
========================================== */

function renderScores() {

    const scoresCard =
        byId("scoresCard");

    const content =
        byId("scoresContent");

    const noStudentsNotice =
        byId("noStudentsNotice");


    scoresCard.style.display =
        "block";

    scoresCard.classList.remove("rs-loading");


    if (students.length === 0) {

        content.style.display =
            "none";

        noStudentsNotice.style.display =
            "block";

        rowEls =
            {};

        return;

    }

    content.style.display =
        "block";

    noStudentsNotice.style.display =
        "none";


    renderOverviewHeader();


    const list =
        byId("scoresList");

    list.innerHTML =
        students.map(rowHtml).join("");

    rowEls =
        {};

    list.querySelectorAll(".rs-row").forEach(
        row => {

            rowEls[row.dataset.studentId] = row;

        }
    );


    refreshOverview();

    applyFilter();

}


function renderOverviewHeader() {

    const assignment =
        myAssignments.find(a => a.id === selectedAssignmentId);

    if (!assignment) {

        return;

    }

    const tile =
        byId("ovTile");

    tile.textContent =
        assignment.class_name;

    tile.className =
        "rs-tile " + classTone(assignment.class_name);

    byId("ovSubject").textContent =
        assignment.subject_name;

    byId("ovClass").textContent =
        assignment.class_name;

    byId("ovCount").textContent =
        `${students.length} student${students.length === 1 ? "" : "s"}`;

    const termText =
        [AttendNGContext.currentTerm, AttendNGContext.sessionName]
            .filter(Boolean)
            .join(", ");

    byId("ovTerm").textContent =
        termText;

    byId("ovTerm").parentElement.hidden =
        !termText;

    byId("ovFinal").hidden =
        !assignment.class_is_finalized;

}


function gradeCellHtml(info) {

    if (info.grade) {

        return `
            <span class="rs-gcircle ${gradeTone(info.grade.grade)}" title="${rsEscape(info.grade.remark)}">${rsEscape(info.grade.grade)}</span>
            <span class="rs-remark">${rsEscape(info.grade.remark)}</span>
        `;

    }

    return `
        <span class="rs-gcircle g-none" title="${info.label}">–</span>
        <span class="rs-remark">${info.label}</span>
    `;

}


function barWidth(info) {

    return info.total === null ?
        "0%" :
        Math.max(0, Math.min(100, info.total)) + "%";

}


function rowHtml(student) {

    const values =
        effectiveScores(student.id);

    const info =
        describeRow(values);

    const fullName =
        `${student.surname} ${student.first_name}`;

    const initials =
        (
            (student.surname || "").charAt(0) +
            (student.first_name || "").charAt(0)
        ).toUpperCase() || "?";

    const caValue =
        isEntered(values.ca_score) ? values.ca_score : "";

    const examValue =
        isEntered(values.exam_score) ? values.exam_score : "";

    return `
        <div class="rs-row rs-cols" data-student-id="${rsEscape(student.id)}" data-status="${info.status}">

            <div class="rs-student">
                <span class="rs-avatar rs-av-${avatarTone(fullName)}" aria-hidden="true">${rsEscape(initials)}</span>
                <span class="rs-name">${rsEscape(fullName)}</span>
            </div>

            <div class="rs-ca">
                <span class="rs-cell-label">CA</span>
                <span class="rs-field">
                    <input type="number" class="ca-input" data-student-id="${rsEscape(student.id)}" data-field="ca_score"
                           min="0" max="40" step="1" inputmode="numeric" placeholder="–"
                           value="${caValue}" aria-label="CA score for ${rsEscape(fullName)}">
                    <span class="rs-max">/40</span>
                </span>
            </div>

            <div class="rs-exam">
                <span class="rs-cell-label">Exam</span>
                <span class="rs-field">
                    <input type="number" class="exam-input" data-student-id="${rsEscape(student.id)}" data-field="exam_score"
                           min="0" max="60" step="1" inputmode="numeric" placeholder="–"
                           value="${examValue}" aria-label="Exam score for ${rsEscape(fullName)}">
                    <span class="rs-max">/60</span>
                </span>
            </div>

            <div class="rs-total${info.total === null ? " is-empty" : ""}">
                <span class="rs-cell-label">Total</span>
                <span class="total-num">${info.total === null ? "–" : formatNumber(info.total)}</span>
                <span class="rs-bar"><i class="${info.grade ? gradeTone(info.grade.grade) : ""}" style="width:${barWidth(info)}"></i></span>
            </div>

            <div class="rs-grade">${gradeCellHtml(info)}</div>

        </div>
    `;

}


// Updates one student's total, bar and grade in place (no re-render,
// so the box being typed in keeps its focus and rows never jump).
function refreshRow(studentId) {

    const row =
        rowEls[studentId];

    if (!row) {

        return;

    }

    const info =
        describeRow(effectiveScores(studentId));

    row.dataset.status =
        info.status;

    row.querySelector(".rs-total").classList.toggle("is-empty", info.total === null);

    row.querySelector(".total-num").textContent =
        info.total === null ? "–" : formatNumber(info.total);

    const fill =
        row.querySelector(".rs-bar i");

    fill.className =
        info.grade ? gradeTone(info.grade.grade) : "";

    fill.style.width =
        barWidth(info);

    row.querySelector(".rs-grade").innerHTML =
        gradeCellHtml(info);

}


// Progress ring, the four stats, the grade spread and the filter counts.
// Worked out from what is on screen, so they move as scores are typed.
function refreshOverview() {

    const lastBand =
        GRADE_SCALE[GRADE_SCALE.length - 1].grade;

    const counts =
        {};

    GRADE_SCALE.forEach(band => { counts[band.grade] = 0; });

    let done = 0;
    let sum = 0;
    let highest = null;
    let lowest = null;
    let passed = 0;

    students.forEach(
        student => {

            const info =
                describeRow(effectiveScores(student.id));

            if (info.status !== "done") {

                return;

            }

            done++;

            sum += info.total;

            highest =
                highest === null ? info.total : Math.max(highest, info.total);

            lowest =
                lowest === null ? info.total : Math.min(lowest, info.total);

            counts[info.grade.grade] =
                (counts[info.grade.grade] || 0) + 1;

            if (info.grade.grade !== lastBand) {

                passed++;

            }

        }
    );

    const total =
        students.length;

    const percent =
        total ? Math.round(done / total * 100) : 0;


    const ring =
        byId("ringFill");

    ring.setAttribute("stroke-dasharray", `${percent} 100`);

    ring.style.opacity =
        percent > 0 ? "1" : "0";

    byId("ringPct").textContent =
        `${percent}%`;

    byId("progressCount").textContent =
        `${done} / ${total}`;


    byId("statAverage").textContent =
        done ? (sum / done).toFixed(1) : "–";

    byId("statHighest").textContent =
        done ? formatNumber(highest) : "–";

    byId("statLowest").textContent =
        done ? formatNumber(lowest) : "–";

    byId("statPassRate").textContent =
        done ? `${Math.round(passed / done * 100)}%` : "–";


    byId("spreadLegend").innerHTML =
        GRADE_SCALE.map(
            band => `<li><i class="rs-dot ${gradeTone(band.grade)}"></i>${rsEscape(band.grade)} <b>${counts[band.grade] || 0}</b></li>`
        ).join("");

    const spreadBar =
        byId("spreadBar");

    spreadBar.innerHTML =
        GRADE_SCALE
            .filter(band => counts[band.grade] > 0)
            .map(
                band => `<span class="${gradeTone(band.grade)}" style="flex:${counts[band.grade]} 1 0" title="${rsEscape(band.grade)}: ${counts[band.grade]}"></span>`
            ).join("");

    spreadBar.setAttribute(
        "aria-label",
        "Grade spread: " +
        GRADE_SCALE.map(band => `${band.grade} ${counts[band.grade] || 0}`).join(", ")
    );


    byId("countAll").textContent =
        total;

    byId("countDone").textContent =
        done;

    byId("countMissing").textContent =
        total - done;

}


/* ==========================================
   SEARCH + FILTER
========================================== */

function resetFilters() {

    activeFilter =
        "all";

    searchTerm =
        "";

    byId("studentSearch").value =
        "";

    updateFilterButtons();

}


function updateFilterButtons() {

    document.querySelectorAll(".rs-filter").forEach(
        button => {

            const active =
                button.dataset.filter === activeFilter;

            button.classList.toggle("is-active", active);

            button.setAttribute("aria-pressed", String(active));

        }
    );

}


function applyFilter() {

    const tokens =
        searchTerm.split(/\s+/).filter(Boolean);

    let shown = 0;

    students.forEach(
        student => {

            const row =
                rowEls[student.id];

            if (!row) {

                return;

            }

            const status =
                row.dataset.status;

            const matchesFilter =
                activeFilter === "all" ||
                (activeFilter === "done" ? status === "done" : status !== "done");

            const name =
                `${student.surname} ${student.first_name}`.toLowerCase();

            const matchesSearch =
                tokens.every(token => name.includes(token));

            const visible =
                matchesFilter && matchesSearch;

            row.hidden =
                !visible;

            if (visible) {

                shown++;

            }

        }
    );

    shownCount =
        shown;

    byId("noMatchNotice").hidden =
        shown !== 0;

    byId("showingCount").textContent =
        `Showing ${shown} of ${students.length} student${students.length === 1 ? "" : "s"}`;

}


/* ==========================================
   UI BINDING
========================================== */

function bindUI() {

    byId("assignmentPicker").addEventListener(
        "click",
        async (event) => {

            const button =
                event.target.closest(".rs-pick");

            if (!button) {

                return;

            }

            const assignment =
                myAssignments.find(a => String(a.id) === button.dataset.id);

            if (!assignment || assignment.id === selectedAssignmentId) {

                return;

            }

            selectedAssignmentId =
                assignment.id;

            updatePickerSelection();

            await loadStudentsAndScores();

        }
    );


    byId("studentSearch").addEventListener(
        "input",
        (event) => {

            searchTerm =
                event.target.value.trim().toLowerCase();

            applyFilter();

        }
    );


    document.querySelectorAll(".rs-filter").forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    activeFilter =
                        button.dataset.filter;

                    updateFilterButtons();

                    applyFilter();

                }
            );

        }
    );


    byId("statsToggle").addEventListener(
        "click",
        () => {

            const card =
                byId("overviewCard");

            const open =
                card.classList.toggle("is-open");

            byId("statsToggle").setAttribute("aria-expanded", String(open));

        }
    );


    const list =
        byId("scoresList");

    // Totals, grades and stats follow every keystroke ...
    list.addEventListener(
        "input",
        (event) => {

            const input =
                event.target.closest("input[data-field]");

            if (input) {

                onScoreInput(input);

            }

        }
    );

    // ... and the score is saved when the teacher leaves the box.
    list.addEventListener(
        "focusout",
        (event) => {

            const input =
                event.target.closest("input[data-field]");

            if (input) {

                saveScore(input.dataset.studentId, input.dataset.field, input);

            }

        }
    );

}


/* ==========================================
   LIVE PREVIEW while typing (nothing is saved yet)
========================================== */

function onScoreInput(input) {

    const studentId =
        input.dataset.studentId;

    const row =
        rowEls[studentId];

    if (!row) {

        return;

    }

    const saved =
        scoresMap[studentId] || { ca_score: null, exam_score: null };

    const draft =
        {};

    [["ca_score", 40], ["exam_score", 60]].forEach(
        ([field, max]) => {

            const box =
                row.querySelector(`input[data-field="${field}"]`);

            const raw =
                box.value.trim();

            const badInput =
                box.validity && box.validity.badInput;

            let value;
            let valid = true;

            if (badInput) {

                valid = false;
                value = saved[field];

            }
            else if (raw === "") {

                value = null;

            }
            else {

                const number =
                    Number(raw);

                if (isNaN(number) || number < 0 || number > max) {

                    valid = false;
                    value = saved[field];

                }
                else {

                    value = number;

                }

            }

            box.classList.toggle("is-invalid", !valid);

            draft[field] = value;

        }
    );

    drafts[studentId] =
        draft;

    refreshRow(studentId);

    refreshOverview();

}


/* ==========================================
   SAVE — one field at a time, on blur, same
   pattern attendance.js uses per toggle.
========================================== */

async function saveScore(studentId, field, inputEl) {

    const assignmentId =
        selectedAssignmentId;

    const existing =
        scoresMap[studentId];

    // The student isn't in the class on screen any more.
    if (!existing) {

        return;

    }

    const rawValue =
        inputEl.value.trim();

    const max =
        field === "ca_score" ? 40 : 60;


    let value =
        rawValue === "" ? null : Number(rawValue);

    const badInput =
        inputEl.validity && inputEl.validity.badInput;

    if (badInput || (value !== null && (isNaN(value) || value < 0 || value > max))) {

        showToast(`Enter a number between 0 and ${max}.`);

        const previous =
            existing[field];

        inputEl.value =
            previous !== null && previous !== undefined ? previous : "";

        inputEl.classList.remove("is-invalid");

        delete drafts[studentId];

        refreshRow(studentId);

        refreshOverview();

        return;

    }


    // Nothing changed (e.g. tabbing through a box): nothing to save.
    const unchanged =
        isEntered(existing[field]) ?
            Number(existing[field]) === value :
            value === null;

    if (unchanged) {

        inputEl.classList.remove("is-invalid");

        delete drafts[studentId];

        refreshRow(studentId);

        refreshOverview();

        return;

    }


    const updatedRow = {
        ...existing,
        [field]: value
    };


    const {
        data,
        error

    } =
        await supabaseClient
            .from("scores")
            .upsert(
                {
                    class_subject_id: assignmentId,
                    student_id: studentId,
                    term: AttendNGContext.currentTerm,
                    ca_score: updatedRow.ca_score,
                    exam_score: updatedRow.exam_score,
                    entered_by: AttendNGContext.memberId
                },
                { onConflict: "class_subject_id,student_id,term" }
            )
            .select("id")
            .single();


    if (error) {

        console.error(
            "Unable to save score:",
            error
        );

        showToast("Unable to save that score — try again.");

        return;

    }


    // The teacher moved to another class while this was saving.
    if (assignmentId !== selectedAssignmentId) {

        return;

    }


    scoresMap[studentId] = {
        id: data.id,
        ca_score: updatedRow.ca_score,
        exam_score: updatedRow.exam_score
    };

    delete drafts[studentId];

    inputEl.classList.remove("is-invalid");

    refreshRow(studentId);

    refreshOverview();

}


function showToast(message) {

    const toast =
        document.getElementById("toast");

    toast.textContent =
        message;

    toast.classList.add("show");

    setTimeout(
        () => toast.classList.remove("show"),
        2500
    );

}