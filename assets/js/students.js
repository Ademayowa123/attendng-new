/*************************************************
 * STUDENTS.JS (teacher-facing, read-only)
 *************************************************/

let allStudents = [];
let activeGender = "all";   // all | male | female
let searchTerm = "";


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    if (!AttendNGContext.classId) {

        // Shouldn't normally reach this page without a class —
        // the sidebar only shows it when one exists — but guard
        // against a direct URL visit anyway.

        window.location.href =
            "/school/dashboard.html";

        return;

    }

    const tile =
        document.getElementById("classTile");

    tile.textContent =
        AttendNGContext.className;

    tile.className =
        "rs-tile " + classTone(AttendNGContext.className);

    bindUI();

    await loadStudents();

});


function bindUI() {

    document.getElementById("searchStudent").addEventListener(
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

                    applyFilter();

                }
            );

        }
    );


    // Tap (or press Enter / Space on) a row to show or hide that student's details.

    const list =
        document.getElementById("studentList");

    const toggleRow = (row) => {

        const item =
            row.closest(".st-item");

        const open =
            item.classList.toggle("is-open");

        item.querySelector(".st-detail").hidden =
            !open;

        row.setAttribute("aria-expanded", String(open));

    };

    list.addEventListener(
        "click",
        (event) => {

            const row =
                event.target.closest(".st-row");

            if (row) {

                toggleRow(row);

            }

        }
    );

    list.addEventListener(
        "keydown",
        (event) => {

            if (event.key !== "Enter" && event.key !== " ") {

                return;

            }

            const row =
                event.target.closest(".st-row");

            if (row && event.target === row) {

                event.preventDefault();

                toggleRow(row);

            }

        }
    );

}


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


async function loadStudents() {

    let query =
        supabaseClient
            .from("students")
            .select("id, surname, first_name, other_name, gender, position, admission_no, date_of_birth")
            .eq("class_id", AttendNGContext.classId);

    query =
        AttendNGContext.classIsFinalized ?
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

    applyFilter();

}


function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// Same colours the Results page uses for a class tile.
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


function hashText(text) {

    let sum = 0;

    String(text || "").split("").forEach(
        ch => { sum += ch.charCodeAt(0); }
    );

    return sum;

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


// "2013-03-14" -> "14 March 2013" (no timezone surprises)
function formatBirthDate(value) {

    const match =
        /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");

    if (!match) {

        return "";

    }

    const months =
        ["January", "February", "March", "April", "May", "June",
         "July", "August", "September", "October", "November", "December"];

    return `${parseInt(match[3], 10)} ${months[parseInt(match[2], 10) - 1]} ${match[1]}`;

}


function refreshSummary() {

    const total =
        allStudents.length;

    const male =
        allStudents.filter(s => s.gender === "male").length;

    const female =
        allStudents.filter(s => s.gender === "female").length;

    const withAdmission =
        allStudents.filter(s => (s.admission_no || "").trim()).length;

    document.getElementById("studentCount").textContent = total;
    document.getElementById("maleCount").textContent = male;
    document.getElementById("femaleCount").textContent = female;

    document.getElementById("admissionCount").textContent =
        `${withAdmission} of ${total}`;

    document.getElementById("countAll").textContent = total;
    document.getElementById("countMale").textContent = male;
    document.getElementById("countFemale").textContent = female;

    document.getElementById("genderBar").innerHTML =
        (male + female) === 0 ?
            "" :
            `<span class="st-bar-male" style="flex:${male} 1 0"></span><span class="st-bar-female" style="flex:${female} 1 0"></span>`;

}


function applyFilter() {

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
                    [student.surname, student.first_name, student.other_name]
                        .filter(Boolean)
                        .join(" ");

                const admission =
                    (student.admission_no || "").trim();

                const birthDate =
                    formatBirthDate(student.date_of_birth);

                const metaParts =
                    [
                        admission || "No admission number",
                        genderLabel(student.gender)
                    ].filter(Boolean);

                return `
                    <div class="st-item">

                        <div class="st-row st-cols st-cols-ro" role="button" tabindex="0" aria-expanded="false">

                            <span class="st-num">${serial}</span>

                            <div class="st-student">
                                <span class="rs-avatar rs-av-${hashText(`${student.surname} ${student.first_name}`) % 5}" aria-hidden="true">${escapeHtml(initials)}</span>
                                <div class="st-id">
                                    <span class="st-name"><b>${escapeHtml(student.surname)}</b> ${escapeHtml(student.first_name)} ${escapeHtml(student.other_name || "")}</span>
                                    <span class="st-meta">${escapeHtml(metaParts.join(" · "))}</span>
                                </div>
                            </div>

                            <span class="st-adm">${admission ? escapeHtml(admission) : `<span class="st-unset">Not set</span>`}</span>

                            <span class="st-gender-cell">${genderChip(student.gender)}</span>

                            <i class="fa-solid fa-chevron-down st-chevron" aria-hidden="true"></i>

                        </div>

                        <div class="st-detail" hidden>
                            <div><small>Full name</small>${escapeHtml(fullName)}</div>
                            <div><small>Date of birth</small>${birthDate ? escapeHtml(birthDate) : "Not set"}</div>
                            <div><small>Admission no.</small>${admission ? escapeHtml(admission) : "Not set"}</div>
                            <div><small>Gender</small>${genderLabel(student.gender) || "Not set"}</div>
                            ${student.position ? `<div><small>Position</small>${escapeHtml(student.position)}</div>` : ""}
                        </div>

                    </div>
                `;

            }
        ).join("");


    const note =
        document.getElementById("listNote");

    if (allStudents.length === 0) {

        note.textContent =
            "No students in this class yet.";

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