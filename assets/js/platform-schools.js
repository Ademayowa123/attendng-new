/*************************************************
 * PLATFORM-SCHOOLS.JS
 *************************************************/

let allSchools = [];


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    await loadSchools();

    document.getElementById("searchSchool").addEventListener(
        "input",
        (event) => {

            const term =
                event.target.value.trim().toLowerCase();

            const filtered =
                allSchools.filter(
                    s =>
                        s.name.toLowerCase().includes(term) ||
                        s.genesis_username.toLowerCase().includes(term)
                );

            renderSchools(filtered);

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


async function loadSchools() {

    const [schoolsResult, membersResult] =
        await Promise.all([
            supabaseClient
                .from("schools")
                .select("id, name, genesis_username, created_at")
                .order("created_at", { ascending: false }),
            supabaseClient
                .from("school_members")
                .select("school_id")
        ]);


    if (schoolsResult.error) {

        console.error("Unable to load schools:", schoolsResult.error);

        return;

    }


    const memberCounts =
        {};

    if (!membersResult.error) {

        membersResult.data.forEach(
            row => {

                memberCounts[row.school_id] =
                    (memberCounts[row.school_id] || 0) + 1;

            }
        );

    }


    allSchools =
        schoolsResult.data.map(
            school => ({
                ...school,
                memberCount: memberCounts[school.id] || 0
            })
        );


    document.getElementById("schoolCountLabel").textContent =
        `${allSchools.length} school${allSchools.length === 1 ? "" : "s"} onboarded`;

    renderSchools(allSchools);

}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}


function openSchool(school) {

    sessionStorage.setItem(
        "attendng_selected_school_id",
        school.id
    );

    sessionStorage.setItem(
        "attendng_selected_school_name",
        school.name
    );

    window.location.href =
        "/platform/school-detail.html";

}


function renderSchools(list) {

    const tbody =
        document.getElementById("schoolsTableBody");

    const cardsMount =
        document.getElementById("schoolCardsMount");

    tbody.innerHTML =
        "";

    cardsMount.innerHTML =
        "";

    list.forEach(
        school => {

            const memberLabel =
                `${school.memberCount} member${school.memberCount === 1 ? "" : "s"}`;


            // Table row (desktop / tablet)

            const row =
                document.createElement("tr");

            row.style.borderBottom =
                "1px solid var(--border)";

            row.style.cursor =
                "pointer";

            row.innerHTML = `
                <td style="padding:10px 4px; font-weight:500;">${escapeHtml(school.name)}</td>
                <td style="padding:10px 4px;"><code>${escapeHtml(school.genesis_username)}</code></td>
                <td style="padding:10px 4px;">${school.memberCount}</td>
                <td style="padding:10px 4px; text-align:right;"><i class="fa-solid fa-chevron-right" style="color:var(--text-muted);"></i></td>
            `;

            row.addEventListener("click", () => openSchool(school));

            tbody.appendChild(row);


            // Card (phones)

            const card =
                document.createElement("div");

            card.className =
                "teacher-card";

            card.style.cursor =
                "pointer";

            card.tabIndex =
                0;

            card.setAttribute("role", "link");

            card.innerHTML = `
                <div class="teacher-card-header">
                    <div>
                        <div class="teacher-card-name">${escapeHtml(school.name)}</div>
                        <div class="teacher-card-role">${memberLabel}</div>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color:var(--text-muted); margin-top:4px;"></i>
                </div>
                <div class="teacher-card-body">
                    <div><span class="teacher-card-label">Genesis username:</span><code>${escapeHtml(school.genesis_username)}</code></div>
                </div>
            `;

            card.addEventListener("click", () => openSchool(school));

            card.addEventListener(
                "keydown",
                (event) => {

                    if (event.key === "Enter" || event.key === " ") {

                        event.preventDefault();

                        openSchool(school);

                    }

                }
            );

            cardsMount.appendChild(card);

        }
    );

}