/*************************************************
 * RATINGS.JS
 * Class teachers rate each student 1-5 on the
 * behaviour & skills traits, one term at a time.
 *************************************************/

let students = [];
let savedRatings = {};      // savedRatings[studentId] = { traitKey: 1..5 }
let attendancePct = {};     // attendancePct[studentId] = 0..100 (only if the register has data)
let sessionStartDate = null;

let currentIndex = -1;
let draft = {};             // ratings being edited for the open student
let dirty = false;


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    if (!AttendNGContext.classId) {

        document.getElementById("noClassNotice").style.display = "block";

        return;

    }

    document.getElementById("className").textContent =
        AttendNGContext.className;

    document.getElementById("term").textContent =
        AttendNGContext.currentTerm || "—";

    renderKey();
    renderSetAllButtons();

    document.getElementById("app").style.display = "block";

    try {

        await loadStudents();
        await loadRatings();
        await loadAttendanceSuggestions();

    }
    catch (error) {

        console.error("Unable to load behaviour ratings:", error);

        showToast("Unable to load. Please refresh and try again.");

    }

    bindUI();

    renderList();

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


function escapeHtml(value) {

    return String(value === null || value === undefined ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}


/* ==========================================
   LOADING
========================================== */

async function fetchPaged(makeQuery) {

    const PAGE = 1000;

    let all = [];
    let from = 0;

    while (true) {

        const { data, error } =
            await makeQuery().range(from, from + PAGE - 1);

        if (error) {

            throw error;

        }

        all = all.concat(data);

        if (data.length < PAGE) {

            return all;

        }

        from += PAGE;

    }

}


async function loadStudents() {

    const { data, error } =
        await supabaseClient
            .from("students")
            .select("id, surname, first_name")
            .eq("class_id", AttendNGContext.classId)
            .order("surname")
            .order("first_name");

    if (error) {

        throw error;

    }

    students = data;

}


async function loadRatings() {

    savedRatings = {};

    if (students.length === 0) {

        return;

    }

    const rows =
        await fetchPaged(
            () => supabaseClient
                .from("student_ratings")
                .select("student_id, trait, rating")
                .in("student_id", students.map(s => s.id))
                .eq("term", AttendNGContext.currentTerm)
                .order("student_id")
                .order("trait")
        );

    rows.forEach(
        r => {

            if (!savedRatings[r.student_id]) {

                savedRatings[r.student_id] = {};

            }

            savedRatings[r.student_id][r.trait] = r.rating;

        }
    );

}


/*
 * Attendance % for each student this term — counted the same way as
 * the report card: every ticked morning or afternoon is one time
 * present, against the weekly "times school opened" figures.
 */
async function loadAttendanceSuggestions() {

    attendancePct = {};

    if (students.length === 0 || !AttendNGContext.sessionId) {

        return;

    }

    const { data: sessionRow, error: sessionError } =
        await supabaseClient
            .from("sessions")
            .select("start_date")
            .eq("id", AttendNGContext.sessionId)
            .maybeSingle();

    if (sessionError) {

        throw sessionError;

    }

    sessionStartDate =
        (sessionRow && sessionRow.start_date) || null;

    if (!sessionStartDate) {

        return;

    }

    const rows =
        await fetchPaged(
            () => supabaseClient
                .from("attendance")
                .select("student_id, date, morning_present, afternoon_present")
                .in("student_id", students.map(s => s.id))
                .eq("term", AttendNGContext.currentTerm)
                .order("student_id")
                .order("date")
        );

    const weeks = new Set();
    const present = {};

    rows.forEach(
        r => {

            weeks.add(weekNumberForDate(r.date));

            present[r.student_id] =
                (present[r.student_id] || 0) +
                (r.morning_present ? 1 : 0) +
                (r.afternoon_present ? 1 : 0);

        }
    );

    if (weeks.size === 0) {

        return;

    }

    const { data: settingsRows, error } =
        await supabaseClient
            .from("weekly_settings")
            .select("week, school_opened")
            .eq("class_id", AttendNGContext.classId)
            .in("week", Array.from(weeks));

    if (error) {

        throw error;

    }

    const opened =
        settingsRows.reduce((sum, s) => sum + s.school_opened, 0);

    if (opened <= 0) {

        return;

    }

    students.forEach(
        s => {

            const p =
                Math.min(present[s.id] || 0, opened);

            attendancePct[s.id] =
                Math.round((p / opened) * 100);

        }
    );

}


function weekNumberForDate(dateISO) {

    const start = new Date(sessionStartDate + "T00:00:00");
    const date = new Date(dateISO + "T00:00:00");

    const diffDays =
        Math.floor((date - start) / (1000 * 60 * 60 * 24));

    return Math.floor(diffDays / 7) + 1;

}


/* ==========================================
   STATIC PIECES
========================================== */

function renderKey() {

    document.getElementById("keyRows").innerHTML =
        RATING_KEY.map(
            k => `
                <div class="rt-key-row">
                    <span class="rt-num">${k.value}</span>
                    <span>${escapeHtml(k.text)}</span>
                </div>
            `
        ).join("");

}


function renderSetAllButtons() {

    document.getElementById("setAllBtns").innerHTML =
        [1, 2, 3, 4, 5].map(
            v => `<button type="button" class="rt-btn" data-setall="${v}">${v}</button>`
        ).join("");

}


/* ==========================================
   STUDENT LIST
========================================== */

// Attendance is worked out from the register, so a student whose
// class has no attendance recorded yet is rated on the other 19.

function hasAttendanceRating(studentId) {

    return attendancePercentToRating(attendancePct[studentId]) !== null;

}


function requiredCount(studentId) {

    return RATING_ALL_TRAITS.length - (hasAttendanceRating(studentId) ? 0 : 1);

}


function savedCount(studentId) {

    const saved = savedRatings[studentId] || {};

    return RATING_ALL_TRAITS.filter(
        trait => saved[trait.key] !== undefined &&
            (!trait.auto || hasAttendanceRating(studentId))
    ).length;

}


function renderList() {

    const query =
        document.getElementById("searchBox").value.trim().toLowerCase();

    const done =
        students.filter(s => savedCount(s.id) >= requiredCount(s.id)).length;

    document.getElementById("progressText").textContent =
        `${done} of ${students.length} students done`;

    document.getElementById("progressFill").style.width =
        students.length > 0 ? `${(done / students.length) * 100}%` : "0";

    document.getElementById("noStudentsNotice").style.display =
        students.length === 0 ? "block" : "none";

    document.getElementById("studentList").innerHTML =
        students
            .map((s, index) => ({ s, index }))
            .filter(({ s }) => `${s.surname} ${s.first_name}`.toLowerCase().includes(query))
            .map(
                ({ s, index }) => {

                    const count = savedCount(s.id);
                    const total = requiredCount(s.id);

                    const status =
                        count >= total ?
                            `<span class="rt-status done"><i class="fa-solid fa-check"></i> Done</span>` :
                            count > 0 ?
                                `<span class="rt-status part">${count}/${total}</span>` :
                                `<span class="rt-status none">Not started</span>`;

                    return `
                        <div class="rt-student" data-index="${index}">
                            <span class="rt-n">${index + 1}</span>
                            <span class="rt-name">${escapeHtml(`${s.surname} ${s.first_name}`.toUpperCase())}</span>
                            ${status}
                        </div>
                    `;

                }
            ).join("");

}


/* ==========================================
   EDITOR
========================================== */

function openStudent(index) {

    currentIndex = index;

    const student = students[index];

    draft =
        Object.assign({}, savedRatings[student.id] || {});

    dirty = false;

    // Attendance is worked out from the register every time the page is
    // opened, so it is always up to date. It can't be edited here.

    const attendanceRating =
        attendancePercentToRating(attendancePct[student.id]);

    if (attendanceRating !== null) {

        draft.attendance = attendanceRating;

    }

    document.getElementById("studentTitle").textContent =
        `${student.surname} ${student.first_name}`.toUpperCase();

    document.getElementById("studentCounter").textContent =
        `Student ${index + 1} of ${students.length}`;

    document.getElementById("prevBtn").disabled = index === 0;
    document.getElementById("nextBtn").disabled = index === students.length - 1;

    document.getElementById("saveNextBtn").style.display =
        index === students.length - 1 ? "none" : "";

    document.getElementById("setAllHint").textContent =
        "Attendance is worked out from the register and can't be changed here.";

    renderGroups();

    document.getElementById("listView").style.display = "none";
    document.getElementById("editorView").style.display = "block";

    window.scrollTo({ top: 0 });

}


function renderGroups() {

    const student = students[currentIndex];

    document.getElementById("groups").innerHTML =
        RATING_TRAIT_GROUPS.map(
            group => `
                <div class="rt-group">
                    <h3>${escapeHtml(group.title)}</h3>
                    ${group.traits.map(
                        trait => {

                            const value = draft[trait.key];

                            let note = "";

                            if (trait.auto) {

                                note =
                                    hasAttendanceRating(student.id) ?
                                        `<span class="rt-note">Worked out from attendance (${attendancePct[student.id]}%). Not editable.</span>` :
                                        `<span class="rt-note">No attendance recorded yet for this term.</span>`;

                            }

                            return `
                                <div class="rt-trait">
                                    <div class="rt-label">${escapeHtml(trait.label)}${note}</div>
                                    <div class="rt-btns">
                                        ${[1, 2, 3, 4, 5].map(
                                            v => `<button type="button" class="rt-btn ${value === v ? "on" : ""} ${trait.auto ? "locked" : ""}" ${trait.auto ? "disabled" : ""} data-trait="${trait.key}" data-val="${v}">${v}</button>`
                                        ).join("")}
                                    </div>
                                </div>
                            `;

                        }
                    ).join("")}
                </div>
            `
        ).join("");

}


function setRating(traitKey, value) {

    const trait =
        RATING_ALL_TRAITS.find(t => t.key === traitKey);

    if (!trait || trait.auto) {

        return;

    }

    draft[traitKey] = value;

    dirty = true;

    renderGroups();

}


function setAll(value) {

    RATING_ALL_TRAITS.forEach(
        trait => {

            // Attendance comes from the register, not from quick fill.

            if (trait.auto) {

                return;

            }

            draft[trait.key] = value;

        }
    );

    dirty = true;

    renderGroups();

}


async function saveCurrent() {

    const student = students[currentIndex];

    const rows =
        RATING_ALL_TRAITS
            .filter(trait => draft[trait.key] !== undefined)
            .map(
                trait => ({
                    student_id: student.id,
                    term: AttendNGContext.currentTerm,
                    trait: trait.key,
                    rating: draft[trait.key],
                    entered_by: AttendNGContext.memberId,
                    updated_at: new Date().toISOString()
                })
            );

    if (rows.length === 0) {

        return true;

    }

    const { error } =
        await supabaseClient
            .from("student_ratings")
            .upsert(rows, { onConflict: "student_id,term,trait" });

    if (error) {

        console.error("Unable to save ratings:", error);

        showToast("Unable to save. Please try again.");

        return false;

    }

    savedRatings[student.id] = {};

    rows.forEach(r => { savedRatings[student.id][r.trait] = r.rating; });

    dirty = false;

    return true;

}


// Moves to another student (or back to the list), saving first if
// the teacher changed anything.

async function leaveTo(target) {

    if (dirty) {

        const ok = await saveCurrent();

        if (!ok) {

            return;

        }

        showToast("Saved.");

    }

    if (target === "list") {

        document.getElementById("editorView").style.display = "none";
        document.getElementById("listView").style.display = "block";

        renderList();

        return;

    }

    openStudent(target);

}


/* ==========================================
   UI BINDING
========================================== */

function bindUI() {

    document.getElementById("searchBox").addEventListener("input", renderList);

    document.getElementById("studentList").addEventListener(
        "click",
        (event) => {

            const row = event.target.closest(".rt-student");

            if (row) {

                openStudent(Number(row.dataset.index));

            }

        }
    );

    document.getElementById("groups").addEventListener(
        "click",
        (event) => {

            const btn = event.target.closest(".rt-btn");

            if (btn) {

                setRating(btn.dataset.trait, Number(btn.dataset.val));

            }

        }
    );

    document.getElementById("setAllBtns").addEventListener(
        "click",
        (event) => {

            const btn = event.target.closest("[data-setall]");

            if (btn) {

                setAll(Number(btn.dataset.setall));

            }

        }
    );

    document.getElementById("backBtn").addEventListener("click", () => leaveTo("list"));

    document.getElementById("prevBtn").addEventListener(
        "click",
        () => { if (currentIndex > 0) { leaveTo(currentIndex - 1); } }
    );

    document.getElementById("nextBtn").addEventListener(
        "click",
        () => { if (currentIndex < students.length - 1) { leaveTo(currentIndex + 1); } }
    );

    document.getElementById("saveBtn").addEventListener(
        "click",
        async () => {

            const button = document.getElementById("saveBtn");

            button.disabled = true;

            const ok = await saveCurrent();

            button.disabled = false;

            if (ok) {

                showToast("Saved.");

                renderGroups();

            }

        }
    );

    document.getElementById("saveNextBtn").addEventListener(
        "click",
        async () => {

            const button = document.getElementById("saveNextBtn");

            button.disabled = true;

            const ok = await saveCurrent();

            button.disabled = false;

            if (!ok) {

                return;

            }

            showToast("Saved.");

            if (currentIndex < students.length - 1) {

                openStudent(currentIndex + 1);

            }

        }
    );

}