/*************************************************
 * STUDENTS.JS (teacher-facing, read-only)
 *************************************************/

let allStudents = [];


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

    await loadStudents();

    document.getElementById("searchStudent").addEventListener(
        "input",
        (event) => {

            const term =
                event.target.value.trim().toLowerCase();

            const filtered =
                allStudents.filter(
                    s =>
                        s.surname.toLowerCase().includes(term) ||
                        s.first_name.toLowerCase().includes(term) ||
                        (s.other_name || "").toLowerCase().includes(term)
                );

            renderStudents(filtered);

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


async function loadStudents() {

    let query =
        supabaseClient
            .from("students")
            .select("id, surname, first_name, other_name, gender, position")
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

    renderStudents(allStudents);

}


function renderStudents(list) {

    const tbody =
        document.getElementById("studentTable");

    tbody.innerHTML =
        "";

    list.forEach(
        (student, index) => {

            const row =
                document.createElement("tr");

            row.style.borderBottom =
                "1px solid var(--border)";

            row.innerHTML = `
                <td style="padding:8px 4px;">${index + 1}</td>
                <td style="padding:8px 4px;">${student.surname}</td>
                <td style="padding:8px 4px;">${student.first_name}</td>
                <td style="padding:8px 4px;">${student.other_name || ""}</td>
                <td style="padding:8px 4px; text-transform:capitalize;">${student.gender || ""}</td>
            `;

            tbody.appendChild(row);

        }
    );

    document.getElementById("studentCount").textContent =
        list.length;

}