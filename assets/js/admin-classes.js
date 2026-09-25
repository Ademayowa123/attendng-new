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


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

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


    renderClasses();

}


function renderClasses() {

    const tbody =
        document.getElementById("classesTableBody");

    tbody.innerHTML =
        "";


    // Teachers already assigned to SOME class this session —
    // used to keep one-teacher-per-class true in the dropdowns.

    const assignedElsewhere =
        (excludeClassId) =>
            new Set(
                sessionClasses
                    .filter(c => c.id !== excludeClassId && c.teacher_id)
                    .map(c => c.teacher_id)
            );


    sessionClasses.forEach(
        classRow => {

            const taken =
                assignedElsewhere(classRow.id);

            const options =
                schoolMembers
                    .filter(m => !taken.has(m.id) || m.id === classRow.teacher_id)
                    .map(
                        m => `<option value="${m.id}" ${m.id === classRow.teacher_id ? "selected" : ""}>${m.full_name}</option>`
                    )
                    .join("");


            const registerBadge =
                classRow.is_finalized ?
                    `<span class="badge badge-warning">Finalized</span>` :
                    `<span class="badge badge-success">Unlocked</span>`;

            const registerBtnLabel =
                classRow.is_finalized ? "Unlock" : "Finalize";

            const registerBtnClass =
                classRow.is_finalized ? "btn-unlock-action" : "btn-finalize-action";


            const studentCount =
                studentCounts[classRow.id] || 0;

            const deleteBtnHtml =
                studentCount === 0 ?
                    `<button class="btn-delete-class delete-class-btn" data-class-id="${classRow.id}" data-name="${classRow.name}">Delete</button>` :
                    `<button class="btn-delete-class" disabled title="This class cannot be deleted because it contains students or attendance records. You can rename the class instead.">Delete</button>`;


            const row =
                document.createElement("tr");

            row.style.borderBottom =
                "1px solid var(--border)";

            row.innerHTML = `
                <td class="sticky-col1" style="padding:10px 8px; font-weight:500;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span>${classRow.name}</span>
                        <button class="icon-btn icon-btn-edit edit-class-btn" data-class-id="${classRow.id}" data-name="${classRow.name}" aria-label="Edit class name" title="Edit class name">
                            <i class="fa-solid fa-pen" style="font-size:11px;"></i>
                        </button>
                    </div>
                </td>
                <td style="padding:10px 8px;">
                    <select class="teacher-select" data-class-id="${classRow.id}">
                        <option value="">Not assigned</option>
                        ${options}
                    </select>
                </td>
                <td style="padding:10px 8px;">${registerBadge}</td>
                <td style="padding:10px 8px; text-align:right; white-space:nowrap;">
                    <button class="btn-manage-students manage-students-btn" data-class-id="${classRow.id}" style="margin-right:6px;">
                        Manage students
                    </button>
                    <button class="${registerBtnClass} finalize-btn" data-class-id="${classRow.id}" data-next="${!classRow.is_finalized}" style="margin-right:6px;">
                        ${registerBtnLabel}
                    </button>
                    ${deleteBtnHtml}
                </td>
            `;

            tbody.appendChild(row);

        }
    );


    tbody.querySelectorAll(".edit-class-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => openEditClassModal(btn.dataset.classId, btn.dataset.name)
            );

        }
    );


    tbody.querySelectorAll(".delete-class-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => deleteClass(btn.dataset.classId, btn.dataset.name)
            );

        }
    );


    tbody.querySelectorAll(".teacher-select").forEach(
        select => {

            select.addEventListener(
                "change",
                () => assignTeacher(select.dataset.classId, select.value || null)
            );

        }
    );


    tbody.querySelectorAll(".manage-students-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => {

                    sessionStorage.setItem(
                        "attendng_selected_class_id",
                        btn.dataset.classId
                    );

                    window.location.href =
                        "/school/admin/roster.html";

                }
            );

        }
    );


    tbody.querySelectorAll(".finalize-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => toggleFinalize(btn.dataset.classId, btn.dataset.next === "true")
            );

        }
    );

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