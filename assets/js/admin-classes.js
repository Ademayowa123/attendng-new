/*************************************************
 * ADMIN-CLASSES.JS
 *************************************************/

let activeSession = null;
let schoolMembers = [];   // all non-genesis members, for the teacher dropdown
let sessionClasses = [];  // this session's classes
let studentCounts = {};   // class_id -> number of students, used to gate deletion
let editingClassId = null;
let pendingDeleteClassId = null;
let pendingDeleteClassName = null;
let pendingFinalizeClassId = null;
let pendingFinalizeNextValue = null;
let classSubjectsByClass = {}; // class_id -> [{ name, teacher_id }]
let cmFilter = "all";
let cmQuery = "";
let cmOpenClassId = null;
let cmReturnFocus = null;


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    bindClassToolbar();

    await loadEverything();


    document.getElementById("openAddClass").addEventListener(
        "click",
        () => {

            document.getElementById("newClassName").value =
                "";

            document.getElementById("addClassError").style.display =
                "none";

            document.getElementById("addClassModal").style.display =
                "flex";

        }
    );


    document.getElementById("cancelAddClass").addEventListener(
        "click",
        () => {

            document.getElementById("addClassModal").style.display =
                "none";

        }
    );


    document.getElementById("submitAddClass").addEventListener(
        "click",
        submitAddClass
    );


    document.getElementById("cancelEditClass").addEventListener(
        "click",
        () => {

            document.getElementById("editClassModal").style.display =
                "none";

        }
    );


    document.getElementById("submitEditClass").addEventListener(
        "click",
        submitEditClass
    );


    document.getElementById("cancelDeleteClass").addEventListener(
        "click",
        () => {

            document.getElementById("deleteClassModal").style.display =
                "none";

            pendingDeleteClassId =
                null;

            pendingDeleteClassName =
                null;

        }
    );


    document.getElementById("confirmDeleteClass").addEventListener(
        "click",
        confirmDeleteClass
    );


    document.getElementById("closeDeleteBlockedModal").addEventListener(
        "click",
        () => {

            document.getElementById("deleteBlockedModal").style.display =
                "none";

        }
    );


    document.getElementById("cancelFinalizeConfirm").addEventListener(
        "click",
        () => {

            document.getElementById("finalizeConfirmModal").style.display =
                "none";

            pendingFinalizeClassId =
                null;

            pendingFinalizeNextValue =
                null;

        }
    );


    document.getElementById("confirmFinalizeConfirm").addEventListener(
        "click",
        confirmToggleFinalize
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
        data: session,
        error: sessionError

    } =
        await supabaseClient
            .from("sessions")
            .select("id, name")
            .eq("school_id", AttendNGContext.schoolId)
            .eq("is_active", true)
            .maybeSingle();


    if (sessionError) {

        console.error(
            "Unable to load session:",
            sessionError
        );

        return;

    }


    activeSession =
        session;


    if (!session) {

        document.getElementById("noSessionNotice").style.display =
            "block";

        document.getElementById("classesCard").style.display =
            "none";

        return;

    }


    document.getElementById("sessionLabel").textContent =
        session.name;

    document.getElementById("noSessionNotice").style.display =
        "none";

    document.getElementById("classesCard").style.display =
        "block";


    const [membersResult, classesResult] = await Promise.all([

        supabaseClient
            .from("school_members")
            .select("id, full_name, is_genesis")
            .eq("school_id", AttendNGContext.schoolId)
            .eq("is_genesis", false),

        supabaseClient
            .from("classes")
            .select("id, name, teacher_id, is_finalized")
            .eq("session_id", session.id)
            .order("name")

    ]);


    if (membersResult.error) {

        console.error(
            "Unable to load members:",
            membersResult.error
        );

    }
    else {

        schoolMembers =
            membersResult.data;

    }


    if (classesResult.error) {

        console.error(
            "Unable to load classes:",
            classesResult.error
        );

    }
    else {

        sessionClasses =
            classesResult.data;

    }


    // Student counts per class — a class is only deletable when
    // this is zero (attendance always references a student, so
    // zero students already guarantees zero attendance history
    // for this class too).

    studentCounts =
        {};

    if (sessionClasses.length > 0) {

        const {
            data: studentRows,
            error: studentsError

        } =
            await supabaseClient
                .from("students")
                .select("class_id")
                .in("class_id", sessionClasses.map(c => c.id));

        if (studentsError) {

            console.error(
                "Unable to load student counts:",
                studentsError
            );

        }
        else {

            studentRows.forEach(
                row => {

                    studentCounts[row.class_id] =
                        (studentCounts[row.class_id] || 0) + 1;

                }
            );

        }

    }


    // Subjects per class (names + who teaches them) — display only,
    // so a failed lookup just means the cards show fewer details.

    classSubjectsByClass =
        {};

    if (sessionClasses.length > 0) {

        const {
            data: csRows,
            error: csError

        } =
            await supabaseClient
                .from("class_subjects")
                .select("class_id, teacher_id, subjects ( name )")
                .in("class_id", sessionClasses.map(c => c.id));

        if (csError) {

            console.error(
                "Unable to load class subjects:",
                csError
            );

        }
        else {

            (csRows || []).forEach(
                row => {

                    (classSubjectsByClass[row.class_id] =
                        classSubjectsByClass[row.class_id] || [])
                        .push({
                            name: row.subjects ? row.subjects.name : "(deleted subject)",
                            teacher_id: row.teacher_id
                        });

                }
            );

        }

    }


    renderClasses();

}


function cmEsc(value) {

    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}

function cmInitials(name) {

    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

    if (!parts.length) {

        return "?";

    }

    if (parts.length === 1) {

        return parts[0].slice(0, 2).toUpperCase();

    }

    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

}

const CM_TONES = ["teal", "indigo", "amber", "green", "rose", "sky"];

// JSS1 → teal, JSS2 → indigo, JSS3 → amber, so each level is
// instantly recognisable; names without a digit fall back to a hash.

function cmTone(name) {

    const digit = String(name || "").match(/\d/);

    if (digit) {

        return CM_TONES[(parseInt(digit[0], 10) + 5) % CM_TONES.length];

    }

    let hash = 0;

    for (const ch of String(name || "")) {

        hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

    }

    return CM_TONES[hash % CM_TONES.length];

}

function cmTileSize(name, large) {

    const len = String(name || "").length;

    // Sized so the whole name stays on one line inside the tile.
    let size =
        len <= 3 ? 20 :
        len === 4 ? 17 :
        len === 5 ? 14 :
        len === 6 ? 12 : 10;

    return (large ? Math.round(size * 1.25) : size) + "px";

}

function cmTeacher(classRow) {

    return classRow.teacher_id ?
        schoolMembers.find(m => m.id === classRow.teacher_id) :
        null;

}


function bindClassToolbar() {

    const search = document.getElementById("classSearch");

    search.addEventListener("input", () => {

        cmQuery = search.value.trim().toLowerCase();

        renderClasses();

    });

    document.querySelectorAll(".tm-chip").forEach(chip => {

        chip.addEventListener("click", () => {

            cmFilter = chip.dataset.filter;

            document.querySelectorAll(".tm-chip").forEach(c =>
                c.classList.toggle("is-active", c === chip)
            );

            renderClasses();

        });

    });

    const sheet = document.getElementById("classSheet");

    document.getElementById("csClose").addEventListener("click", closeClassSheet);

    sheet.addEventListener("click", (e) => {

        if (e.target === sheet) {

            closeClassSheet();

        }

    });

    document.addEventListener("keydown", (e) => {

        if (e.key === "Escape" && !sheet.hidden) {

            closeClassSheet();

        }

    });

    const goTo = (page) => {

        sessionStorage.setItem("attendng_selected_class_id", cmOpenClassId);

        window.location.href = page;

    };

    document.getElementById("csManageStudents").addEventListener(
        "click",
        () => goTo("/school/admin/roster.html")
    );

    document.getElementById("csManageSubjects").addEventListener(
        "click",
        () => goTo("/school/admin/class-subjects.html")
    );

}


function renderClasses() {

    const grid = document.getElementById("classGridMount");

    const empty = document.getElementById("classEmpty");

    // ---- summary tiles (whole session, ignoring filters)

    const totalStudents =
        sessionClasses.reduce((n, c) => n + (studentCounts[c.id] || 0), 0);

    document.getElementById("cStatClasses").textContent = sessionClasses.length;
    document.getElementById("cStatStudents").textContent = totalStudents;
    document.getElementById("cStatTeachers").textContent =
        sessionClasses.filter(c => c.teacher_id).length;
    document.getElementById("cStatFinalized").textContent =
        sessionClasses.filter(c => c.is_finalized).length;

    // ---- search + register filter

    const visible = sessionClasses.filter(c => {

        if (cmFilter === "finalized" && !c.is_finalized) {

            return false;

        }

        if (cmFilter === "unlocked" && c.is_finalized) {

            return false;

        }

        if (!cmQuery) {

            return true;

        }

        const teacher = cmTeacher(c);

        return (
            c.name.toLowerCase().includes(cmQuery) ||
            (teacher && teacher.full_name.toLowerCase().includes(cmQuery))
        );

    });

    grid.innerHTML = "";

    empty.style.display = visible.length ? "none" : "block";

    document.getElementById("classEmptyText").textContent =
        sessionClasses.length ?
            "No classes match your search." :
            "No classes yet. Tap “Add class” to create the first one.";


    visible.forEach(classRow => {

        const teacher = cmTeacher(classRow);

        const students = studentCounts[classRow.id] || 0;

        const subjectCount = (classSubjectsByClass[classRow.id] || []).length;

        const registerHtml =
            classRow.is_finalized ?
                `<span class="tm-role tm-role-gold"><i class="fa-solid fa-lock"></i> Finalized</span>` :
                `<span class="tm-role tm-role-green"><i class="fa-solid fa-lock-open"></i> Unlocked</span>`;

        const teacherHtml =
            teacher ?
                `<span class="cm-teacher"><span class="cm-mini-avatar tm-tone-${cmTone(teacher.full_name)}">${cmEsc(cmInitials(teacher.full_name))}</span>${cmEsc(teacher.full_name)}</span>` :
                `<span class="tm-class is-empty"><i class="fa-regular fa-circle"></i> No teacher yet</span>`;

        const card = document.createElement("article");

        card.className = "tm-card";

        card.tabIndex = 0;

        card.setAttribute("role", "button");

        card.setAttribute("aria-haspopup", "dialog");

        card.setAttribute("aria-label", `Open details for ${classRow.name}`);

        card.innerHTML = `
            <div class="tm-card-top">
                <div class="cm-tile tm-tone-${cmTone(classRow.name)}" style="font-size:${cmTileSize(classRow.name)};" aria-hidden="true">${cmEsc(classRow.name)}</div>
                <div class="tm-id">
                    <div class="tm-name">${cmEsc(classRow.name)}</div>
                    ${registerHtml}
                </div>
                <i class="fa-solid fa-chevron-right tm-go" aria-hidden="true"></i>
            </div>

            <div class="tm-meta">
                ${teacherHtml}
                <span class="tm-class tm-teach"><i class="fa-solid fa-user-graduate"></i> ${students} student${students === 1 ? "" : "s"}</span>
                <span class="tm-class ${subjectCount ? "tm-plain" : "is-empty"}"><i class="fa-solid fa-book-open"></i> ${subjectCount} subject${subjectCount === 1 ? "" : "s"}</span>
            </div>
        `;

        const open = () => openClassSheet(classRow.id, card);

        card.addEventListener("click", open);

        card.addEventListener("keydown", (e) => {

            if (e.key === "Enter" || e.key === " ") {

                e.preventDefault();

                open();

            }

        });

        grid.appendChild(card);

    });


    // Keep an open sheet in step with fresh data (after assigning
    // a teacher, for instance); close it if its class is gone.

    if (cmOpenClassId && !document.getElementById("classSheet").hidden) {

        if (sessionClasses.some(c => c.id === cmOpenClassId)) {

            populateClassSheet(cmOpenClassId);

        }
        else {

            closeClassSheet(false);

        }

    }

}


function openClassSheet(classId, returnFocusEl) {

    if (!sessionClasses.some(c => c.id === classId)) {

        return;

    }

    cmOpenClassId = classId;

    cmReturnFocus = returnFocusEl || null;

    populateClassSheet(classId);

    document.getElementById("classSheet").hidden = false;

    document.body.classList.add("tm-sheet-open");

    document.getElementById("csClose").focus();

}


function populateClassSheet(classId) {

    const classRow = sessionClasses.find(c => c.id === classId);

    if (!classRow) {

        return;

    }

    const students = studentCounts[classId] || 0;

    // ---- header

    const tile = document.getElementById("csTile");

    tile.className = `cm-tile cm-tile-lg tm-tone-${cmTone(classRow.name)}`;

    tile.style.fontSize = cmTileSize(classRow.name, true);

    tile.textContent = classRow.name;

    document.getElementById("csName").textContent = classRow.name;

    const register = document.getElementById("csRegister");

    register.className = `tm-role ${classRow.is_finalized ? "tm-role-gold" : "tm-role-green"}`;

    register.innerHTML =
        classRow.is_finalized ?
            `<i class="fa-solid fa-lock"></i> Register finalized` :
            `<i class="fa-solid fa-lock-open"></i> Register unlocked`;

    // ---- form teacher dropdown (one class per teacher)

    const taken = new Set(
        sessionClasses
            .filter(c => c.id !== classId && c.teacher_id)
            .map(c => c.teacher_id)
    );

    document.getElementById("csTeacherMount").replaceChildren(
        createTeacherDropdown({
            options:
                schoolMembers
                    .filter(m => !taken.has(m.id) || m.id === classRow.teacher_id)
                    .map(m => ({ value: m.id, label: m.full_name })),
            value: classRow.teacher_id,
            ariaLabel: `Form teacher for ${classRow.name}`,
            onChange: async (teacherId) => {

                await assignTeacher(classId, teacherId || null);

                // assignTeacher reloads on success; on failure the
                // dropdown would still show the rejected choice, so
                // re-sync it from the saved data.

                if (cmOpenClassId === classId) {

                    populateClassSheet(classId);

                }

            }
        })
    );

    // ---- students

    document.getElementById("csStudents").innerHTML =
        `<strong>${students}</strong> student${students === 1 ? "" : "s"} enrolled`;

    // ---- subjects with who teaches each

    const subjects =
        (classSubjectsByClass[classId] || [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));

    document.getElementById("csSubjects").innerHTML =
        subjects.length ?
            `<div class="cm-subjects">` +
            subjects.map(sub => {

                const t = sub.teacher_id ? schoolMembers.find(m => m.id === sub.teacher_id) : null;

                return `
                    <div class="cm-subject-row">
                        <span class="cm-subject-name"><i class="fa-solid fa-book-open"></i> ${cmEsc(sub.name)}</span>
                        <span class="cm-subject-teacher ${t ? "" : "is-empty"}">${t ? cmEsc(t.full_name) : "Unassigned"}</span>
                    </div>
                `;

            }).join("") +
            `</div>` :
            `<p class="tm-sheet-empty">No subjects added to this class yet.</p>`;

    // ---- actions (same operations as before)

    const safeId = cmEsc(classRow.id);

    const safeName = cmEsc(classRow.name);

    const finalizeBtn =
        classRow.is_finalized ?
            `<button type="button" class="btn-light" data-act="finalize" data-next="false"><i class="fa-solid fa-lock-open"></i> Unlock register</button>` :
            `<button type="button" class="btn-light" data-act="finalize" data-next="true"><i class="fa-solid fa-lock"></i> Finalize register</button>`;

    const deleteBtn =
        students === 0 ?
            `<button type="button" class="btn-danger" data-act="delete"><i class="fa-solid fa-trash-can"></i> Delete class</button>` :
            `<button type="button" class="btn-danger" disabled><i class="fa-solid fa-trash-can"></i> Delete class</button>`;

    const actions = document.getElementById("csActions");

    actions.innerHTML =
        `<button type="button" class="btn-light" data-act="rename"><i class="fa-solid fa-pen"></i> Rename class</button>` +
        finalizeBtn +
        deleteBtn;

    actions.querySelectorAll("button[data-act]").forEach(btn => {

        btn.addEventListener("click", () => {

            const act = btn.dataset.act;

            // Close first so the confirm / edit modals these open
            // aren't stacked on top of the sheet.
            closeClassSheet(false);

            if (act === "rename") { openEditClassModal(classRow.id, classRow.name); }
            else if (act === "finalize") { toggleFinalize(classRow.id, btn.dataset.next === "true"); }
            else if (act === "delete") { deleteClass(classRow.id, classRow.name); }

        });

    });

    const note = document.getElementById("csNote");

    if (students > 0) {

        note.textContent = "A class with students can't be deleted. You can rename it instead.";

        note.style.display = "block";

    }
    else {

        note.style.display = "none";

    }

}


function closeClassSheet(restoreFocus = true) {

    document.getElementById("classSheet").hidden = true;

    document.body.classList.remove("tm-sheet-open");

    cmOpenClassId = null;

    if (restoreFocus && cmReturnFocus && document.contains(cmReturnFocus)) {

        cmReturnFocus.focus();

    }

    cmReturnFocus = null;

}


async function submitAddClass() {

    const errorEl =
        document.getElementById("addClassError");

    const nameInput =
        document.getElementById("newClassName");

    const name =
        nameInput.value.trim().toUpperCase();


    errorEl.style.display =
        "none";


    if (!name) {

        errorEl.textContent =
            "Please enter a class name.";

        errorEl.style.display =
            "block";

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("classes")
            .insert({
                session_id: activeSession.id,
                name
            });


    if (error) {

        errorEl.textContent =
            error.message.includes("duplicate") ?
                "A class with this name already exists this session." :
                (error.message || "Unable to add this class.");

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("addClassModal").style.display =
        "none";

    await loadEverything();

    showToast("Class added successfully");

    logActivity("class.created", name);

}


function openEditClassModal(classId, currentName) {

    editingClassId =
        classId;

    document.getElementById("editClassName").value =
        currentName;

    document.getElementById("editClassError").style.display =
        "none";

    document.getElementById("editClassModal").style.display =
        "flex";

}


async function submitEditClass() {

    const errorEl =
        document.getElementById("editClassError");

    const nameInput =
        document.getElementById("editClassName");

    const name =
        nameInput.value.trim().toUpperCase();

    const previousClass =
        sessionClasses.find(c => c.id === editingClassId);

    const previousName =
        previousClass ? previousClass.name : "";


    errorEl.style.display =
        "none";


    if (!name) {

        errorEl.textContent =
            "Please enter a class name.";

        errorEl.style.display =
            "block";

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("classes")
            .update({ name })
            .eq("id", editingClassId);


    if (error) {

        errorEl.textContent =
            error.message.includes("duplicate") ?
                "A class with this name already exists this session." :
                (error.message || "Unable to rename this class.");

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("editClassModal").style.display =
        "none";

    editingClassId =
        null;

    await loadEverything();

    showToast("Class edited successfully");

    logActivity("class.renamed", name, `${previousName} → ${name}`);

}


function deleteClass(classId, className) {

    pendingDeleteClassId =
        classId;

    pendingDeleteClassName =
        className;

    document.getElementById("deleteClassMessage").textContent =
        `Delete "${className}"? This cannot be undone.`;

    document.getElementById("deleteClassError").style.display =
        "none";

    document.getElementById("deleteClassModal").style.display =
        "flex";

}


async function confirmDeleteClass() {

    const errorEl =
        document.getElementById("deleteClassError");

    errorEl.style.display =
        "none";


    // Belt-and-suspenders: the Delete button is only rendered
    // enabled when studentCounts already shows zero, but re-check
    // here too in case another tab/admin added a student since
    // this page loaded.

    const {
        count,
        error: countError

    } =
        await supabaseClient
            .from("students")
            .select("id", { count: "exact", head: true })
            .eq("class_id", pendingDeleteClassId);

    if (countError) {

        errorEl.textContent =
            "Unable to verify this class is empty: " +
            countError.message;

        errorEl.style.display =
            "block";

        return;

    }

    if (count > 0) {

        document.getElementById("deleteClassModal").style.display =
            "none";

        document.getElementById("deleteBlockedMessage").textContent =
            "This class cannot be deleted because it contains students or attendance records. You can rename the class instead.";

        document.getElementById("deleteBlockedModal").style.display =
            "flex";

        pendingDeleteClassId =
            null;

        pendingDeleteClassName =
            null;

        await loadEverything();

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("classes")
            .delete()
            .eq("id", pendingDeleteClassId);

    if (error) {

        errorEl.textContent =
            "Unable to delete this class: " +
            error.message;

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("deleteClassModal").style.display =
        "none";

    const deletedClassName =
        pendingDeleteClassName;

    pendingDeleteClassId =
        null;

    pendingDeleteClassName =
        null;

    await loadEverything();

    showToast("Class deleted successfully");

    logActivity("class.deleted", deletedClassName);

}


async function assignTeacher(classId, teacherId) {

    const classRow =
        sessionClasses.find(c => c.id === classId);

    const className =
        classRow ? classRow.name : "";

    const previousTeacher =
        classRow && classRow.teacher_id ?
            schoolMembers.find(m => m.id === classRow.teacher_id) :
            null;

    const newTeacher =
        teacherId ?
            schoolMembers.find(m => m.id === teacherId) :
            null;


    const {
        error

    } =
        await supabaseClient
            .from("classes")
            .update({ teacher_id: teacherId })
            .eq("id", classId);


    if (error) {

        alert(
            "Unable to assign this teacher: " +
            error.message
        );

        return;

    }


    await loadEverything();

    logActivity(
        newTeacher ? "class.teacher_assigned" : "class.teacher_unassigned",
        className,
        `${previousTeacher ? previousTeacher.full_name : "Not assigned"} → ${newTeacher ? newTeacher.full_name : "Not assigned"}`
    );

}


function toggleFinalize(classId, nextValue) {

    pendingFinalizeClassId =
        classId;

    pendingFinalizeNextValue =
        nextValue;

    document.getElementById("finalizeConfirmTitle").textContent =
        nextValue ? "Finalize register?" : "Unlock register?";

    document.getElementById("finalizeConfirmMessage").textContent =
        nextValue ?
            "Finalize this register? Student order will be locked — anything added afterward appears at the bottom instead of sorting alphabetically. You can unlock this again anytime." :
            "Unlock this register? Students will go back to sorting alphabetically as new ones are added. You can finalize again anytime.";

    document.getElementById("confirmFinalizeConfirm").textContent =
        nextValue ? "Finalize" : "Unlock";

    document.getElementById("finalizeConfirmModal").style.display =
        "flex";

}


async function confirmToggleFinalize() {

    const classId =
        pendingFinalizeClassId;

    const nextValue =
        pendingFinalizeNextValue;

    document.getElementById("finalizeConfirmModal").style.display =
        "none";

    pendingFinalizeClassId =
        null;

    pendingFinalizeNextValue =
        null;

    if (!classId) {

        return;

    }


    // When finalizing, snapshot the current alphabetical order
    // into each student's `position` before flipping the flag.

    if (nextValue) {

        const {
            data: students,
            error: studentsError

        } =
            await supabaseClient
                .from("students")
                .select("id, surname, first_name")
                .eq("class_id", classId)
                .order("surname")
                .order("first_name");


        if (studentsError) {

            alert(
                "Unable to finalize: " +
                studentsError.message
            );

            return;

        }


        const updates =
            students.map(
                (student, index) =>
                    supabaseClient
                        .from("students")
                        .update({ position: index + 1 })
                        .eq("id", student.id)
            );

        await Promise.all(updates);

    }


    const {
        error

    } =
        await supabaseClient
            .from("classes")
            .update({ is_finalized: nextValue })
            .eq("id", classId);


    if (error) {

        alert(
            "Unable to update register status: " +
            error.message
        );

        return;

    }


    const classRow =
        sessionClasses.find(c => c.id === classId);

    await loadEverything();

    logActivity(
        nextValue ? "class.finalized" : "class.unlocked",
        classRow ? classRow.name : ""
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