/*************************************************
 * PLATFORM-SCHOOLS.JS
 *************************************************/

let allSchools = [];

let schoolView = "grid";

let onboardBusy = false;

const SCHOOL_VIEW_KEY = "attendng.platform.schoolView";


document.addEventListener("DOMContentLoaded", async () => {

    schoolView = readSchoolView();

    updateViewButtons();

    bindSchoolToolbar();

    bindOnboardModal();

    await waitForContext();

    await loadSchools();

    openOnboardFromHash();

});


function byId(id) {

    return document.getElementById(id);

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


/*************************************************
 * LOAD
 *************************************************/

async function loadSchools() {

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

    renderMetrics();

    renderSchools();

}


function renderMetrics() {

    const now =
        new Date();

    const addedThisMonth =
        allSchools.filter(
            school => {

                const created =
                    new Date(school.created_at);

                return created.getFullYear() === now.getFullYear() &&
                    created.getMonth() === now.getMonth();

            }
        ).length;

    const totalMembers =
        allSchools.reduce(
            (sum, school) => sum + school.memberCount,
            0
        );

    byId("metricSchools").textContent =
        allSchools.length.toLocaleString();

    byId("metricMembers").textContent =
        totalMembers.toLocaleString();

    byId("metricMonth").textContent =
        addedThisMonth.toLocaleString();

}


/*************************************************
 * TOOLBAR: SEARCH, SORT, VIEW
 *************************************************/

function readSchoolView() {

    try {

        return localStorage.getItem(SCHOOL_VIEW_KEY) === "list" ?
            "list" :
            "grid";

    }
    catch (error) {

        return "grid";

    }

}


function setSchoolView(view) {

    schoolView = view;

    try {

        localStorage.setItem(SCHOOL_VIEW_KEY, view);

    }
    catch (error) {

        // Storage can be blocked; the toggle still works.

    }

    updateViewButtons();

    renderSchools();

}


function updateViewButtons() {

    byId("viewGrid").classList.toggle("on", schoolView === "grid");

    byId("viewList").classList.toggle("on", schoolView === "list");

}


function bindSchoolToolbar() {

    byId("searchSchool").addEventListener("input", renderSchools);

    byId("sortSchool").addEventListener("change", renderSchools);

    byId("viewGrid").addEventListener("click", () => setSchoolView("grid"));

    byId("viewList").addEventListener("click", () => setSchoolView("list"));

}


function getVisibleSchools() {

    const term =
        byId("searchSchool").value.trim().toLowerCase();

    const sort =
        byId("sortSchool").value;

    const list =
        allSchools.filter(
            school =>
                !term ||
                school.name.toLowerCase().includes(term) ||
                (school.genesis_username || "").toLowerCase().includes(term)
        );

    if (sort === "name") {

        list.sort((a, b) => a.name.localeCompare(b.name));

    }
    else if (sort === "members") {

        list.sort((a, b) => b.memberCount - a.memberCount);

    }
    // "newest" keeps the order the query returned.

    return list;

}


/*************************************************
 * RENDER
 *************************************************/

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

    const first =
        words[0] ? words[0][0] : "?";

    const second =
        words[1] ? words[1][0] : "";

    return (first + second).toUpperCase();

}


function formatAdded(value) {

    return new Date(value).toLocaleDateString(
        "en-GB",
        { month: "short", year: "numeric" }
    );

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


function renderSchools() {

    const grid =
        byId("schoolGrid");

    const empty =
        byId("schoolEmpty");

    const list =
        getVisibleSchools();

    grid.className =
        "school-grid" + (schoolView === "list" ? " list" : "");

    grid.innerHTML =
        "";


    if (list.length === 0) {

        const noSchoolsAtAll =
            allSchools.length === 0;

        grid.style.display = "none";

        empty.style.display = "block";

        byId("schoolEmptyTitle").textContent =
            noSchoolsAtAll ?
                "Onboard your first school" :
                "No school matches that search";

        byId("schoolEmptyText").textContent =
            noSchoolsAtAll ?
                "Schools you onboard show up here." :
                "Try another name or username.";

        byId("emptyOnboard").style.display =
            noSchoolsAtAll ? "inline-block" : "none";

        return;

    }


    grid.style.display = "";

    empty.style.display = "none";


    list.forEach(
        school => {

            const memberLabel =
                `${school.memberCount} member${school.memberCount === 1 ? "" : "s"}`;

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
                        <span><i class="fa-solid fa-users"></i> ${memberLabel}</span>
                        <span class="school-added"><i class="fa-regular fa-calendar"></i> ${escapeHtml(formatAdded(school.created_at))}</span>
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

            grid.appendChild(card);

        }
    );

}


/*************************************************
 * ONBOARD MODAL
 *************************************************/

function openOnboardModal() {

    resetOnboard();

    byId("onboardModal").classList.add("show");

    setTimeout(() => byId("schoolName").focus(), 50);

}


function closeOnboardModal() {

    if (onboardBusy) {

        return;

    }

    byId("onboardModal").classList.remove("show");

    resetOnboard();

    if (location.hash === "#onboard") {

        history.replaceState(
            null,
            "",
            location.pathname + location.search
        );

    }

}


function openOnboardFromHash() {

    if (location.hash === "#onboard") {

        openOnboardModal();

    }

}


function resetOnboard() {

    byId("onboardForm").reset();

    byId("onboardForm").style.display = "block";

    byId("onboardResult").style.display = "none";

    byId("onboardError").style.display = "none";

    document.querySelectorAll("[data-copy]").forEach(
        button => { button.textContent = "Copy"; }
    );

}


function bindOnboardModal() {

    const modal =
        byId("onboardModal");

    byId("openOnboard").addEventListener("click", openOnboardModal);

    byId("emptyOnboard").addEventListener("click", openOnboardModal);

    byId("closeOnboard").addEventListener("click", closeOnboardModal);

    byId("cancelOnboard").addEventListener("click", closeOnboardModal);

    byId("onboardDone").addEventListener("click", closeOnboardModal);

    byId("onboardAnother").addEventListener("click", openOnboardModal);

    modal.addEventListener(
        "click",
        (event) => {

            if (event.target === modal) {

                closeOnboardModal();

            }

        }
    );

    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape" && modal.classList.contains("show")) {

                closeOnboardModal();

            }

        }
    );

    window.addEventListener("hashchange", openOnboardFromHash);

    byId("onboardForm").addEventListener("submit", submitOnboard);

    document.querySelectorAll("[data-copy]").forEach(
        button => {

            button.addEventListener(
                "click",
                async () => {

                    const text =
                        byId(button.dataset.copy).textContent;

                    try {

                        await navigator.clipboard.writeText(text);

                        button.textContent = "Copied";

                    }
                    catch (error) {

                        button.textContent = "Press Ctrl+C";

                    }

                }
            );

        }
    );

}


async function submitOnboard(event) {

    event.preventDefault();

    const errorEl =
        byId("onboardError");

    const submitBtn =
        byId("onboardSubmit");

    errorEl.style.display =
        "none";

    onboardBusy =
        true;

    submitBtn.disabled =
        true;

    submitBtn.textContent =
        "Creating…";


    try {

        const schoolName =
            byId("schoolName").value.trim();

        const {
            data,
            error: invokeError
        } =
            await supabaseClient.functions.invoke(
                "onboard-school",
                { body: { schoolName } }
            );

        if (invokeError) {

            throw new Error(await extractFunctionError(invokeError));

        }

        if (data && data.error) {

            throw new Error(data.error);

        }


        byId("onboardResultText").textContent =
            `"${data.school.name}" was created. Share these details with the school. This password won't be shown again.`;

        byId("resultUsername").textContent =
            data.credentials.username;

        byId("resultPassword").textContent =
            data.credentials.password;

        byId("onboardForm").style.display =
            "none";

        byId("onboardResult").style.display =
            "block";

        // Show the new school in the list behind the dialog.

        loadSchools();

    }
    catch (error) {

        console.error("Onboarding failed:", error);

        errorEl.textContent =
            error.message ||
            "Something went wrong onboarding this school.";

        errorEl.style.display =
            "block";

    }
    finally {

        onboardBusy =
            false;

        submitBtn.disabled =
            false;

        submitBtn.textContent =
            "Onboard school";

    }

}


/* ==========================================
   EXTRACT REAL ERROR FROM A NON-2XX RESPONSE
   supabase-js's own error for a non-2xx Edge
   Function call is a generic wrapper — the
   actual JSON body (our own {error: "..."})
   is available on error.context, but only if
   we go read it ourselves.
========================================== */

async function extractFunctionError(invokeError) {

    try {

        if (invokeError.context && typeof invokeError.context.json === "function") {

            const body =
                await invokeError.context.json();

            if (body && body.error) {

                return body.error;

            }

        }

    }
    catch (e) {

        // Body was not JSON, or already consumed.

    }

    return invokeError.message || "Something went wrong.";

}