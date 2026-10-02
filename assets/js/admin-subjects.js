/*************************************************
 * ADMIN-SUBJECTS.JS
 *************************************************/

let schoolSubjects = [];       // this school's subjects
let classSubjectCounts = {};   // subject_id -> number of classes currently using it
let editingSubjectId = null;
let pendingDeleteSubjectId = null;
let pendingDeleteSubjectName = null;


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

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


    renderSubjectsTable();

}


function renderSubjectsTable() {

    // Counter in the page header — updates after every add, edit and delete.
    document.getElementById("subjectCount").textContent =
        `${schoolSubjects.length} subject${schoolSubjects.length === 1 ? "" : "s"}`;

    const tbody =
        document.getElementById("subjectsTableBody");

    const noSubjectsNotice =
        document.getElementById("noSubjectsNotice");


    if (schoolSubjects.length === 0) {

        tbody.innerHTML =
            "";

        noSubjectsNotice.style.display =
            "block";

        return;

    }


    noSubjectsNotice.style.display =
        "none";

    tbody.innerHTML =
        schoolSubjects.map(
            subject => {

                const classCount =
                    classSubjectCounts[subject.id] || 0;

                return `
                    <tr style="border-bottom:1px solid var(--border);">
                        <td class="sticky-col1" style="padding:10px 8px;">${subject.name}</td>
                        <td style="padding:10px 8px;">${classCount}</td>
                        <td style="padding:10px 8px; text-align:right; white-space:nowrap;">
                            <button type="button" class="icon-btn icon-btn-edit edit-subject-btn" data-subject-id="${subject.id}" aria-label="Edit subject" title="Edit">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button type="button" class="icon-btn icon-btn-delete delete-subject-btn" data-subject-id="${subject.id}" aria-label="Delete subject" title="Delete">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;

            }
        ).join("");


    tbody.querySelectorAll(".edit-subject-btn").forEach(
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


    tbody.querySelectorAll(".delete-subject-btn").forEach(
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