/*************************************************
 * RESULTS.JS
 *************************************************/

let myAssignments = [];    // this teacher's class_subjects, with class + subject names joined in
let selectedAssignmentId = null;
let students = [];
let scoresMap = {};        // student_id -> { id (score row id, if saved), ca_score, exam_score }


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    document.getElementById("termLabel").textContent =
        AttendNGContext.currentTerm ?
            `${AttendNGContext.currentTerm} — ${AttendNGContext.sessionName || ""}` :
            "";

    await loadMyAssignments();

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

async function loadMyAssignments() {

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

        console.error(
            "Unable to load your assignments:",
            error
        );

        return;

    }

    myAssignments =
        (data || [])
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


    const select =
        document.getElementById("assignmentSelect");

    const noAssignmentsNotice =
        document.getElementById("noAssignmentsNotice");

    const scoresCard =
        document.getElementById("scoresCard");


    if (myAssignments.length === 0) {

        select.closest(".card").style.display =
            "none";

        noAssignmentsNotice.style.display =
            "block";

        scoresCard.style.display =
            "none";

        return;

    }

    select.closest(".card").style.display =
        "block";

    noAssignmentsNotice.style.display =
        "none";


    select.innerHTML =
        myAssignments.map(
            a => `<option value="${a.id}">${a.class_name} — ${a.subject_name}</option>`
        ).join("");


    selectedAssignmentId =
        myAssignments[0].id;

    await loadStudentsAndScores();

}


async function loadStudentsAndScores() {

    const assignment =
        myAssignments.find(a => a.id === selectedAssignmentId);

    if (!assignment) {

        return;

    }


    let studentsQuery =
        supabaseClient
            .from("students")
            .select("id, surname, first_name, position")
            .eq("class_id", assignment.class_id);

    studentsQuery =
        assignment.class_is_finalized ?
            studentsQuery.order("position") :
            studentsQuery.order("surname").order("first_name");


    const {
        data: studentRows,
        error: studentsError

    } =
        await studentsQuery;

    if (studentsError) {

        console.error(
            "Unable to load students:",
            studentsError
        );

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


    if (students.length > 0) {

        const {
            data: scoreRows,
            error: scoresError

        } =
            await supabaseClient
                .from("scores")
                .select("id, student_id, ca_score, exam_score")
                .eq("class_subject_id", selectedAssignmentId)
                .eq("term", AttendNGContext.currentTerm)
                .in("student_id", students.map(s => s.id));

        if (scoresError) {

            console.error(
                "Unable to load existing scores:",
                scoresError
            );

        }
        else {

            scoreRows.forEach(
                row => {

                    scoresMap[row.student_id] = {
                        id: row.id,
                        ca_score: row.ca_score,
                        exam_score: row.exam_score
                    };

                }
            );

        }

    }


    renderTable();

}


/* ==========================================
   RENDER
========================================== */

function renderTable() {

    const tbody =
        document.getElementById("scoresTableBody");

    const noStudentsNotice =
        document.getElementById("noStudentsNotice");

    const scoresCard =
        document.getElementById("scoresCard");


    scoresCard.style.display =
        "block";


    if (students.length === 0) {

        tbody.innerHTML =
            "";

        noStudentsNotice.style.display =
            "block";

        return;

    }

    noStudentsNotice.style.display =
        "none";


    tbody.innerHTML =
        students.map(
            student => {

                const scoreRow =
                    scoresMap[student.id];

                const total =
                    (scoreRow.ca_score !== null && scoreRow.exam_score !== null) ?
                        (Number(scoreRow.ca_score) + Number(scoreRow.exam_score)) :
                        "—";

                const gradeHtml =
                    gradeBadgeHtml(total === "—" ? null : total);

                return `
                    <tr style="border-bottom:1px solid var(--border);">
                        <td class="sticky-col1" style="padding:10px 8px;">${student.surname} ${student.first_name}</td>
                        <td style="padding:6px 8px;">
                            <input type="number" class="ca-input" data-student-id="${student.id}"
                                   min="0" max="40" step="1"
                                   value="${scoreRow.ca_score !== null ? scoreRow.ca_score : ""}"
                                   style="width:70px; padding:6px 8px; border:1px solid var(--border); border-radius:6px;">
                        </td>
                        <td style="padding:6px 8px;">
                            <input type="number" class="exam-input" data-student-id="${student.id}"
                                   min="0" max="60" step="1"
                                   value="${scoreRow.exam_score !== null ? scoreRow.exam_score : ""}"
                                   style="width:70px; padding:6px 8px; border:1px solid var(--border); border-radius:6px;">
                        </td>
                        <td class="total-cell" data-student-id="${student.id}" style="padding:10px 8px; font-weight:600;">${total}</td>
                        <td class="grade-cell" data-student-id="${student.id}" style="padding:10px 8px;">${gradeHtml}</td>
                    </tr>
                `;

            }
        ).join("");


    tbody.querySelectorAll(".ca-input").forEach(
        input => {

            input.addEventListener(
                "blur",
                () => saveScore(input.dataset.studentId, "ca_score", input)
            );

        }
    );


    tbody.querySelectorAll(".exam-input").forEach(
        input => {

            input.addEventListener(
                "blur",
                () => saveScore(input.dataset.studentId, "exam_score", input)
            );

        }
    );

}


/* ==========================================
   UI BINDING
========================================== */

function bindUI() {

    document.getElementById("assignmentSelect").addEventListener(
        "change",
        async (event) => {

            selectedAssignmentId =
                event.target.value;

            await loadStudentsAndScores();

        }
    );

}


/* ==========================================
   SAVE — one field at a time, on blur, same
   pattern attendance.js uses per toggle.
========================================== */

async function saveScore(studentId, field, inputEl) {

    const rawValue =
        inputEl.value.trim();

    const max =
        field === "ca_score" ? 40 : 60;


    let value =
        rawValue === "" ? null : Number(rawValue);

    if (value !== null && (isNaN(value) || value < 0 || value > max)) {

        showToast(`Enter a number between 0 and ${max}.`);

        const previous =
            scoresMap[studentId][field];

        inputEl.value =
            previous !== null ? previous : "";

        return;

    }


    const existing =
        scoresMap[studentId];

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
                    class_subject_id: selectedAssignmentId,
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


    scoresMap[studentId] = {
        id: data.id,
        ca_score: updatedRow.ca_score,
        exam_score: updatedRow.exam_score
    };


    const totalCell =
        document.querySelector(`.total-cell[data-student-id="${studentId}"]`);

    const newTotal =
        (updatedRow.ca_score !== null && updatedRow.exam_score !== null) ?
            (Number(updatedRow.ca_score) + Number(updatedRow.exam_score)) :
            null;

    if (totalCell) {

        totalCell.textContent =
            newTotal !== null ? newTotal : "—";

    }

    const gradeCell =
        document.querySelector(`.grade-cell[data-student-id="${studentId}"]`);

    if (gradeCell) {

        gradeCell.innerHTML =
            gradeBadgeHtml(newTotal);

    }

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