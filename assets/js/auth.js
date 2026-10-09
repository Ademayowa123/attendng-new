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
                <h2>AttendNG</h2>
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

        navHtml = `
            <li class="${isActive('dashboard.html')}">
                <a href="/platform/dashboard.html"><i class="fa-solid fa-house"></i> Dashboard</a>
            </li>
            <li class="${isActive('schools.html')}">
                <a href="/platform/schools.html"><i class="fa-solid fa-building-columns"></i> Schools</a>
            </li>
            <li class="${isActive('superadmins.html')}">
                <a href="/platform/superadmins.html"><i class="fa-solid fa-user-shield"></i> Superadmins</a>
            </li>
            <li class="${isActive('settings.html')}">
                <a href="/platform/settings.html"><i class="fa-solid fa-gear"></i> Settings</a>
            </li>
        `;

    }
    else {

        // Shared teacher-facing items — shown to any member
        // (admin or teacher) who has an assigned class.
        // Genesis admins and unassigned admins never see these.

        const hasClass =
            Boolean(AttendNGContext.classId);


        const teacherItems = hasClass ? `
            <li class="${isActive('/school/dashboard.html')}">
                <a href="/school/dashboard.html"><i class="fa-solid fa-house"></i> Dashboard</a>
            </li>
            <li class="${isActive('attendance.html')}">
                <a href="/school/attendance.html"><i class="fa-solid fa-calendar-check"></i> Attendance</a>
            </li>
            <li class="${isActive('students.html')}">
                <a href="/school/students.html"><i class="fa-solid fa-user-graduate"></i> Students</a>
            </li>
            <li class="${isActive('/school/results.html')}">
                <a href="/school/results.html"><i class="fa-solid fa-pen-to-square"></i> Results</a>
            </li>
            ${AttendNGContext.tier === "teacher" ? `<li class="${isActive('broadsheet.html')}">
                <a href="/school/broadsheet.html"><i class="fa-solid fa-table-list"></i> Broadsheet</a>
            </li>
            <li class="${isActive('report-card.html')}">
                <a href="/school/report-card.html"><i class="fa-solid fa-id-card"></i> Report Card</a>
            </li>` : ""}
            <li class="has-submenu ${isActive('report')}">
                <a href="#" class="submenu-toggle"><i class="fa-solid fa-file-lines"></i> Reports <i class="fa-solid fa-chevron-down submenu-caret"></i></a>
                <ul class="submenu">
                    <li class="${isActive('report-weekly.html')}"><a href="/school/report-weekly.html">Weekly report</a></li>
                    <li class="${isActive('report-term.html')}"><a href="/school/report-term.html">Term report</a></li>
                </ul>
            </li>
            <li class="${isActive('analytics.html')}">
                <a href="/school/analytics.html"><i class="fa-solid fa-chart-line"></i> Analytics</a>
            </li>
            <li class="${isActive('/school/settings.html')}">
                <a href="/school/settings.html"><i class="fa-solid fa-gear"></i> Settings</a>
            </li>
        ` : `
            <li class="${isActive('/school/dashboard.html')}">
                <a href="/school/dashboard.html"><i class="fa-solid fa-house"></i> Dashboard</a>
            </li>
            <li class="${isActive('/school/results.html')}">
                <a href="/school/results.html"><i class="fa-solid fa-pen-to-square"></i> Results</a>
            </li>
            <li class="${isActive('/school/settings.html')}">
                <a href="/school/settings.html"><i class="fa-solid fa-gear"></i> Settings</a>
            </li>
        `;


        // Admin-only section — shown regardless of whether
        // this admin also has a class of their own.

        const adminItems =
            AttendNGContext.tier === "admin" ? `
            <li class="sidebar-section-label">Admin</li>
            <li class="${isActive('/school/admin/classes.html')}">
                <a href="/school/admin/classes.html"><i class="fa-solid fa-school"></i> Classes</a>
            </li>
            <li class="${isActive('/school/admin/subjects.html')}">
                <a href="/school/admin/subjects.html"><i class="fa-solid fa-book"></i> Subjects</a>
            </li>
            <li class="${isActive('broadsheet.html')}">
                <a href="/school/broadsheet.html"><i class="fa-solid fa-table-list"></i> Broadsheet</a>
            </li>
            <li class="${isActive('report-card.html')}">
                <a href="/school/report-card.html"><i class="fa-solid fa-id-card"></i> Report Card</a>
            </li>
            <li class="${isActive('teachers.html')}">
                <a href="/school/admin/teachers.html"><i class="fa-solid fa-users"></i> Teachers</a>
            </li>
            <li class="${isActive('sessions.html')}">
                <a href="/school/admin/sessions.html"><i class="fa-solid fa-calendar-days"></i> Sessions</a>
            </li>
            <li class="${isActive('activity.html')}">
                <a href="/school/admin/activity.html"><i class="fa-solid fa-clock-rotate-left"></i> Activity Log</a>
            </li>
            <li class="${isActive('/school/admin/settings.html')}">
                <a href="/school/admin/settings.html"><i class="fa-solid fa-building"></i> Settings</a>
            </li>
        ` : "";


        navHtml =
            teacherItems +
            adminItems;

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

    document.querySelectorAll(".sidebar a").forEach(
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