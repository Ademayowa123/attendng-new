/*************************************************
 * ADMIN-SUBJECTS.JS
 *************************************************/

let schoolSubjects = [];       // this school's subjects
let classSubjectCounts = {};   // subject_id -> assignments in ANY session (past + current)
let activeClassNames = {};     // subject_id -> [class names] in the ACTIVE session
let sjFilter = "all";
let sjQuery = "";
let editingSubjectId = null;
let pendingDeleteSubjectId = null;
let pendingDeleteSubjectName = null;


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    bindSubjectToolbar();

    await loadEverything();


    bindAutoCapitalize("newSubjectName");
    bindAutoCapitalize("editSubjectName");


    document.getElementById("openAddSubject").addEventListener(
        "click",
        () => {

            document.getElementById("newSubjectName").value =
                "";

            document.getElementById("addSubjectError").style.display =
                "none";

            document.getElementById("addSubjectModal").style.display =
                "flex";

        }
    );


    document.getElementById("cancelAddSubject").addEventListener(
        "click",
        () => {

            document.getElementById("addSubjectModal").style.display =
                "none";

        }
    );


    document.getElementById("submitAddSubject").addEventListener(
        "click",
        submitAddSubject
    );


    document.getElementById("cancelEditSubject").addEventListener(
        "click",
        () => {

            document.getElementById("editSubjectModal").style.display =
                "none";

            editingSubjectId =
                null;

        }
    );


    document.getElementById("submitEditSubject").addEventListener(
        "click",
        submitEditSubject
    );


    document.getElementById("cancelDeleteSubject").addEventListener(
        "click",
        () => {

            document.getElementById("deleteSubjectModal").style.display =
                "none";

            pendingDeleteSubjectId =
                null;

            pendingDeleteSubjectName =
                null;

        }
    );


    document.getElementById("confirmDeleteSubject").addEventListener(
        "click",
        confirmDeleteSubject
    );


    document.getElementById("closeDeleteBlockedModal").addEventListener(
        "click",
        () => {

            document.getElementById("deleteBlockedModal").style.display =
                "none";

        }
    );

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


async function loadEverything() {

    const {
        data: subjects,
        error: subjectsError

    } =
        await supabaseClient
            .from("subjects")
            .select("id, name")
            .eq("school_id", AttendNGContext.schoolId)
            .order("name");


    if (subjectsError) {

        console.error(
            "Unable to load subjects:",
            subjectsError
        );

        return;

    }


    schoolSubjects =
        subjects;


    // How many classes currently use each subject — needed both to
    // show in the table and to block deletion of an in-use subject.

    const {
        data: usage,
        error: usageError

    } =
        await supabaseClient
            .from("class_subjects")
            .select("subject_id");

    if (usageError) {

        console.error(
            "Unable to load subject usage:",
            usageError
        );

    }
    else {

        classSubjectCounts =
            {};

        usage.forEach(
            row => {

                classSubjectCounts[row.subject_id] =
                    (classSubjectCounts[row.subject_id] || 0) + 1;

            }
        );

    }


    // Which classes use each subject in the ACTIVE session — shown as
    // chips on the cards. Display only: if any lookup fails the cards
    // simply show no chips.

    activeClassNames =
        {};

    const {
        data: activeSession,
        error: sessionError

    } =
        await supabaseClient
            .from("sessions")
            .select("id")
            .eq("school_id", AttendNGContext.schoolId)
            .eq("is_active", true)
            .maybeSingle();

    if (sessionError) {

        console.error(
            "Unable to load active session:",
            sessionError
        );

    }
    else if (activeSession) {

        const {
            data: classRows,
            error: classesError

        } =
            await supabaseClient
                .from("classes")
                .select("id, name")
                .eq("session_id", activeSession.id);

        if (classesError) {

            console.error(
                "Unable to load classes:",
                classesError
            );

        }
        else if (classRows && classRows.length) {

            const nameById =
                {};

            classRows.forEach(c => { nameById[c.id] = c.name; });

            const {
                data: csRows,
                error: csError

            } =
                await supabaseClient
                    .from("class_subjects")
                    .select("subject_id, class_id")
                    .in("class_id", classRows.map(c => c.id));

            if (csError) {

                console.error(
                    "Unable to load class subjects:",
                    csError
                );

            }
            else {

                (csRows || []).forEach(
                    row => {

                        const name =
                            nameById[row.class_id];

                        if (name) {

                            (activeClassNames[row.subject_id] =
                                activeClassNames[row.subject_id] || []).push(name);

                        }

                    }
                );

                Object.values(activeClassNames).forEach(
                    list => list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                );

            }

        }

    }


    renderSubjectsTable();

}


function sjEsc(value) {

    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}

const SJ_TONES = ["teal", "indigo", "amber", "green", "rose", "sky"];

function sjTone(name) {

    let hash = 0;

    for (const ch of String(name || "")) {

        hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

    }

    return SJ_TONES[hash % SJ_TONES.length];

}

// A picture for each subject, chosen from keywords in its name.
// First match wins; anything unrecognised gets the open-book icon.

const SJ_ICON_RULES = [
    [/math|numeracy|arithmetic/, "fa-calculator"],
    [/computer|\bict\b|digital|coding|data processing/, "fa-laptop-code"],
    [/music/, "fa-music"],
    [/\barts?\b|creative|drawing|craft/, "fa-palette"],
    [/agric|farm/, "fa-seedling"],
    [/home (economics|management)|food|nutrition/, "fa-utensils"],
    [/business|commerce|account|book.?keeping|office/, "fa-briefcase"],
    [/physical|health|sport|\bp\.?h\.?e\b/, "fa-person-running"],
    [/religio|christian|islam|bible|\bcrs\b|\birs\b|\bcrk\b|\birk\b/, "fa-hands-praying"],
    [/civic|government|security|peace/, "fa-landmark"],
    [/social|geograph|history|culture/, "fa-earth-africa"],
    [/english|yoruba|igbo|hausa|french|arabic|language|literature/, "fa-language"],
    [/chem|biolog|physics|science/, "fa-flask"],
    [/technolog|woodwork|metalwork|electric/, "fa-screwdriver-wrench"]
];

function sjIcon(name) {

    const lower = String(name || "").toLowerCase();

    for (const [pattern, icon] of SJ_ICON_RULES) {

        if (pattern.test(lower)) {

            return icon;

        }

    }

    return "fa-book-open";

}


function bindSubjectToolbar() {

    const search =
        document.getElementById("subjectSearch");

    search.addEventListener(
        "input",
        () => {

            sjQuery =
                search.value.trim().toLowerCase();

            renderSubjectsTable();

        }
    );

    document.querySelectorAll(".tm-chip").forEach(
        chip => {

            chip.addEventListener(
                "click",
                () => {

                    sjFilter =
                        chip.dataset.filter;

                    document.querySelectorAll(".tm-chip").forEach(
                        c => c.classList.toggle("is-active", c === chip)
                    );

                    renderSubjectsTable();

                }
            );

        }
    );

}


function renderSubjectsTable() {

    // Counter in the page header — updates after every add, edit and delete.
    document.getElementById("subjectCount").textContent =
        `${schoolSubjects.length} subject${schoolSubjects.length === 1 ? "" : "s"}`;


    // ---- summary tiles (whole list, ignoring search/filter)

    const inUse =
        schoolSubjects.filter(s => (activeClassNames[s.id] || []).length > 0);

    document.getElementById("sjStatTotal").textContent =
        schoolSubjects.length;

    document.getElementById("sjStatUsed").textContent =
        inUse.length;

    document.getElementById("sjStatUnused").textContent =
        schoolSubjects.length - inUse.length;

    document.getElementById("sjStatAssignments").textContent =
        schoolSubjects.reduce((n, s) => n + (activeClassNames[s.id] || []).length, 0);


    // ---- search + usage filter

    const visible =
        schoolSubjects.filter(
            subject => {

                const used =
                    (activeClassNames[subject.id] || []).length > 0;

                if (sjFilter === "used" && !used) {

                    return false;

                }

                if (sjFilter === "unused" && used) {

                    return false;

                }

                return !sjQuery || subject.name.toLowerCase().includes(sjQuery);

            }
        );

    const grid =
        document.getElementById("subjectGridMount");

    const empty =
        document.getElementById("noSubjectsNotice");

    grid.innerHTML =
        "";

    empty.style.display =
        visible.length ? "none" : "block";

    document.getElementById("subjectEmptyText").textContent =
        schoolSubjects.length ?
            "No subjects match your search." :
            "No subjects yet. Tap “Add subject” to create the first one.";


    visible.forEach(
        subject => {

            const classes =
                activeClassNames[subject.id] || [];

            const n =
                classes.length;

            let badge;

            if (n > 0) {

                badge = `<span class="tm-role tm-role-green"><i class="fa-solid fa-circle-check"></i> In ${n} class${n === 1 ? "" : "es"}</span>`;

            }
            else if ((classSubjectCounts[subject.id] || 0) > 0) {

                // Assigned in an earlier session only.
                badge = `<span class="tm-role tm-role-grey">Past sessions only</span>`;

            }
            else {

                badge = `<span class="tm-role tm-role-grey">Not used yet</span>`;

            }

            const chips =
                n > 0 ?
                    `<div class="sj-chips">` +
                    classes.slice(0, 3).map(c => `<span class="sj-chip">${sjEsc(c)}</span>`).join("") +
                    (n > 3 ? `<span class="sj-chip sj-more" title="${sjEsc(classes.slice(3).join(", "))}">+${n - 3}</span>` : "") +
                    `</div>` :
                    `<p class="sj-none">No class this session</p>`;

            const safeId =
                sjEsc(subject.id);

            const safeName =
                sjEsc(subject.name);

            const card =
                document.createElement("article");

            card.className =
                "tm-card sj-card";

            card.innerHTML = `
                <div class="tm-card-top">
                    <div class="cm-tile sj-tile tm-tone-${sjTone(subject.name)}" aria-hidden="true">
                        <i class="fa-solid ${sjIcon(subject.name)}"></i>
                    </div>
                    <div class="tm-id">
                        <div class="tm-name">${safeName}</div>
                        ${badge}
                    </div>
                </div>

                ${chips}

                <div class="sj-actions">
                    <button type="button" class="btn-light edit-subject-btn" data-subject-id="${safeId}" aria-label="Edit ${safeName}">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button type="button" class="btn-light sj-del delete-subject-btn" data-subject-id="${safeId}" aria-label="Delete ${safeName}">
                        <i class="fa-solid fa-trash-can"></i> Delete
                    </button>
                </div>
            `;

            grid.appendChild(card);

        }
    );


    grid.querySelectorAll(".edit-subject-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => {

                    const subject =
                        schoolSubjects.find(s => s.id === btn.dataset.subjectId);

                    if (subject) {

                        openEditSubjectModal(subject.id, subject.name);

                    }

                }
            );

        }
    );


    grid.querySelectorAll(".delete-subject-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => {

                    const subject =
                        schoolSubjects.find(s => s.id === btn.dataset.subjectId);

                    if (subject) {

                        deleteSubject(subject.id, subject.name);

                    }

                }
            );

        }
    );

}


/* The first letter of every word in a subject name is a capital:
   "civic education" -> "Civic Education". Only first letters are
   touched; the rest is left exactly as typed, so "ICT" stays "ICT".
   A word also starts after a hyphen, slash or opening bracket, e.g.
   "Physical & health education (practical)". */
function titleCaseWords(text) {

    return String(text || "").replace(
        /(^|[\s\-\/(])(\p{L})/gu,
        (match, before, letter) => before + letter.toUpperCase()
    );

}


function capitalizeWords(value) {

    return titleCaseWords(String(value || "").trim());

}


/* Capitalise as the person types, without moving their cursor. */
function bindAutoCapitalize(inputId) {

    const input =
        document.getElementById(inputId);

    input.addEventListener(
        "input",
        () => {

            const fixed =
                titleCaseWords(input.value);

            if (fixed !== input.value) {

                const start =
                    input.selectionStart;

                const end =
                    input.selectionEnd;

                input.value =
                    fixed;

                input.setSelectionRange(start, end);

            }

        }
    );

}


async function submitAddSubject() {

    const errorEl =
        document.getElementById("addSubjectError");

    const nameInput =
        document.getElementById("newSubjectName");

    const name =
        capitalizeWords(nameInput.value);


    errorEl.style.display =
        "none";


    if (!name) {

        errorEl.textContent =
            "Please enter a subject name.";

        errorEl.style.display =
            "block";

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("subjects")
            .insert({
                school_id: AttendNGContext.schoolId,
                name
            });


    if (error) {

        errorEl.textContent =
            error.message.includes("duplicate") ?
                "A subject with this name already exists." :
                (error.message || "Unable to add this subject.");

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("addSubjectModal").style.display =
        "none";

    await loadEverything();

    showToast("Subject added successfully");

    logActivity("subject.created", name);

}


function openEditSubjectModal(subjectId, currentName) {

    editingSubjectId =
        subjectId;

    document.getElementById("editSubjectName").value =
        currentName;

    document.getElementById("editSubjectError").style.display =
        "none";

    document.getElementById("editSubjectModal").style.display =
        "flex";

}


async function submitEditSubject() {

    const errorEl =
        document.getElementById("editSubjectError");

    const nameInput =
        document.getElementById("editSubjectName");

    const name =
        capitalizeWords(nameInput.value);

    const previousSubject =
        schoolSubjects.find(s => s.id === editingSubjectId);

    const previousName =
        previousSubject ? previousSubject.name : "";


    errorEl.style.display =
        "none";


    if (!name) {

        errorEl.textContent =
            "Please enter a subject name.";

        errorEl.style.display =
            "block";

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("subjects")
            .update({ name })
            .eq("id", editingSubjectId);


    if (error) {

        errorEl.textContent =
            error.message.includes("duplicate") ?
                "A subject with this name already exists." :
                (error.message || "Unable to rename this subject.");

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("editSubjectModal").style.display =
        "none";

    editingSubjectId =
        null;

    await loadEverything();

    showToast("Subject renamed successfully");

    logActivity("subject.renamed", name, `${previousName} → ${name}`);

}


function deleteSubject(subjectId, subjectName) {

    pendingDeleteSubjectId =
        subjectId;

    pendingDeleteSubjectName =
        subjectName;

    document.getElementById("deleteSubjectMessage").textContent =
        `Delete "${subjectName}"? This cannot be undone.`;

    document.getElementById("deleteSubjectError").style.display =
        "none";

    document.getElementById("deleteSubjectModal").style.display =
        "flex";

}


async function confirmDeleteSubject() {

    const errorEl =
        document.getElementById("deleteSubjectError");

    errorEl.style.display =
        "none";


    // A subject in use by any class (current or past session) can't
    // be deleted outright — scores reference it through class_subjects,
    // and silently cascading that away would wipe recorded results.

    const {
        count,
        error: countError

    } =
        await supabaseClient
            .from("class_subjects")
            .select("id", { count: "exact", head: true })
            .eq("subject_id", pendingDeleteSubjectId);

    if (countError) {

        errorEl.textContent =
            "Unable to verify this subject is unused: " +
            countError.message;

        errorEl.style.display =
            "block";

        return;

    }

    if (count > 0) {

        document.getElementById("deleteSubjectModal").style.display =
            "none";

        document.getElementById("deleteBlockedMessage").textContent =
            "This subject can't be deleted because it's assigned to one or more classes. Remove those assignments first.";

        document.getElementById("deleteBlockedModal").style.display =
            "flex";

        pendingDeleteSubjectId =
            null;

        pendingDeleteSubjectName =
            null;

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("subjects")
            .delete()
            .eq("id", pendingDeleteSubjectId);

    if (error) {

        errorEl.textContent =
            "Unable to delete this subject: " +
            error.message;

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("deleteSubjectModal").style.display =
        "none";

    const deletedSubjectName =
        pendingDeleteSubjectName;

    pendingDeleteSubjectId =
        null;

    pendingDeleteSubjectName =
        null;

    await loadEverything();

    showToast("Subject deleted successfully");

    logActivity("subject.deleted", deletedSubjectName);

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