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


function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function renderStudents(list) {

    const tbody =
        document.getElementById("studentTable");

    const cardList =
        document.getElementById("studentCardList");

    if (tbody) {
        tbody.innerHTML = "";
    }

    if (cardList) {
        cardList.innerHTML = "";
    }

    list.forEach(
        (student, index) => {

            const initials =
                `${(student.surname || "").charAt(0)}${(student.first_name || "").charAt(0)}`.toUpperCase() || "ST";

            // 1. Desktop Table Row
            if (tbody) {
                const row =
                    document.createElement("tr");

                row.style.borderBottom =
                    "1px solid var(--border)";

                row.innerHTML = `
                    <td style="padding:10px 8px;">${index + 1}</td>
                    <td style="padding:10px 8px; font-weight:500;">${escapeHtml(student.surname)}</td>
                    <td style="padding:10px 8px;">${escapeHtml(student.first_name)}</td>
                    <td style="padding:10px 8px;">${escapeHtml(student.other_name || "")}</td>
                    <td style="padding:10px 8px; text-transform:capitalize;">${escapeHtml(student.gender || "")}</td>
                `;

                tbody.appendChild(row);
            }

            // 2. Mobile Card List
            if (cardList) {
                const card =
                    document.createElement("div");

                card.className =
                    "mobile-data-card";

                card.innerHTML = `
                    <div class="card-top-row">
                        <div class="card-avatar-group">
                            <div class="card-avatar">${initials}</div>
                            <div class="card-primary-info">
                                <h4>${escapeHtml(student.surname)} ${escapeHtml(student.first_name)}</h4>
                                ${student.other_name ? `<span>${escapeHtml(student.other_name)}</span>` : ""}
                            </div>
                        </div>
                        <span class="badge" style="background:var(--surface-alt); border:1px solid var(--border); font-size:11px; font-weight:600;">#${index + 1}</span>
                    </div>

                    <div class="card-meta-chips">
                        <span class="card-chip">
                            <i class="fa-solid fa-user" style="font-size:10px; color:var(--text-muted);"></i>
                            <span style="text-transform:capitalize;">${escapeHtml(student.gender || "Not specified")}</span>
                        </span>
                        ${student.position ? `
                        <span class="card-chip">
                            <i class="fa-solid fa-list-ol" style="font-size:10px; color:var(--primary);"></i>
                            Position: ${student.position}
                        </span>` : ""}
                    </div>
                `;

                cardList.appendChild(card);
            }

        }
    );

    const countEl =
        document.getElementById("studentCount");

    if (countEl) {
        countEl.textContent = list.length;
    }

}