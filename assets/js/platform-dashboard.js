/*************************************************
 * PLATFORM-DASHBOARD.JS
 * Platform overview: totals and the newest schools.
 * (Onboarding now lives on the Schools page.)
 *************************************************/

document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    await loadOverview();

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


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}


function schoolInitials(name) {

    const words =
        name.trim().split(/\s+/).filter(Boolean);

    return (
        (words[0] ? words[0][0] : "?") +
        (words[1] ? words[1][0] : "")
    ).toUpperCase();

}


// Shows initials straight away, then swaps in the school's
// logo once it has loaded. A missing or broken logo simply
// leaves the initials in place.

function fillSchoolAvatar(el, school) {

    el.textContent =
        schoolInitials(school.name);

    if (!school.logo_url) {

        return;

    }

    const img =
        new Image();

    img.alt = "";

    img.onload = () => {

        el.textContent = "";

        el.classList.add("has-logo");

        el.appendChild(img);

    };

    img.src =
        school.logo_url;

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


async function loadOverview() {

    const [schoolsResult, membersResult] =
        await Promise.all([
            supabaseClient
                .from("schools")
                .select("id, name, genesis_username, logo_url, created_at")
                .order("created_at", { ascending: false }),
            supabaseClient
                .from("school_members")
                .select("school_id")
        ]);

    if (schoolsResult.error) {

        console.error("Unable to load schools:", schoolsResult.error);

        return;

    }

    const schools =
        schoolsResult.data;

    const memberCounts =
        {};

    let totalMembers =
        0;

    if (!membersResult.error) {

        totalMembers =
            membersResult.data.length;

        membersResult.data.forEach(
            row => {

                memberCounts[row.school_id] =
                    (memberCounts[row.school_id] || 0) + 1;

            }
        );

    }

    const now =
        new Date();

    const addedThisMonth =
        schools.filter(
            school => {

                const created =
                    new Date(school.created_at);

                return created.getFullYear() === now.getFullYear() &&
                    created.getMonth() === now.getMonth();

            }
        ).length;

    document.getElementById("dashSchools").textContent =
        schools.length.toLocaleString();

    document.getElementById("dashMembers").textContent =
        totalMembers.toLocaleString();

    document.getElementById("dashMonth").textContent =
        addedThisMonth.toLocaleString();


    const mount =
        document.getElementById("recentSchools");

    mount.innerHTML =
        "";

    if (schools.length === 0) {

        document.getElementById("recentEmpty").style.display =
            "block";

        return;

    }

    schools.slice(0, 5).forEach(
        school => {

            const count =
                memberCounts[school.id] || 0;

            const card =
                document.createElement("div");

            card.className =
                "school-card";

            card.tabIndex =
                0;

            card.setAttribute("role", "link");

            card.innerHTML = `
                <div class="school-avatar" data-avatar></div>
                <div class="school-main">
                    <p class="school-name">${escapeHtml(school.name)}</p>
                    <div class="school-meta">
                        <code class="school-user">${escapeHtml(school.genesis_username)}</code>
                        <span><i class="fa-solid fa-users"></i> ${count} member${count === 1 ? "" : "s"}</span>
                        <span class="school-added"><i class="fa-regular fa-calendar"></i> ${escapeHtml(new Date(school.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }))}</span>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right school-chevron"></i>
            `;

            fillSchoolAvatar(card.querySelector("[data-avatar]"), school);

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

            mount.appendChild(card);

        }
    );

}