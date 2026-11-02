/*************************************************
 * ADMIN-ROSTER.JS
 *************************************************/

let classId = null;
let classInfo = null;      // { id, name, session_id, is_finalized }
let sessionInfo = null;    // { id, name }
let otherClasses = [];     // other classes in the same session (for "move")
let allStudents = [];      // full roster, unfiltered
let editingStudentId = null; // set when the Add Student modal is being used to edit
let pendingDeleteStudentId = null;
let pendingDeleteStudentName = null;
let activeGender = "all";   // all | male | female
let searchTerm = "";
let rowMenuState = null;     // { studentId, anchor, from } while the row menu is open


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    classId =
        sessionStorage.getItem("attendng_selected_class_id");

    console.log(
        "DEBUG — classId from sessionStorage:", classId
    );

    if (!classId) {

        alert(
            "No class selected. Go back to Classes and click " +
            "\"Manage students\" on a class first."
        );

        window.location.href =
            "/school/admin/classes.html";

        return;

    }

    await loadClassAndSession();

    if (!classInfo) {

        // RLS returned nothing — either the class doesn't
        // exist, or doesn't belong to this admin's school.

        alert("That class couldn't be found.");

        window.location.href =
            "/school/admin/classes.html";

        return;

    }

    await Promise.all([
        loadOtherClasses(),
        loadStudents()
    ]);

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
                id, name, session_id, is_finalized,
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
        is_finalized: data.is_finalized
    };

    sessionInfo =
        data.sessions;


    const tile =
        document.getElementById("classTile");

    tile.textContent =
        classInfo.name;

    tile.className =
        "rs-tile " + stClassTone(classInfo.name);

    document.getElementById("registerStatusBadge").innerHTML =
        classInfo.is_finalized ?
            `<span class="st-pill st-pill-locked"><i class="fa-solid fa-lock" aria-hidden="true"></i> Register finalized</span>` :
            `<span class="st-pill st-pill-open"><i class="fa-solid fa-lock-open" aria-hidden="true"></i> Register unlocked</span>`;

}


async function loadOtherClasses() {

    const {
        data,
        error

    } =
        await supabaseClient
            .from("classes")
            .select("id, name")
            .eq("session_id", classInfo.session_id)
            .neq("id", classId)
            .order("name");


    if (error) {

        console.error(
            "Unable to load other classes:",
            error
        );

        return;

    }

    otherClasses =
        data;

}


async function loadStudents() {

    let query =
        supabaseClient
            .from("students")
            .select("id, surname, first_name, other_name, gender, position, admission_no, date_of_birth")
            .eq("class_id", classId);

    query =
        classInfo.is_finalized ?
            query.order("position") :
            query.order("surname").order("first_name");


    const {
        data,
        error

    } =
        await query;


    if (error) {

        console.error(
            "Unable to load students:",
            error
        );

        return;

    }

    allStudents =
        data;

    refreshSummary();

    applyRosterFilter();

}


/* ==========================================
   SMALL HELPERS
========================================== */

function stEscape(value) {

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


function stHash(text) {

    let sum = 0;

    String(text || "").split("").forEach(
        ch => { sum += ch.charCodeAt(0); }
    );

    return sum;

}


// Same colours the Results page uses for a class tile.
function stClassTone(name) {

    const tones =
        ["rs-tone-teal", "rs-tone-indigo", "rs-tone-amber"];

    const digits =
        String(name || "").match(/\d+/);

    if (digits) {

        return tones[(((parseInt(digits[0], 10) - 1) % 3) + 3) % 3];

    }

    return tones[stHash(name) % 3];

}


function genderLabel(gender) {

    return gender === "male" ? "Male" :
        gender === "female" ? "Female" :
        "";

}


function genderChip(gender) {

    const label =
        genderLabel(gender);

    return label ?
        `<span class="st-gender st-${gender}">${label}</span>` :
        `<span class="st-gender st-unspecified">Not set</span>`;

}


/* ==========================================
   SUMMARY TILES + FILTERS
========================================== */

function refreshSummary() {

    const total =
        allStudents.length;

    const male =
        allStudents.filter(s => s.gender === "male").length;

    const female =
        allStudents.filter(s => s.gender === "female").length;

    const missing =
        allStudents.filter(s => !(s.admission_no || "").trim()).length;

    document.getElementById("studentCount").textContent = total;
    document.getElementById("maleCount").textContent = male;
    document.getElementById("femaleCount").textContent = female;
    document.getElementById("missingCount").textContent = missing;

    document.getElementById("countAll").textContent = total;
    document.getElementById("countMale").textContent = male;
    document.getElementById("countFemale").textContent = female;

    document.getElementById("genderBar").innerHTML =
        (male + female) === 0 ?
            "" :
            `<span class="st-bar-male" style="flex:${male} 1 0"></span><span class="st-bar-female" style="flex:${female} 1 0"></span>`;

}


function applyRosterFilter() {

    const tokens =
        searchTerm.split(/\s+/).filter(Boolean);

    const list =
        allStudents.filter(
            student => {

                if (activeGender !== "all" && student.gender !== activeGender) {

                    return false;

                }

                const name =
                    `${student.surname} ${student.first_name} ${student.other_name || ""}`.toLowerCase();

                return tokens.every(token => name.includes(token));

            }
        );

    renderStudents(list);

}


/* ==========================================
   RENDER
========================================== */

function renderStudents(list) {

    const listEl =
        document.getElementById("studentList");

    listEl.innerHTML =
        list.map(
            student => {

                const serial =
                    allStudents.indexOf(student) + 1;

                const initials =
                    (
                        (student.surname || "").charAt(0) +
                        (student.first_name || "").charAt(0)
                    ).toUpperCase() || "?";

                const fullName =
                    `${student.surname} ${student.first_name}`;

                const admission =
                    (student.admission_no || "").trim();

                const metaParts =
                    [
                        admission || "No admission number",
                        genderLabel(student.gender)
                    ].filter(Boolean);

                return `
                    <div class="st-item" data-student-id="${stEscape(student.id)}" data-name="${stEscape(fullName)}">
                        <div class="st-row st-cols">

                            <span class="st-num">${serial}</span>

                            <div class="st-student">
                                <span class="rs-avatar rs-av-${stHash(fullName) % 5}" aria-hidden="true">${stEscape(initials)}</span>
                                <div class="st-id">
                                    <span class="st-name"><b>${stEscape(student.surname)}</b> ${stEscape(student.first_name)} ${stEscape(student.other_name || "")}</span>
                                    <span class="st-meta">${stEscape(metaParts.join(" · "))}</span>
                                </div>
                            </div>

                            <span class="st-adm">${
                                admission ?
                                    stEscape(admission) :
                                    `<button type="button" class="st-link-warn" data-act="add-adm">Add number</button>`
                            }</span>

                            <span class="st-gender-cell">${genderChip(student.gender)}</span>

                            <div class="st-actions">
                                <button type="button" class="st-icon" data-act="edit" aria-label="Edit ${stEscape(fullName)}" title="Edit"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
                                ${otherClasses.length ? `<button type="button" class="st-icon" data-act="move" aria-label="Move ${stEscape(fullName)} to another class" title="Move to another class"><i class="fa-solid fa-right-left" aria-hidden="true"></i></button>` : ""}
                                <button type="button" class="st-icon is-danger" data-act="delete" aria-label="Delete ${stEscape(fullName)}" title="Delete"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                            </div>

                            <button type="button" class="st-icon st-more" data-act="more" aria-label="Actions for ${stEscape(fullName)}" aria-haspopup="true"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button>

                        </div>
                    </div>
                `;

            }
        ).join("");


    const note =
        document.getElementById("listNote");

    if (allStudents.length === 0) {

        note.textContent =
            "No students in this class yet. Add a student or import a class list.";

        note.hidden =
            false;

    }
    else if (list.length === 0) {

        note.textContent =
            "No students match your search.";

        note.hidden =
            false;

    }
    else {

        note.hidden =
            true;

    }

    document.getElementById("showingCount").textContent =
        `Showing ${list.length} of ${allStudents.length} student${allStudents.length === 1 ? "" : "s"}`;

}


/* ==========================================
   ROW MENU (move / edit / delete)
========================================== */

function openRowMenu(anchor, studentId, mode) {

    rowMenuState =
        { studentId, anchor, from: mode };

    renderRowMenu(mode);

    const menu =
        document.getElementById("rowMenu");

    menu.hidden =
        false;

    positionRowMenu();

}


function renderRowMenu(mode) {

    const menu =
        document.getElementById("rowMenu");

    if (mode === "move") {

        const back =
            rowMenuState.from === "more" ?
                `<button type="button" data-menu="back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back</button>` :
                "";

        menu.innerHTML =
            `${back}<div class="st-menu-title">Move to</div>` +
            (
                otherClasses.length ?
                    otherClasses.map(
                        c => `<button type="button" data-menu="move-to" data-class-id="${stEscape(c.id)}">${stEscape(c.name)}</button>`
                    ).join("") :
                    `<p class="st-menu-empty">No other classes in this session.</p>`
            );

        return;

    }

    menu.innerHTML = `
        <button type="button" data-menu="edit"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit student</button>
        ${otherClasses.length ? `<button type="button" data-menu="move"><i class="fa-solid fa-right-left" aria-hidden="true"></i> Move to…</button>` : ""}
        <button type="button" data-menu="delete" class="is-danger"><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button>
    `;

}


function positionRowMenu() {

    const menu =
        document.getElementById("rowMenu");

    const rect =
        rowMenuState.anchor.getBoundingClientRect();

    const width =
        menu.offsetWidth;

    const height =
        menu.offsetHeight;

    const left =
        Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));

    const below =
        rect.bottom + height + 12 <= window.innerHeight;

    menu.style.left =
        (left + window.scrollX) + "px";

    menu.style.top =
        ((below ? rect.bottom + 6 : rect.top - height - 6) + window.scrollY) + "px";

}


function closeRowMenu() {

    rowMenuState =
        null;

    document.getElementById("rowMenu").hidden =
        true;

}


function closeImportMenu() {

    document.getElementById("importMenu").hidden =
        true;

    document.getElementById("importMenuBtn").setAttribute("aria-expanded", "false");

}


/* ==========================================
   UI WIRING
========================================== */

function bindUI() {

    // SEARCH + GENDER FILTER

    document.getElementById("searchStudent").addEventListener(
        "input",
        (event) => {

            searchTerm =
                event.target.value.trim().toLowerCase();

            applyRosterFilter();

        }
    );

    document.querySelectorAll(".rs-filter").forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    activeGender =
                        button.dataset.gender;

                    document.querySelectorAll(".rs-filter").forEach(
                        other => {

                            const active =
                                other === button;

                            other.classList.toggle("is-active", active);

                            other.setAttribute("aria-pressed", String(active));

                        }
                    );

                    applyRosterFilter();

                }
            );

        }
    );


    // IMPORT DROPDOWN

    const importMenu =
        document.getElementById("importMenu");

    const importMenuBtn =
        document.getElementById("importMenuBtn");

    importMenuBtn.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();

            closeRowMenu();

            importMenu.hidden =
                !importMenu.hidden;

            importMenuBtn.setAttribute("aria-expanded", String(!importMenu.hidden));

        }
    );

    importMenu.addEventListener("click", closeImportMenu);


    // STUDENT ROWS (edit / move / delete / add number)

    const rowList =
        document.getElementById("studentList");

    rowList.addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest("[data-act]");

            const item =
                event.target.closest(".st-item");

            if (!button || !item) {

                return;

            }

            event.stopPropagation();

            const studentId =
                item.dataset.studentId;

            const action =
                button.dataset.act;

            if (action === "edit") {

                closeRowMenu();

                openEditModal(studentId);

            }
            else if (action === "add-adm") {

                closeRowMenu();

                openEditModal(studentId);

                document.getElementById("admissionno").focus();

            }
            else if (action === "delete") {

                closeRowMenu();

                deleteStudent(studentId, item.dataset.name);

            }
            else if (action === "move" || action === "more") {

                closeImportMenu();

                const sameButton =
                    rowMenuState &&
                    rowMenuState.anchor === button &&
                    !document.getElementById("rowMenu").hidden;

                if (sameButton) {

                    closeRowMenu();

                }
                else {

                    openRowMenu(button, studentId, action);

                }

            }

        }
    );


    document.getElementById("rowMenu").addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest("[data-menu]");

            if (!button || !rowMenuState) {

                return;

            }

            event.stopPropagation();

            const studentId =
                rowMenuState.studentId;

            const choice =
                button.dataset.menu;

            if (choice === "move") {

                renderRowMenu("move");

                positionRowMenu();

            }
            else if (choice === "back") {

                renderRowMenu("more");

                positionRowMenu();

            }
            else if (choice === "edit") {

                closeRowMenu();

                openEditModal(studentId);

            }
            else if (choice === "delete") {

                const student =
                    allStudents.find(s => s.id === studentId);

                closeRowMenu();

                if (student) {

                    deleteStudent(studentId, `${student.surname} ${student.first_name}`);

                }

            }
            else if (choice === "move-to") {

                closeRowMenu();

                moveStudent(studentId, button.dataset.classId);

            }

        }
    );

    document.addEventListener(
        "click",
        () => {

            closeRowMenu();

            closeImportMenu();

        }
    );

    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape") {

                closeRowMenu();

                closeImportMenu();

            }

        }
    );

    window.addEventListener("scroll", closeRowMenu, { passive: true });

    window.addEventListener("resize", closeRowMenu);


    // ADD STUDENT MODAL

    const modal =
        document.getElementById("studentModal");

    document.getElementById("addStudentBtn").addEventListener(
        "click",
        () => {

            editingStudentId =
                null;

            document.getElementById("studentModalTitle").textContent =
                "Add Student";

            document.getElementById("studentForm").reset();

            document.getElementById("studentFormError").style.display =
                "none";

            modal.classList.add("show");

        }
    );

    document.getElementById("closeModal").addEventListener(
        "click",
        () => modal.classList.remove("show")
    );

    document.getElementById("cancelBtn").addEventListener(
        "click",
        () => modal.classList.remove("show")
    );

    document.getElementById("studentForm").addEventListener(
        "submit",
        submitAddStudent
    );


    document.getElementById("viewReportsBtn").addEventListener(
        "click",
        () => {

            sessionStorage.setItem(
                "attendng_report_override",
                JSON.stringify({
                    classId: classInfo.id,
                    className: classInfo.name,
                    sessionId: classInfo.session_id,
                    sessionName: sessionInfo ? sessionInfo.name : "",
                    currentTerm: AttendNGContext.currentTerm,
                    classIsFinalized: classInfo.is_finalized,
                    schoolName: AttendNGContext.schoolName
                })
            );

            window.location.href =
                "/school/report-weekly.html";

        }
    );

    document.getElementById("viewAnalyticsBtn").addEventListener(
        "click",
        () => {

            sessionStorage.setItem(
                "attendng_report_override",
                JSON.stringify({
                    classId: classInfo.id,
                    className: classInfo.name,
                    sessionId: classInfo.session_id,
                    sessionName: sessionInfo ? sessionInfo.name : "",
                    currentTerm: AttendNGContext.currentTerm,
                    classIsFinalized: classInfo.is_finalized,
                    schoolName: AttendNGContext.schoolName
                })
            );

            window.location.href =
                "/school/analytics.html";

        }
    );


    // TEMPLATE + IMPORT

    document.getElementById("downloadTemplateBtn").addEventListener(
        "click",
        downloadTemplate
    );

    document.getElementById("importStudentsBtn").addEventListener(
        "click",
        () => document.getElementById("studentImportFile").click()
    );

    document.getElementById("studentImportFile").addEventListener(
        "change",
        handleImportFile
    );


    document.getElementById("closeImportSummary").addEventListener(
        "click",
        () => document.getElementById("importSummaryModal").classList.remove("show")
    );

    document.getElementById("closeImportSummaryBtn").addEventListener(
        "click",
        () => document.getElementById("importSummaryModal").classList.remove("show")
    );


    // DELETE STUDENT MODAL

    document.getElementById("cancelDeleteStudent").addEventListener(
        "click",
        () => {

            document.getElementById("deleteStudentModal").style.display =
                "none";

            pendingDeleteStudentId =
                null;

            pendingDeleteStudentName =
                null;

        }
    );

    document.getElementById("confirmDeleteStudent").addEventListener(
        "click",
        confirmDeleteStudent
    );

}


/* ==========================================
   EDIT STUDENT
========================================== */

function openEditModal(studentId) {

    const student =
        allStudents.find(s => s.id === studentId);

    if (!student) {

        return;

    }

    editingStudentId =
        studentId;

    document.getElementById("studentModalTitle").textContent =
        "Edit Student";

    document.getElementById("surname").value =
        student.surname;

    document.getElementById("firstname").value =
        student.first_name;

    document.getElementById("othername").value =
        student.other_name || "";

    document.getElementById("gender").value =
        student.gender || "male";

    document.getElementById("admissionno").value =
        student.admission_no || "";

    document.getElementById("dob").value =
        student.date_of_birth || "";

    document.getElementById("studentFormError").style.display =
        "none";

    document.getElementById("studentModal").classList.add("show");

}


/* ==========================================
   ADD / EDIT STUDENT (SUBMIT)
========================================== */

async function findDuplicateStudent(surname, firstName, excludeStudentId) {

    const sessionClassIds =
        [classId, ...otherClasses.map(c => c.id)];

    let query =
        supabaseClient
            .from("students")
            .select("id, class_id")
            .in("class_id", sessionClassIds)
            .ilike("surname", surname)
            .ilike("first_name", firstName);

    if (excludeStudentId) {

        query =
            query.neq("id", excludeStudentId);

    }

    const {
        data,
        error

    } =
        await query;

    if (error) {

        return { duplicateClassName: null, error };

    }

    if (!data || data.length === 0) {

        return { duplicateClassName: null, error: null };

    }

    const match =
        data[0];

    const duplicateClassName =
        match.class_id === classId ?
            classInfo.name :
            ((otherClasses.find(c => c.id === match.class_id) || {}).name || "another class");

    return { duplicateClassName, error: null };

}


async function submitAddStudent(event) {

    event.preventDefault();

    const errorEl =
        document.getElementById("studentFormError");

    const surname =
        document.getElementById("surname").value.trim().toUpperCase();

    const firstname =
        document.getElementById("firstname").value.trim().toUpperCase();

    const othername =
        document.getElementById("othername").value.trim().toUpperCase();

    const gender =
        document.getElementById("gender").value;

    const admissionNo =
        document.getElementById("admissionno").value.trim();

    const dateOfBirth =
        document.getElementById("dob").value;


    if (!surname || !firstname) {

        errorEl.textContent =
            "Surname and first name are required.";

        errorEl.style.display =
            "block";

        return;

    }


    // A student with this name anywhere else in the session (or
    // this same class) is a duplicate — check before writing,
    // excluding the student currently being edited (if any) so
    // saving someone's own unchanged name isn't flagged.

    const {
        duplicateClassName,
        error: dupCheckError

    } =
        await findDuplicateStudent(surname, firstname, editingStudentId);

    if (dupCheckError) {

        errorEl.textContent =
            "Unable to check for duplicate students: " +
            dupCheckError.message;

        errorEl.style.display =
            "block";

        return;

    }

    if (duplicateClassName) {

        errorEl.textContent =
            `A student named ${surname} ${firstname} already exists in ${duplicateClassName}.`;

        errorEl.style.display =
            "block";

        return;

    }


    // =====================================
    // EDIT — update the existing row
    // =====================================

    if (editingStudentId) {

        const {
            error

        } =
            await supabaseClient
                .from("students")
                .update({
                    surname,
                    first_name: firstname,
                    other_name: othername || null,
                    gender,
                    admission_no: admissionNo || null,
                    date_of_birth: dateOfBirth || null
                })
                .eq("id", editingStudentId);


        if (error) {

            errorEl.textContent =
                error.message ||
                "Unable to update this student.";

            errorEl.style.display =
                "block";

            return;

        }


        editingStudentId =
            null;

        document.getElementById("studentModal").classList.remove("show");

        showToast("Student updated.");

        await loadStudents();

        logActivity("student.edited", `${surname} ${firstname}`);

        return;

    }


    // =====================================
    // ADD — insert a new row
    // =====================================

    let position =
        null;

    if (classInfo.is_finalized) {

        const currentMax =
            allStudents.reduce(
                (max, s) => Math.max(max, s.position || 0),
                0
            );

        position =
            currentMax + 1;

    }


    const {
        error

    } =
        await supabaseClient
            .from("students")
            .insert({
                class_id: classId,
                surname,
                first_name: firstname,
                other_name: othername || null,
                gender,
                admission_no: admissionNo || null,
                date_of_birth: dateOfBirth || null,
                position
            });


    if (error) {

        errorEl.textContent =
            error.message ||
            "Unable to add this student.";

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("studentModal").classList.remove("show");

    showToast("Student added.");

    await loadStudents();

    logActivity("student.added", `${surname} ${firstname}`);

}


/* ==========================================
   TEMPLATE LAYOUT CONSTANTS
   Rows 1-4 hold the logo/school/class header,
   row 5 is the column header, data starts at row 6.
   downloadTemplate() builds these rows and
   handleImportFile() parses them — if you change
   one, change the other.
========================================== */

const TEMPLATE_HEADER_ROW = 5;
const TEMPLATE_DATA_START_ROW = 6;
const TEMPLATE_DATA_ROW_COUNT = 150; // blank rows provided to fill in
const SCHOOL_NAME_FILENAME_LIMIT = 20; // beyond this many characters, use an acronym


// Long school names make unwieldy filenames — past the limit
// above, use an acronym (first letter of each word, capitalized)
// instead of the full name.

function getSchoolNameForFilename() {

    const schoolName =
        (typeof AttendNGContext !== "undefined" && AttendNGContext.schoolName) ?
            AttendNGContext.schoolName.trim() :
            "School";

    if (schoolName.length <= SCHOOL_NAME_FILENAME_LIMIT) {

        return schoolName;

    }

    return schoolName
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word[0])
        .join("")
        .toUpperCase();

}


/* ==========================================
   TEMPLATE DOWNLOAD
========================================== */

async function downloadTemplate() {

    const workbook =
        new ExcelJS.Workbook();


    // Hidden metadata sheet — this is what locks the
    // template to THIS class and session, checked again
    // on import.

    const metaSheet =
        workbook.addWorksheet("meta");

    metaSheet.state =
        "veryHidden";

    metaSheet.getCell("A1").value =
        "class_id";

    metaSheet.getCell("B1").value =
        classId;

    metaSheet.getCell("A2").value =
        "session_id";

    metaSheet.getCell("B2").value =
        classInfo.session_id;


    // =====================================
    // VISIBLE SHEET
    // =====================================

    const sheet =
        workbook.addWorksheet("Students");

    sheet.views =
        [{ showGridLines: false }]; // no stray gridlines outside the table

    sheet.columns = [
        { key: "surname", width: 22 },
        { key: "first_name", width: 20 },
        { key: "other_name", width: 20 },
        { key: "gender", width: 22 }
    ];


    // ---- Logo, column A rows 1-4 ----

    const schoolLogoUrl =
        (typeof AttendNGContext !== "undefined") ?
            AttendNGContext.schoolLogoUrl :
            null;

    if (schoolLogoUrl) {

        try {

            const response =
                await fetch(schoolLogoUrl);

            const contentType =
                response.headers.get("content-type") || "";

            const extension =
                contentType.includes("png") ? "png" :
                contentType.includes("gif") ? "gif" :
                "jpeg";

            const arrayBuffer =
                await response.arrayBuffer();

            const imageId =
                workbook.addImage({
                    buffer: arrayBuffer,
                    extension
                });

            sheet.addImage(imageId, "A1:A4");

        }

        catch (error) {

            // No logo is better than a broken template —
            // just skip it and carry on.

            console.warn(
                "Unable to embed school logo in template:",
                error
            );

        }

    }


    // ---- School name / class name / subtitle, columns B-D rows 1-3 ----

    sheet.mergeCells("B1:D1");

    sheet.getCell("B1").value =
        (typeof AttendNGContext !== "undefined" && AttendNGContext.schoolName) ?
            AttendNGContext.schoolName :
            "School";

    sheet.getCell("B1").font =
        { bold: true, size: 16, color: { argb: "FFFFFFFF" } };

    sheet.getCell("B1").alignment =
        { vertical: "middle" };


    sheet.mergeCells("B2:D2");

    sheet.getCell("B2").value =
        `${classInfo.name} — Student Roster`;

    sheet.getCell("B2").font =
        { bold: true, size: 12, color: { argb: "FFE6F4F1" } };

    sheet.getCell("B2").alignment =
        { vertical: "middle" };


    sheet.mergeCells("B3:D3");

    sheet.getCell("B3").value =
        "Fill in student names below. Gender must be chosen from the dropdown.";

    sheet.getCell("B3").font =
        { italic: true, size: 10, color: { argb: "FFCDE6E1" } };

    sheet.getCell("B3").alignment =
        { vertical: "middle" };


    sheet.getRow(1).height = 24;
    sheet.getRow(2).height = 18;
    sheet.getRow(3).height = 16;
    sheet.getRow(4).height = 8; // spacer, no border, no content


    // ---- Brand-teal fill behind the whole header block, rows 1-4 ----
    // (logo cell, school name, class subtitle, and the spacer row).
    // Only the table header (row 5, already teal) and the student
    // input rows (row 6+) stay untouched.

    ["A", "B", "C", "D"].forEach(
        (col) => {

            for (let rowNum = 1; rowNum <= 4; rowNum++) {

                sheet.getCell(`${col}${rowNum}`).fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FF0F766E" } // AttendNG brand teal
                };

            }

        }
    );


    // ---- Table header, row 5 ----

    const headerRow =
        sheet.getRow(TEMPLATE_HEADER_ROW);

    headerRow.values =
        ["Surname", "First Name", "Other Name", "Gender (Male/Female)"];

    headerRow.font =
        { bold: true, color: { argb: "FFFFFFFF" } }; // white text on brand teal

    headerRow.eachCell(
        (cell) => {

            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" }
            };

            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF0F766E" } // AttendNG brand teal
            };

        }
    );


    // ---- Blank data rows: bordered, and only these cells unlocked ----

    for (let i = 0; i < TEMPLATE_DATA_ROW_COUNT; i++) {

        const rowNumber =
            TEMPLATE_DATA_START_ROW + i;

        const row =
            sheet.getRow(rowNumber);

        for (let col = 1; col <= 4; col++) {

            const cell =
                row.getCell(col);

            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" }
            };

            // This is the whole point of the template: only
            // the name + gender cells can be typed into once
            // the sheet is protected below.

            cell.protection =
                { locked: false };

        }

        // Gender is restricted to a Male/Female dropdown.
        // Note: ExcelJS's showDropDown flag is inverted from
        // what it sounds like — "false" is what makes the
        // dropdown arrow actually appear in Excel.

        row.getCell(4).dataValidation = {
            type: "list",
            allowBlank: true,
            showDropDown: false,
            formulae: ['"Male,Female"']
        };

    }


    // ---- Footer, one row below the last data row ----

    const footerRowNumber =
        TEMPLATE_DATA_START_ROW + TEMPLATE_DATA_ROW_COUNT + 1;

    sheet.mergeCells(`A${footerRowNumber}:D${footerRowNumber}`);

    const footerCell =
        sheet.getCell(`A${footerRowNumber}`);

    footerCell.value =
        "Powered by AttendNG";

    footerCell.font =
        { italic: true, size: 9, color: { argb: "FF999999" } };

    footerCell.alignment =
        { horizontal: "center" };


    // ---- Lock everything except the cells marked unlocked above ----

    await sheet.protect(
        "1318",
        {
            selectLockedCells: true,
            selectUnlockedCells: true
        }
    );


    const buffer =
        await workbook.xlsx.writeBuffer();

    const blob =
        new Blob(
            [buffer],
            { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href =
        url;

    link.download =
        `${getSchoolNameForFilename()}-${classInfo.name}-student-template.xlsx`;

    link.click();

    URL.revokeObjectURL(url);

}


/* ==========================================
   IMPORT
========================================== */

async function handleImportFile(event) {

    const file =
        event.target.files[0];

    event.target.value =
        ""; // allow re-selecting the same file later

    if (!file) {

        return;

    }


    const arrayBuffer =
        await file.arrayBuffer();

    const workbook =
        new ExcelJS.Workbook();

    await workbook.xlsx.load(arrayBuffer);


    // =====================================
    // VALIDATE THE TEMPLATE IS LOCKED TO
    // THIS EXACT CLASS + SESSION
    // =====================================

    const metaSheet =
        workbook.getWorksheet("meta");

    if (!metaSheet) {

        alert(
            "This file wasn't generated as a class import template. " +
            "Download a fresh template for this class and try again."
        );

        return;

    }

    const fileClassId =
        metaSheet.getCell("B1").value;

    const fileSessionId =
        metaSheet.getCell("B2").value;

    if (fileClassId !== classId || fileSessionId !== classInfo.session_id) {

        alert(
            `This template is for a different class or session. ` +
            `Download a fresh template for ${classInfo.name} and try again.`
        );

        return;

    }


    // =====================================
    // PARSE ROWS
    // =====================================

    const sheet =
        workbook.getWorksheet("Students");

    let imported = 0;
    let duplicates = 0;
    let invalid = 0;
    let empty = 0;

    // Duplicate check spans the whole session, not just this
    // class — a student already enrolled in another class this
    // session should be flagged as a duplicate here too, rather
    // than silently getting a second row in a different class.

    const sessionClassIds =
        [classId, ...otherClasses.map(c => c.id)];

    const {
        data: sessionStudents,
        error: sessionStudentsError

    } =
        await supabaseClient
            .from("students")
            .select("surname, first_name")
            .in("class_id", sessionClassIds);

    if (sessionStudentsError) {

        alert(
            "Unable to check for duplicate students across classes: " +
            sessionStudentsError.message
        );

        return;

    }

    const existingNames =
        new Set(
            sessionStudents.map(
                s => `${s.surname.trim().toLowerCase()}|${s.first_name.trim().toLowerCase()}`
            )
        );

    const rowsToInsert = [];


    sheet.eachRow(
        (row, rowNumber) => {

            if (rowNumber < TEMPLATE_DATA_START_ROW) {

                return; // logo/school/class header rows + column header row

            }

            if (rowNumber >= TEMPLATE_DATA_START_ROW + TEMPLATE_DATA_ROW_COUNT) {

                return; // footer row ("Powered by AttendNG") — not a data row, ignore entirely

            }

            const surname =
                (row.getCell(1).value || "").toString().trim().toUpperCase();

            const firstName =
                (row.getCell(2).value || "").toString().trim().toUpperCase();

            const otherName =
                (row.getCell(3).value || "").toString().trim().toUpperCase();

            const genderRaw =
                (row.getCell(4).value || "").toString().trim().toLowerCase();


            if (!surname && !firstName && !otherName) {

                empty += 1;

                return;

            }

            if (!surname || !firstName) {

                invalid += 1;

                return;

            }

            const gender =
                (genderRaw === "male" || genderRaw === "female") ?
                    genderRaw :
                    null;

            if (!gender) {

                // Gender wasn't chosen from the dropdown — skip the
                // row rather than importing a student with no gender
                // (this also catches the "Powered by AttendNG"
                // footer row, which has no gender cell filled).

                invalid += 1;

                return;

            }

            const key =
                `${surname.toLowerCase()}|${firstName.toLowerCase()}`;

            if (existingNames.has(key)) {

                duplicates += 1;

                return;

            }

            existingNames.add(key); // guard against dupes WITHIN the sheet too

            rowsToInsert.push({
                class_id: classId,
                surname,
                first_name: firstName,
                other_name: otherName || null,
                gender
            });

        }
    );


    // If finalized, new rows append at the bottom in sheet
    // order — snapshot sequential positions before inserting.

    if (classInfo.is_finalized) {

        let nextPosition =
            allStudents.reduce(
                (max, s) => Math.max(max, s.position || 0),
                0
            ) + 1;

        rowsToInsert.forEach(
            row => {

                row.position =
                    nextPosition;

                nextPosition += 1;

            }
        );

    }


    if (rowsToInsert.length > 0) {

        const {
            error: insertError

        } =
            await supabaseClient
                .from("students")
                .insert(rowsToInsert);

        if (insertError) {

            alert(
                "Import failed: " +
                insertError.message
            );

            return;

        }

        imported =
            rowsToInsert.length;

    }


    document.getElementById("importedCount").textContent =
        imported;

    document.getElementById("duplicateCount").textContent =
        duplicates;

    document.getElementById("invalidCount").textContent =
        invalid;

    document.getElementById("emptyCount").textContent =
        empty;

    document.getElementById("importSummaryModal").classList.add("show");


    await loadStudents();

    logActivity(
        "student.imported",
        classInfo.name,
        `Imported: ${imported}, Duplicates skipped: ${duplicates}, Invalid skipped: ${invalid}, Empty ignored: ${empty}`
    );

}


/* ==========================================
   MOVE / DELETE
========================================== */

async function moveStudent(studentId, newClassId) {

    const targetClass =
        otherClasses.find(c => c.id === newClassId);

    const movingStudent =
        allStudents.find(s => s.id === studentId);

    const confirmed =
        window.confirm(
            `Move this student to ${targetClass ? targetClass.name : "the selected class"}?`
        );

    if (!confirmed) {

        await loadStudents(); // reset the dropdown

        return;

    }


    const { error } =
        await supabaseClient
            .from("students")
            .update({ class_id: newClassId, position: null })
            .eq("id", studentId);


    if (error) {

        alert(
            "Unable to move this student: " +
            error.message
        );

        return;

    }


    showToast("Student moved.");

    await loadStudents();

    logActivity(
        "student.moved",
        movingStudent ? `${movingStudent.surname} ${movingStudent.first_name}` : "",
        `${classInfo.name} → ${targetClass ? targetClass.name : "another class"}`
    );

}


function deleteStudent(studentId, studentName) {

    pendingDeleteStudentId =
        studentId;

    pendingDeleteStudentName =
        studentName;

    document.getElementById("deleteStudentMessage").textContent =
        `Remove ${studentName} from this class? This also deletes their attendance history and can't be undone.`;

    document.getElementById("deleteStudentError").style.display =
        "none";

    document.getElementById("deleteStudentModal").style.display =
        "flex";

}


async function confirmDeleteStudent() {

    const errorEl =
        document.getElementById("deleteStudentError");

    errorEl.style.display =
        "none";


    const { error } =
        await supabaseClient
            .from("students")
            .delete()
            .eq("id", pendingDeleteStudentId);


    if (error) {

        errorEl.textContent =
            "Unable to delete this student: " +
            error.message;

        errorEl.style.display =
            "block";

        return;

    }


    document.getElementById("deleteStudentModal").style.display =
        "none";

    showToast("Student removed.");

    await loadStudents();

    logActivity("student.deleted", pendingDeleteStudentName);

    pendingDeleteStudentId =
        null;

    pendingDeleteStudentName =
        null;

}


/* ==========================================
   TOAST
========================================== */

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