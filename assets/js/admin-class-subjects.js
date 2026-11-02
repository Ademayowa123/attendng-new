/*************************************************
 * ADMIN-CLASS-SUBJECTS.JS
 *************************************************/

let classId = null;
let classInfo = null;          // { id, name, session_id }
let sessionInfo = null;        // { id, name }
let schoolSubjects = [];       // every subject in the school's master list
let schoolMembers = [];        // non-genesis members, for the teacher dropdown
let currentClassSubjects = []; // this class's assigned subjects (with subject name joined in)
let pendingRemoveId = null;
let pendingRemoveSubjectName = null;
let csFilter = "all";
let csQuery = "";


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    classId =
        sessionStorage.getItem("attendng_selected_class_id");

    if (!classId) {

        alert(
            "No class selected. Go back to Classes and click " +
            "\"Subjects\" on a class first."
        );

        window.location.href =
            "/school/admin/classes.html";

        return;

    }

    await loadClassAndSession();

    if (!classInfo) {

        alert("That class couldn't be found.");

        window.location.href =
            "/school/admin/classes.html";

        return;

    }

    await Promise.all([
        loadSchoolSubjects(),
        loadSchoolMembers(),
        loadCurrentClassSubjects()
    ]);

    renderTable();

    bindUI();

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

async function loadClassAndSession() {

    const {
        data,
        error

    } =
        await supabaseClient
            .from("classes")
            .select(
                `
                id, name, session_id, teacher_id,
                sessions ( id, name )
                `
            )
            .eq("id", classId)
            .maybeSingle();


    if (error) {

        console.error(
            "Unable to load class:",
            error
        );

        return;

    }


    if (!data) {

        return;

    }


    classInfo = {
        id: data.id,
        name: data.name,
        session_id: data.session_id,
        teacher_id: data.teacher_id
    };

    sessionInfo =
        data.sessions;


    document.getElementById("pageTitle").textContent =
        `${classInfo.name} — Subjects`;

    document.getElementById("sessionLabel").textContent =
        sessionInfo ? sessionInfo.name : "";

}


async function loadSchoolSubjects() {

    const {
        data,
        error

    } =
        await supabaseClient
            .from("subjects")
            .select("id, name")
            .eq("school_id", AttendNGContext.schoolId)
            .order("name");

    if (error) {

        console.error(
            "Unable to load subjects:",
            error
        );

        return;

    }

    schoolSubjects =
        data;

}


async function loadSchoolMembers() {

    const {
        data,
        error

    } =
        await supabaseClient
            .from("school_members")
            .select("id, full_name, is_genesis")
            .eq("school_id", AttendNGContext.schoolId)
            .eq("is_genesis", false)
            .order("full_name");

    if (error) {

        console.error(
            "Unable to load members:",
            error
        );

        return;

    }

    schoolMembers =
        data;

}


async function loadCurrentClassSubjects() {

    const {
        data,
        error

    } =
        await supabaseClient
            .from("class_subjects")
            .select(
                `
                id, teacher_id,
                subjects ( id, name )
                `
            )
            .eq("class_id", classId);

    if (error) {

        console.error(
            "Unable to load this class's subjects:",
            error
        );

        return;

    }

    currentClassSubjects =
        data
            .map(
                row => ({
                    id: row.id,
                    teacher_id: row.teacher_id,
                    subject_id: row.subjects ? row.subjects.id : null,
                    subject_name: row.subjects ? row.subjects.name : "(deleted subject)"
                })
            )
            .sort(
                (a, b) => a.subject_name.localeCompare(b.subject_name)
            );

}


/* ==========================================
   RENDER
========================================== */

function csEsc(value) {

    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}

const CS_TONES = ["teal", "indigo", "amber", "green", "rose", "sky"];

function csTone(name) {

    let hash = 0;

    for (const ch of String(name || "")) {

        hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

    }

    return CS_TONES[hash % CS_TONES.length];

}

function csInitials(name) {

    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

    if (!parts.length) {

        return "?";

    }

    if (parts.length === 1) {

        return parts[0].slice(0, 2).toUpperCase();

    }

    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

}


function renderTable() {

    const grid =
        document.getElementById("subjectGridMount");

    const empty =
        document.getElementById("noClassSubjectsNotice");


    // ---- summary tiles (whole class, ignoring filters)

    const withTeacher =
        currentClassSubjects.filter(r => r.teacher_id);

    document.getElementById("sStatTotal").textContent =
        currentClassSubjects.length;

    document.getElementById("sStatAssigned").textContent =
        withTeacher.length;

    document.getElementById("sStatNeeds").textContent =
        currentClassSubjects.length - withTeacher.length;

    document.getElementById("sStatTeachers").textContent =
        new Set(withTeacher.map(r => r.teacher_id)).size;


    // ---- search + status filter

    const visible =
        currentClassSubjects.filter(
            row => {

                if (csFilter === "assigned" && !row.teacher_id) {

                    return false;

                }

                if (csFilter === "needs" && row.teacher_id) {

                    return false;

                }

                if (!csQuery) {

                    return true;

                }

                const teacher =
                    row.teacher_id ?
                        schoolMembers.find(m => m.id === row.teacher_id) :
                        null;

                return (
                    row.subject_name.toLowerCase().includes(csQuery) ||
                    (teacher && teacher.full_name.toLowerCase().includes(csQuery))
                );

            }
        );

    grid.innerHTML =
        "";

    empty.style.display =
        visible.length ? "none" : "block";

    document.getElementById("subjectEmptyText").textContent =
        currentClassSubjects.length ?
            "No subjects match your search." :
            "No subjects assigned to this class yet. Tap “Add subject” to start.";


    visible.forEach(
        row => {

            const teacher =
                row.teacher_id ?
                    schoolMembers.find(m => m.id === row.teacher_id) :
                    null;

            const statusHtml =
                row.teacher_id ?
                    `<span class="tm-role tm-role-green"><i class="fa-solid fa-circle-check"></i> Teacher assigned</span>` :
                    `<span class="tm-role tm-role-gold"><i class="fa-solid fa-triangle-exclamation"></i> Needs a teacher</span>`;

            const card =
                document.createElement("article");

            card.className =
                "tm-card cs-card";

            card.innerHTML = `
                <div class="tm-card-top">
                    <div class="cm-tile cs-tile tm-tone-${csTone(row.subject_name)}" aria-hidden="true">
                        <i class="fa-solid fa-book-open"></i>
                    </div>
                    <div class="tm-id">
                        <div class="tm-name">${csEsc(row.subject_name)}</div>
                        ${statusHtml}
                    </div>
                    <button type="button" class="cs-remove remove-class-subject-btn" data-class-subject-id="${csEsc(row.id)}" data-subject-name="${csEsc(row.subject_name)}" aria-label="Remove ${csEsc(row.subject_name)} from this class" title="Remove from class">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>

                <div class="tm-meta">
                    <span class="cs-label">Teacher</span>
                    <div class="cs-dd-mount"></div>
                </div>
            `;

            card.querySelector(".cs-dd-mount").replaceWith(
                createTeacherDropdown({
                    options: schoolMembers.map(m => ({ value: m.id, label: m.full_name })),
                    value: row.teacher_id,
                    ariaLabel: `Teacher for ${row.subject_name}`,
                    onChange: (teacherId) => assignSubjectTeacher(row.id, teacherId || null)
                })
            );

            grid.appendChild(card);

        }
    );


    grid.querySelectorAll(".remove-class-subject-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => promptRemoveClassSubject(btn.dataset.classSubjectId, btn.dataset.subjectName)
            );

        }
    );

}


/* ==========================================
   UI BINDING
========================================== */

function bindUI() {

    const search =
        document.getElementById("subjectSearch");

    search.addEventListener(
        "input",
        () => {

            csQuery =
                search.value.trim().toLowerCase();

            renderTable();

        }
    );

    document.querySelectorAll(".tm-chip").forEach(
        chip => {

            chip.addEventListener(
                "click",
                () => {

                    csFilter =
                        chip.dataset.filter;

                    document.querySelectorAll(".tm-chip").forEach(
                        c => c.classList.toggle("is-active", c === chip)
                    );

                    renderTable();

                }
            );

        }
    );


    document.getElementById("openAddClassSubject").addEventListener(
        "click",
        openAddClassSubjectModal
    );


    document.getElementById("cancelAddClassSubject").addEventListener(
        "click",
        () => {

            document.getElementById("addClassSubjectModal").style.display =
                "none";

        }
    );


    document.getElementById("submitAddClassSubject").addEventListener(
        "click",
        submitAddClassSubject
    );


    document.getElementById("cancelRemoveClassSubject").addEventListener(
        "click",
        () => {

            document.getElementById("removeClassSubjectModal").style.display =
                "none";

            pendingRemoveId =
                null;

            pendingRemoveSubjectName =
                null;

        }
    );


    document.getElementById("confirmRemoveClassSubject").addEventListener(
        "click",
        confirmRemoveClassSubject
    );


    document.getElementById("closeRemoveBlockedModal").addEventListener(
        "click",
        () => {

            document.getElementById("removeBlockedModal").style.display =
                "none";

        }
    );

}


function openAddClassSubjectModal() {

    const assignedSubjectIds =
        new Set(currentClassSubjects.map(r => r.subject_id));

    const availableSubjects =
        schoolSubjects.filter(s => !assignedSubjectIds.has(s.id));


    const subjectSelect =
        document.getElementById("addClassSubjectSelect");

    const submitBtn =
        document.getElementById("submitAddClassSubject");

    const noMoreSubjectsNotice =
        document.getElementById("noMoreSubjectsNotice");


    document.getElementById("addClassSubjectError").style.display =
        "none";

    document.getElementById("addClassSubjectTeacher").innerHTML =
        `<option value="">Not assigned yet</option>` +
        schoolMembers.map(m => `<option value="${csEsc(m.id)}">${csEsc(m.full_name)}</option>`).join("");


    if (availableSubjects.length === 0) {

        subjectSelect.innerHTML =
            "";

        subjectSelect.disabled =
            true;

        submitBtn.disabled =
            true;

        noMoreSubjectsNotice.style.display =
            "block";

    }
    else {

        subjectSelect.disabled =
            false;

        submitBtn.disabled =
            false;

        noMoreSubjectsNotice.style.display =
            "none";

        subjectSelect.innerHTML =
            availableSubjects.map(s => `<option value="${csEsc(s.id)}">${csEsc(s.name)}</option>`).join("");

    }


    document.getElementById("addClassSubjectModal").style.display =
        "flex";

}


/* ==========================================
   ACTIONS
========================================== */

async function submitAddClassSubject() {

    const errorEl =
        document.getElementById("addClassSubjectError");

    const subjectId =
        document.getElementById("addClassSubjectSelect").value;

    const teacherId =
        document.getElementById("addClassSubjectTeacher").value || null;


    errorEl.style.display =
        "none";


    if (!subjectId) {

        errorEl.textContent =
            "Please choose a subject.";

        errorEl.style.display =
            "block";

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("class_subjects")
            .insert({
                class_id: classId,
                subject_id: subjectId,
                teacher_id: teacherId
            });


    if (error) {

        errorEl.textContent =
            error.message || "Unable to add this subject to the class.";

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("addClassSubjectModal").style.display =
        "none";

    await loadCurrentClassSubjects();

    renderTable();

    showToast("Subject added to class");

    const subject =
        schoolSubjects.find(s => s.id === subjectId);

    logActivity(
        "class_subject.assigned",
        classInfo.name,
        subject ? subject.name : ""
    );

}


async function assignSubjectTeacher(classSubjectId, teacherId) {

    const row =
        currentClassSubjects.find(r => r.id === classSubjectId);

    const previousTeacher =
        row && row.teacher_id ?
            schoolMembers.find(m => m.id === row.teacher_id) :
            null;

    const newTeacher =
        teacherId ?
            schoolMembers.find(m => m.id === teacherId) :
            null;


    const {
        error

    } =
        await supabaseClient
            .from("class_subjects")
            .update({ teacher_id: teacherId })
            .eq("id", classSubjectId);


    if (error) {

        alert(
            "Unable to assign this teacher: " +
            error.message
        );

        // The dropdown still shows the rejected choice — put it back.
        renderTable();

        return;

    }


    await loadCurrentClassSubjects();

    renderTable();

    logActivity(
        "class_subject.teacher_assigned",
        `${classInfo.name} — ${row ? row.subject_name : ""}`,
        `${previousTeacher ? previousTeacher.full_name : "Not assigned"} → ${newTeacher ? newTeacher.full_name : "Not assigned"}`
    );

}


function promptRemoveClassSubject(classSubjectId, subjectName) {

    pendingRemoveId =
        classSubjectId;

    pendingRemoveSubjectName =
        subjectName;

    document.getElementById("removeClassSubjectMessage").textContent =
        `Remove "${subjectName}" from ${classInfo.name}? This cannot be undone.`;

    document.getElementById("removeClassSubjectError").style.display =
        "none";

    document.getElementById("removeClassSubjectModal").style.display =
        "flex";

}


async function confirmRemoveClassSubject() {

    const errorEl =
        document.getElementById("removeClassSubjectError");

    errorEl.style.display =
        "none";


    // Scores reference class_subjects — if any scores have already
    // been entered under this assignment, removing it would silently
    // wipe recorded results. Block it instead, same guard as deleting
    // an in-use subject.

    const {
        count,
        error: countError

    } =
        await supabaseClient
            .from("scores")
            .select("id", { count: "exact", head: true })
            .eq("class_subject_id", pendingRemoveId);

    if (countError) {

        errorEl.textContent =
            "Unable to verify this subject has no scores yet: " +
            countError.message;

        errorEl.style.display =
            "block";

        return;

    }

    if (count > 0) {

        document.getElementById("removeClassSubjectModal").style.display =
            "none";

        document.getElementById("removeBlockedMessage").textContent =
            "This subject can't be removed because scores have already been entered for it in this class.";

        document.getElementById("removeBlockedModal").style.display =
            "flex";

        pendingRemoveId =
            null;

        pendingRemoveSubjectName =
            null;

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("class_subjects")
            .delete()
            .eq("id", pendingRemoveId);

    if (error) {

        errorEl.textContent =
            "Unable to remove this subject: " +
            error.message;

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("removeClassSubjectModal").style.display =
        "none";

    const removedSubjectName =
        pendingRemoveSubjectName;

    pendingRemoveId =
        null;

    pendingRemoveSubjectName =
        null;

    await loadCurrentClassSubjects();

    renderTable();

    showToast("Subject removed from class");

    logActivity(
        "class_subject.removed",
        classInfo.name,
        removedSubjectName
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