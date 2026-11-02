/*************************************************
 * AUTH.JS
 * AttendNG Authentication + Sidebar Injection
 *
 * Every page includes ONE empty <aside id="sidebarMount">
 * instead of hand-written sidebar markup. This script
 * builds the correct sidebar for whoever's logged in —
 * platform admin, school admin, or teacher — and injects
 * it, along with the logout modal and mobile nav.
 *************************************************/


document.addEventListener("DOMContentLoaded", async () => {


    // =========================================
    // 1. CHECK SESSION
    // =========================================

    const {
        data: {
            session
        },
        error

    } =
        await supabaseClient.auth.getSession();


    if (error || !session) {

        window.location.href =
            "/login.html";

        return;

    }


    // =========================================
    // 2. LOAD CONTEXT
    // =========================================

    try {

        await loadAttendNGContext();

    }

    catch (contextError) {

        console.error(
            "Context load failed:",
            contextError
        );

        window.location.href =
            "/login.html";

        return;

    }


    // =========================================
    // 3. GUARD: SEND EACH TIER TO ITS OWN
    //    SECTION OF THE SITE
    //
    //    This is a UX convenience, not real
    //    security — RLS is what actually
    //    protects the data either way.
    // =========================================

    const path =
        window.location.pathname;


    if (AttendNGContext.tier === "platform" && !path.startsWith("/platform/")) {

        window.location.href =
            "/platform/dashboard.html";

        return;

    }


    if (
        AttendNGContext.tier !== "platform" &&
        path.startsWith("/platform/")
    ) {

        window.location.href =
            "/school/dashboard.html";

        return;

    }


    if (
        AttendNGContext.tier === "teacher" &&
        path.startsWith("/school/admin/")
    ) {

        window.location.href =
            "/school/dashboard.html";

        return;

    }


    // =========================================
    // 4. INJECT SIDEBAR + FILL CONTEXT UI
    // =========================================

    injectSidebar();

    updateAttendNGContextUI();

    setupStickyTables();

    setGreeting();


    // =========================================
    // 5. MOBILE NAV + LOGOUT
    // =========================================

    setupMobileNav();

    const logoutBtn =
        document.getElementById(
            "logoutBtn"
        );

    if (logoutBtn) {

        logoutBtn.addEventListener(
            "click",
            (event) => {

                event.preventDefault();

                showLogoutConfirmModal(
                    logoutBtn
                );

            }
        );

    }

});


/* ==========================================
   SIDEBAR GROUP STATE
   Remembers which groups the user left open.
========================================== */

const SIDEBAR_STATE_KEY = "attendng.sidebar.open";

function readOpenGroups() {

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(SIDEBAR_STATE_KEY) || "[]"
            );

        return Array.isArray(saved) ? saved : [];

    }
    catch (error) {

        return [];

    }

}

function saveOpenGroups() {

    try {

        const open =
            [...document.querySelectorAll(".nav-group.open")]
                .map(li => li.dataset.group);

        localStorage.setItem(
            SIDEBAR_STATE_KEY,
            JSON.stringify(open)
        );

    }
    catch (error) {

        // Storage can be blocked; the menu still works.

    }

}


/* ==========================================
   PLATFORM SIDEBAR: SCHOOL SEARCH + COUNT
========================================== */

async function setupPlatformSidebar() {

    const input =
        document.getElementById("sidebarSchoolSearch");

    const results =
        document.getElementById("sidebarSchoolResults");

    const badge =
        document.getElementById("schoolsBadge");

    if (!input || !results) {

        return;

    }


    let schools = [];

    let matches = [];


    function openSchoolFromSidebar(school) {

        // Same hand-off the Schools page uses.

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


    function renderResults() {

        const term =
            input.value.trim().toLowerCase();

        results.innerHTML = "";

        matches = [];

        if (!term) {

            return;

        }

        matches =
            schools
                .filter(school => school.name.toLowerCase().includes(term))
                .slice(0, 6);

        if (matches.length === 0) {

            const none =
                document.createElement("div");

            none.className = "sidebar-search-empty";

            none.textContent = "No school found";

            results.appendChild(none);

            return;

        }

        matches.forEach(
            (school) => {

                const button =
                    document.createElement("button");

                button.type = "button";

                button.textContent = school.name;

                button.addEventListener(
                    "click",
                    () => openSchoolFromSidebar(school)
                );

                results.appendChild(button);

            }
        );

    }


    input.addEventListener("input", renderResults);

    input.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Enter" && matches.length > 0) {

                event.preventDefault();

                openSchoolFromSidebar(matches[0]);

            }
            else if (event.key === "Escape") {

                input.value = "";

                renderResults();

            }

        }
    );


    const { data, error } =
        await supabaseClient
            .from("schools")
            .select("id, name")
            .order("name");

    if (error || !data) {

        console.error(
            "Unable to load schools for the sidebar:",
            error
        );

        return;

    }

    schools = data;

    if (badge) {

        badge.textContent = data.length;

        badge.hidden = false;

    }

    renderResults();

}


/* ==========================================
   SIDEBAR INJECTION
========================================== */

function injectSidebar() {

    const mount =
        document.getElementById(
            "sidebarMount"
        );

    if (!mount) {

        return;

    }


    const currentPath =
        window.location.pathname;

    function isActive(href) {

        return currentPath.endsWith(href) ?
            "active" :
            "";

    }


    // =====================================
    // BRAND HEADER
    // =====================================

    let brandHtml = "";

    if (AttendNGContext.tier === "platform") {

        brandHtml = `
            <div class="sidebar-brand">
                <img src="/assets/images/logo.png" alt="AttendNG" />
                <div class="sidebar-brand-text">
                    <h2>AttendNG</h2>
                    <span class="platform-badge">Platform</span>
                </div>
            </div>
            <div class="sidebar-search">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="sidebarSchoolSearch" placeholder="Find a school..." autocomplete="off" aria-label="Find a school">
                <div class="sidebar-search-results" id="sidebarSchoolResults"></div>
            </div>
        `;

    }
    else {

        brandHtml = `
            <div class="sidebar-brand">
                <img id="schoolLogo" src="/assets/images/logo.png" alt="" />
                <h2 title="${AttendNGContext.schoolName}">${AttendNGContext.schoolName}</h2>
            </div>
        `;

    }


    // =====================================
    // NAV ITEMS
    // =====================================

    let navHtml = "";


    if (AttendNGContext.tier === "platform") {

        // The school detail page belongs to Schools.

        const schoolsActive =
            currentPath.endsWith("/platform/schools.html") ||
            currentPath.endsWith("/platform/school-detail.html") ?
                "active" :
                "";

        navHtml = `
            <li class="${isActive('/platform/dashboard.html')}">
                <a href="/platform/dashboard.html"><i class="fa-solid fa-gauge-high"></i> Dashboard</a>
            </li>

            <li class="sidebar-section-label">Manage</li>
            <li class="${schoolsActive}">
                <a href="/platform/schools.html"><i class="fa-solid fa-building-columns"></i> Schools <span class="nav-badge" id="schoolsBadge" hidden></span></a>
            </li>

            <li class="sidebar-section-label">Team</li>
            <li class="${isActive('/platform/superadmins.html')}">
                <a href="/platform/superadmins.html"><i class="fa-solid fa-user-shield"></i> Superadmins</a>
            </li>

            <li class="sidebar-section-label">System</li>
            <li class="${isActive('/platform/settings.html')}">
                <a href="/platform/settings.html"><i class="fa-solid fa-gear"></i> Settings</a>
            </li>
        `;

    }
    else {

        // Grouped navigation for school accounts.
        //
        //   Dashboard                (always)
        //   People / Academics / School   (admins and genesis)
        //   My Class / Reports       (anyone with an assigned class)
        //   My Account + Logout      (always, at the bottom)
        //
        // Genesis accounts are never assigned a class, so they
        // only get the admin groups.

        const isAdmin =
            AttendNGContext.tier === "admin";

        const hasClass =
            Boolean(AttendNGContext.classId);

        const SCHOOL = "/school/";
        const ADMIN = "/school/admin/";


        // "also" lists child pages that should keep this item
        // (and its group) highlighted.

        function navItem(href, icon, label, also) {

            return { href, icon, label, also: also || [] };

        }

        function itemIsActive(item) {

            return [item.href, ...item.also].some(
                href => currentPath.endsWith(href)
            );

        }

        function renderItem(item) {

            return `
            <li class="${itemIsActive(item) ? "active" : ""}">
                <a href="${item.href}"><i class="fa-solid ${item.icon}"></i> ${item.label}</a>
            </li>`;

        }


        const groups = [];

        if (isAdmin) {

            groups.push({
                key: "people",
                label: "People",
                icon: "fa-users",
                items: [
                    navItem(ADMIN + "teachers.html", "fa-user-tie", "Teachers"),
                    navItem(ADMIN + "classes.html", "fa-school", "Classes", [ADMIN + "roster.html", ADMIN + "class-subjects.html"])
                ]
            });

            groups.push({
                key: "academics",
                label: "Academics",
                icon: "fa-graduation-cap",
                items: [
                    navItem(ADMIN + "subjects.html", "fa-book", "Subjects"),
                    navItem(ADMIN + "sessions.html", "fa-calendar-days", "Sessions"),
                    navItem(SCHOOL + "results.html", "fa-pen-to-square", "Results"),
                    navItem(SCHOOL + "broadsheet.html", "fa-table-list", "Broadsheet"),
                    navItem(SCHOOL + "report-card.html", "fa-id-card", "Report Card")
                ]
            });

            groups.push({
                key: "school",
                label: "School",
                icon: "fa-building",
                items: [
                    navItem(ADMIN + "settings.html", "fa-building", "School Settings"),
                    navItem(ADMIN + "activity.html", "fa-clock-rotate-left", "Activity Log")
                ]
            });

        }

        if (hasClass) {

            const classItems = [
                navItem(SCHOOL + "attendance.html", "fa-calendar-check", "Attendance"),
                navItem(SCHOOL + "students.html", "fa-user-graduate", "Students"),
                navItem(SCHOOL + "ratings.html", "fa-star-half-stroke", "Behaviour &amp; Skills")
            ];

            // Admins already have Results under Academics.
            if (!isAdmin) {

                classItems.push(
                    navItem(SCHOOL + "results.html", "fa-pen-to-square", "Results")
                );

            }

            groups.push({
                key: "myclass",
                label: "My Class",
                icon: "fa-chalkboard-user",
                items: classItems
            });


            const reportItems = [];

            // Admins already have these under Academics.
            if (!isAdmin) {

                reportItems.push(
                    navItem(SCHOOL + "broadsheet.html", "fa-table-list", "Broadsheet"),
                    navItem(SCHOOL + "report-card.html", "fa-id-card", "Report Card")
                );

            }

            reportItems.push(
                navItem(SCHOOL + "report-weekly.html", "fa-calendar-week", "Weekly Report"),
                navItem(SCHOOL + "report-term.html", "fa-file-lines", "Term Report"),
                navItem(SCHOOL + "analytics.html", "fa-chart-line", "Analytics")
            );

            groups.push({
                key: "reports",
                label: "Reports",
                icon: "fa-file-lines",
                items: reportItems
            });

        }


        // A teacher without a class has nothing but Results.

        const loneItems =
            (!isAdmin && !hasClass) ?
                renderItem(navItem(SCHOOL + "results.html", "fa-pen-to-square", "Results")) :
                "";


        const storedOpen =
            readOpenGroups();

        const groupsHtml =
            groups.map(
                (group) => {

                    const hasActive =
                        group.items.some(itemIsActive);

                    const isOpen =
                        hasActive ||
                        storedOpen.includes(group.key);

                    return `
            <li class="has-submenu nav-group ${isOpen ? "open" : ""} ${hasActive ? "has-active" : ""}" data-group="${group.key}">
                <a href="#" class="submenu-toggle"><i class="fa-solid ${group.icon}"></i> ${group.label} <i class="fa-solid fa-chevron-down submenu-caret"></i></a>
                <ul class="submenu">
                    ${group.items.map(renderItem).join("")}
                </ul>
            </li>`;

                }
            ).join("");


        navHtml = `
            ${renderItem(navItem(SCHOOL + "dashboard.html", "fa-house", "Dashboard"))}
            ${loneItems}
            ${groupsHtml}
            <li class="sidebar-divider" aria-hidden="true"></li>
            ${renderItem(navItem(SCHOOL + "settings.html", "fa-user-gear", "My Account"))}
        `;

    }


    mount.innerHTML = `
        ${brandHtml}
        <ul>
            ${navHtml}
            <li>
                <a href="#" id="logoutBtn"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>
            </li>
        </ul>
    `;


    // Platform accounts get their own darker sidebar, school
    // search and school count.

    if (AttendNGContext.tier === "platform") {

        mount.classList.add("sidebar-platform");

        setupPlatformSidebar();

    }


    // Re-bind logout button since it was just injected fresh.

    const logoutBtn =
        document.getElementById(
            "logoutBtn"
        );

    if (logoutBtn) {

        logoutBtn.addEventListener(
            "click",
            (event) => {

                event.preventDefault();

                showLogoutConfirmModal(
                    logoutBtn
                );

            }
        );

    }


    // Expand/collapse submenus (Reports, admin's Classes list).

    document.querySelectorAll(".submenu-toggle").forEach(
        toggle => {

            toggle.addEventListener(
                "click",
                (event) => {

                    event.preventDefault();

                    toggle.closest("li").classList.toggle("open");

                    saveOpenGroups();

                }
            );

        }
    );

}


/* ==========================================
   MOBILE NAVIGATION
   (unchanged from the original — sidebar
   markup is now injected first, but the
   drawer behavior works the same either way)
========================================== */

function setupMobileNav() {

    const sidebar =
        document.querySelector(".sidebar");

    if (!sidebar) {

        return;

    }

    if (document.querySelector(".mobile-topbar")) {

        return;

    }


    const topbar =
        document.createElement("div");

    topbar.className =
        "mobile-topbar";

    const topbarLogoUrl =
        (AttendNGContext.tier !== "platform" && AttendNGContext.schoolLogoUrl) ?
            AttendNGContext.schoolLogoUrl :
            "/assets/images/logo.png";

    const topbarTitle =
        (AttendNGContext.tier !== "platform" && AttendNGContext.schoolName) ?
            AttendNGContext.schoolName :
            "AttendNG";

    topbar.innerHTML = `
        <button type="button" class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Open menu">
            <i class="fa-solid fa-bars"></i>
        </button>
        <img src="${topbarLogoUrl}" alt="" class="mobile-topbar-logo">
        <span class="mobile-topbar-title" title="${topbarTitle}">${topbarTitle}</span>
    `;

    document.body.prepend(topbar);


    const overlay =
        document.createElement("div");

    overlay.className =
        "sidebar-overlay";

    overlay.id =
        "sidebarOverlay";

    document.body.appendChild(overlay);


    const menuBtn =
        document.getElementById(
            "mobileMenuBtn"
        );


    function openSidebar() {

        sidebar.classList.add("open");

        overlay.classList.add("show");

        menuBtn.innerHTML =
            `<i class="fa-solid fa-xmark"></i>`;

    }


    function closeSidebar() {

        sidebar.classList.remove("open");

        overlay.classList.remove("show");

        menuBtn.innerHTML =
            `<i class="fa-solid fa-bars"></i>`;

    }


    menuBtn.addEventListener(
        "click",
        () => {

            sidebar.classList.contains("open") ?
                closeSidebar() :
                openSidebar();

        }
    );


    overlay.addEventListener(
        "click",
        closeSidebar
    );


    // Re-bind on every injectSidebar() call too, since the
    // <a> tags inside get replaced.
    //
    // Group headers (.submenu-toggle) only expand or collapse
    // their group, so they must not close the drawer. It closes
    // when the person actually picks a page.

    document.querySelectorAll(".sidebar a:not(.submenu-toggle)").forEach(
        link => {

            link.addEventListener(
                "click",
                closeSidebar
            );

        }
    );

}


/* ==========================================
   LOGOUT CONFIRMATION MODAL
   (unchanged from the original)
========================================== */

function showLogoutConfirmModal(logoutBtn) {

    let modal =
        document.getElementById(
            "logoutConfirmModal"
        );

    if (!modal) {

        modal =
            buildLogoutConfirmModal();

        document.body.appendChild(modal);

    }

    modal.style.display =
        "flex";


    const cancelBtn =
        document.getElementById(
            "logoutConfirmCancel"
        );

    const okBtn =
        document.getElementById(
            "logoutConfirmOk"
        );


    function closeModal() {

        modal.style.display =
            "none";

    }


    cancelBtn.onclick =
        closeModal;

    modal.onclick =
        (event) => {

            if (event.target === modal) {

                closeModal();

            }

        };

    okBtn.onclick =
        async () => {

            closeModal();

            await performLogout(logoutBtn);

        };

}


function buildLogoutConfirmModal() {

    const modal =
        document.createElement("div");

    modal.id =
        "logoutConfirmModal";

    modal.className =
        "confirm-modal";

    modal.innerHTML = `
        <div class="confirm-card">
            <div class="confirm-header">
                <h2>Logout</h2>
            </div>
            <div class="confirm-body">
                <p>Are you sure you want to logout?</p>
            </div>
            <div class="confirm-footer">
                <button id="logoutConfirmCancel" type="button" class="btn-info">Cancel</button>
                <button id="logoutConfirmOk" type="button" class="btn-danger">Logout</button>
            </div>
        </div>
    `;

    return modal;

}


async function performLogout(logoutBtn) {

    logoutBtn.style.pointerEvents =
        "none";

    try {

        const {
            error
        } =
            await supabaseClient.auth.signOut();

        if (error) {

            throw error;

        }

        window.location.href =
            "/login.html";

    }

    catch (error) {

        console.error(
            "Logout error:",
            error
        );

        logoutBtn.style.pointerEvents =
            "auto";

        alert(
            "Unable to log out. Please try again."
        );

    }

}


/* ==========================================
   GENERIC STICKY-FIRST-TWO-COLUMNS TABLES
   Applied automatically to every table on
   every page, so any list — Teachers, Classes,
   Schools, etc. — scrolls horizontally on
   narrow screens with its first two columns
   pinned, the same way the Attendance page's
   S/N + Name columns work.

   Tables that already have their own manually
   curated sticky-sn/sticky-name treatment
   (Attendance, the report pages) are left
   alone entirely, since those already tune
   column widths for that specific layout.
========================================== */

function setupStickyTables() {

    applyStickyToAllTables();

    let debounceTimer =
        null;

    const observer =
        new MutationObserver(
            () => {

                clearTimeout(debounceTimer);

                debounceTimer =
                    setTimeout(applyStickyToAllTables, 50);

            }
        );

    observer.observe(
        document.body,
        { childList: true, subtree: true }
    );

}


function applyStickyToAllTables() {

    document.querySelectorAll("table").forEach(
        table => {

            // Already hand-tuned elsewhere (Attendance, Reports) —
            // don't double up on it.

            if (table.querySelector(".sticky-sn, .sticky-name, .sticky-col1, .sticky-col2")) {

                return;

            }


            // Wrap in a scrollable container, once. Kept as a
            // plain div (no border-radius) so sticky content
            // can't visually escape a rounded corner — the same
            // fix used for the Attendance table.

            if (!table.parentElement.classList.contains("table-scroll-wrapper")) {

                const wrapper =
                    document.createElement("div");

                wrapper.className =
                    "table-scroll-wrapper";

                table.parentElement.insertBefore(wrapper, table);

                wrapper.appendChild(table);

            }


            const rows =
                table.rows;

            if (rows.length === 0) {

                return;

            }


            // Measure the first column's width from the header
            // row (or the first row available), so every row's
            // second column lines up at the same offset.

            const referenceRow =
                rows[0];

            if (referenceRow.cells.length < 2) {

                return;

            }

            const firstColWidth =
                referenceRow.cells[0].offsetWidth;


            Array.from(rows).forEach(
                row => {

                    if (row.cells.length < 2) {

                        return;

                    }

                    const firstCell =
                        row.cells[0];

                    const secondCell =
                        row.cells[1];

                    firstCell.classList.add("sticky-col");

                    firstCell.style.left =
                        "0px";

                    secondCell.classList.add("sticky-col", "sticky-col-shadow");

                    secondCell.style.left =
                        `${firstColWidth}px`;

                }
            );

        }
    );

}


/* ==========================================
   TIME-BASED GREETING
   Fills any #greeting element with Good
   Morning/Afternoon/Evening based on the
   time of day. A no-op on pages that don't
   have this element.
========================================== */

function setGreeting() {

    const el =
        document.getElementById("greeting");

    if (!el) {

        return;

    }

    const hour =
        new Date().getHours();

    let greeting;

    if (hour < 12) {

        greeting = "Good morning,";

    }
    else if (hour < 17) {

        greeting = "Good afternoon,";

    }
    else {

        greeting = "Good evening,";

    }

    el.textContent =
        greeting;

}