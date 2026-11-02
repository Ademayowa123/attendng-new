/*************************************************
 * ADMIN-TEACHERS.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    bindTeacherToolbar();

    await loadMembers();


    // =========================================
    // ADD TEACHER MODAL WIRING
    // =========================================

    const modal =
        document.getElementById("addTeacherModal");

    const formView =
        document.getElementById("addTeacherForm");

    const resultView =
        document.getElementById("addTeacherResult");


    document.getElementById("openAddTeacher").addEventListener(
        "click",
        () => {

            formView.style.display =
                "block";

            resultView.style.display =
                "none";

            document.getElementById("teacherFullName").value =
                "";

            document.getElementById("addTeacherError").style.display =
                "none";

            modal.style.display =
                "flex";

        }
    );


    document.getElementById("cancelAddTeacher").addEventListener(
        "click",
        () => {

            modal.style.display =
                "none";

        }
    );


    document.getElementById("closeAddTeacherResult").addEventListener(
        "click",
        async () => {

            modal.style.display =
                "none";

            await loadMembers();

        }
    );


    document.getElementById("closeResetPasswordModal").addEventListener(
        "click",
        () => {

            document.getElementById("resetPasswordModal").style.display =
                "none";

        }
    );


    document.getElementById("submitAddTeacher").addEventListener(
        "click",
        async () => {

            const errorEl =
                document.getElementById("addTeacherError");

            const submitBtn =
                document.getElementById("submitAddTeacher");

            const fullName =
                document.getElementById("teacherFullName").value.trim();


            if (!fullName) {

                errorEl.textContent =
                    "Please enter a name.";

                errorEl.style.display =
                    "block";

                return;

            }


            errorEl.style.display =
                "none";

            submitBtn.disabled =
                true;

            submitBtn.textContent =
                "Creating…";


            try {

                const {
                    data,
                    error: invokeError

                } =
                    await supabaseClient.functions.invoke(
                        "create-teacher",
                        {
                            body: {
                                fullName
                            }
                        }
                    );


                if (invokeError) {

                    throw new Error(await extractFunctionError(invokeError));

                }

                if (data && data.error) {

                    throw new Error(data.error);

                }


                document.getElementById("addTeacherResultText").textContent =
                    `Share these details with ${fullName}. This password won't be shown again.`;

                document.getElementById("newTeacherUsername").textContent =
                    data.credentials.username;

                document.getElementById("newTeacherPassword").textContent =
                    data.credentials.password;


                formView.style.display =
                    "none";

                resultView.style.display =
                    "block";

                logActivity("teacher.created", fullName, `Username: ${data.credentials.username}`);

            }

            catch (error) {

                console.error(
                    "Add teacher failed:",
                    error
                );

                errorEl.textContent =
                    error.message ||
                    "Something went wrong adding this teacher.";

                errorEl.style.display =
                    "block";

            }

            finally {

                submitBtn.disabled =
                    false;

                submitBtn.textContent =
                    "Add teacher";

            }

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


// =========================================
// STATE + SMALL HELPERS (teachers grid)
// =========================================

let tmMembers = [];
let tmClassByTeacher = {};
let tmTeaching = {};
let tmSheetReturnFocus = null;
let tmFilter = "all";
let tmQuery = "";

const TM_TONES = ["teal", "indigo", "amber", "green", "rose", "sky"];

function tmEsc(value) {

    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}

function tmInitials(name) {

    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

    if (!parts.length) {

        return "?";

    }

    if (parts.length === 1) {

        return parts[0].slice(0, 2).toUpperCase();

    }

    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

}

function tmTone(name) {

    let hash = 0;

    for (const ch of String(name || "")) {

        hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

    }

    return TM_TONES[hash % TM_TONES.length];

}


function bindTeacherToolbar() {

    const search = document.getElementById("teacherSearch");

    if (search) {

        search.addEventListener("input", () => {

            tmQuery = search.value.trim().toLowerCase();

            renderMembers();

        });

    }

    const sheet = document.getElementById("teacherSheet");

    document.getElementById("sheetClose").addEventListener("click", closeTeacherSheet);

    sheet.addEventListener("click", (e) => {

        if (e.target === sheet) {

            closeTeacherSheet();

        }

    });

    document.addEventListener("keydown", (e) => {

        if (e.key === "Escape" && !sheet.hidden) {

            closeTeacherSheet();

        }

    });

    document.getElementById("sheetCopy").addEventListener("click", async () => {

        try {

            await navigator.clipboard.writeText(document.getElementById("sheetUsername").textContent);

            showToast("Username copied");

        }
        catch (err) {

            console.error("Copy failed:", err);

        }

    });

    document.querySelectorAll(".tm-chip").forEach(chip => {

        chip.addEventListener("click", () => {

            tmFilter = chip.dataset.filter;

            document.querySelectorAll(".tm-chip").forEach(c =>
                c.classList.toggle("is-active", c === chip)
            );

            renderMembers();

        });

    });

}


async function loadMembers() {

    const [membersResult, sessionResult] = await Promise.all([

        supabaseClient
            .from("school_members")
            .select("id, full_name, username, role, is_genesis")
            .eq("school_id", AttendNGContext.schoolId),

        supabaseClient
            .from("sessions")
            .select("id")
            .eq("school_id", AttendNGContext.schoolId)
            .eq("is_active", true)
            .maybeSingle()

    ]);


    if (membersResult.error) {

        console.error("Unable to load teachers:", membersResult.error);

        return;

    }


    // Active-session class assignments: which class each person
    // heads (classes.teacher_id) and which subjects they teach in
    // which class (class_subjects.teacher_id). If either lookup
    // fails the cards simply show less detail.

    tmClassByTeacher = {};
    tmTeaching = {};

    if (!sessionResult.error && sessionResult.data) {

        const { data: classRows, error: classError } =
            await supabaseClient
                .from("classes")
                .select("id, name, teacher_id")
                .eq("session_id", sessionResult.data.id);

        if (classError) {

            console.error("Unable to load classes:", classError);

        }
        else if (classRows && classRows.length) {

            const classNameById = {};

            classRows.forEach(c => {

                classNameById[c.id] = c.name;

                if (c.teacher_id) {

                    tmClassByTeacher[c.teacher_id] = c.name;

                }

            });

            const { data: csRows, error: csError } =
                await supabaseClient
                    .from("class_subjects")
                    .select("class_id, teacher_id, subjects ( name )")
                    .in("class_id", classRows.map(c => c.id));

            if (csError) {

                console.error("Unable to load teaching assignments:", csError);

            }
            else {

                (csRows || []).forEach(row => {

                    if (!row.teacher_id || !row.subjects) {

                        return;

                    }

                    const className = classNameById[row.class_id];

                    if (!className) {

                        return;

                    }

                    const byClass = (tmTeaching[row.teacher_id] = tmTeaching[row.teacher_id] || {});

                    (byClass[className] = byClass[className] || []).push(row.subjects.name);

                });

            }

        }

    }


    // Admins first (genesis first among admins), then teachers,
    // alphabetical within each group.

    tmMembers =
        [...membersResult.data].sort(
            (a, b) => {

                if (a.role !== b.role) {

                    return a.role === "admin" ? -1 : 1;

                }

                if (a.is_genesis !== b.is_genesis) {

                    return a.is_genesis ? -1 : 1;

                }

                return a.full_name.localeCompare(b.full_name);

            }
        );

    renderMembers();

}


function renderMembers() {

    const grid = document.getElementById("teacherGridMount");
    const empty = document.getElementById("teacherEmpty");

    // ---- summary tiles (always the full school, ignoring filters)

    const admins = tmMembers.filter(m => m.role === "admin").length;

    document.getElementById("statTotal").textContent = tmMembers.length;
    document.getElementById("statAdmins").textContent = admins;
    document.getElementById("statTeachers").textContent = tmMembers.length - admins;
    document.getElementById("statAssigned").textContent =
        tmMembers.filter(m => tmClassByTeacher[m.id]).length;

    // ---- apply search + role filter

    const visible = tmMembers.filter(m => {

        if (tmFilter !== "all" && m.role !== tmFilter) {

            return false;

        }

        if (!tmQuery) {

            return true;

        }

        return (
            m.full_name.toLowerCase().includes(tmQuery) ||
            (m.username || "").toLowerCase().includes(tmQuery)
        );

    });

    grid.innerHTML = "";

    empty.style.display = visible.length ? "none" : "block";


    visible.forEach(member => {

        const isAdmin = member.role === "admin";

        const isSelf = member.id === AttendNGContext.memberId;

        const meta = tmRoleMeta(member);

        const className = tmClassByTeacher[member.id];

        const subjectCount = tmSubjectCount(member.id);

        const headsHtml =
            className ?
                `<span class="tm-class"><i class="fa-solid fa-school"></i> ${tmEsc(className)}</span>` :
                `<span class="tm-class is-empty"><i class="fa-regular fa-circle"></i> No class headed</span>`;

        const teachHtml =
            subjectCount ?
                `<span class="tm-class tm-teach"><i class="fa-solid fa-book-open"></i> ${subjectCount} subject${subjectCount === 1 ? "" : "s"}</span>` :
                `<span class="tm-class is-empty"><i class="fa-regular fa-circle"></i> No subjects yet</span>`;

        const card = document.createElement("article");

        card.className = "tm-card";

        card.tabIndex = 0;

        card.setAttribute("role", "button");

        card.setAttribute("aria-haspopup", "dialog");

        card.setAttribute("aria-label", `Open details for ${member.full_name}`);

        card.innerHTML = `
            <div class="tm-card-top">
                <div class="tm-avatar tm-tone-${tmTone(member.full_name)}" aria-hidden="true">${tmEsc(tmInitials(member.full_name))}</div>
                <div class="tm-id">
                    <div class="tm-name">${tmEsc(member.full_name)}${isSelf ? ' <span class="tm-you">You</span>' : ""}</div>
                    <span class="tm-role tm-role-${meta.tone}"><i class="fa-solid ${meta.icon}"></i> ${meta.label}</span>
                </div>
                <i class="fa-solid fa-chevron-right tm-go" aria-hidden="true"></i>
            </div>

            <div class="tm-meta">
                <div class="tm-user">
                    <i class="fa-regular fa-user"></i>
                    <code>${tmEsc(member.username)}</code>
                </div>
                ${member.is_genesis
                    ? `<span class="tm-class"><i class="fa-solid fa-crown"></i> Manages the whole school</span>`
                    : headsHtml + teachHtml}
            </div>
        `;

        const open = () => openTeacherSheet(member.id, card);

        card.addEventListener("click", open);

        card.addEventListener("keydown", (e) => {

            if (e.key === "Enter" || e.key === " ") {

                e.preventDefault();

                open();

            }

        });

        grid.appendChild(card);

    });

}


function tmRoleMeta(member) {

    if (member.is_genesis) {

        return { label: "Genesis admin", icon: "fa-crown", tone: "gold" };

    }

    if (member.role === "admin") {

        return { label: "Admin", icon: "fa-user-shield", tone: "indigo" };

    }

    return { label: "Teacher", icon: "fa-chalkboard-user", tone: "teal" };

}

function tmSubjectCount(memberId) {

    const byClass = tmTeaching[memberId] || {};

    return Object.values(byClass).reduce((n, list) => n + list.length, 0);

}


function openTeacherSheet(memberId, returnFocusEl) {

    const member = tmMembers.find(m => m.id === memberId);

    if (!member) {

        return;

    }

    tmSheetReturnFocus = returnFocusEl || null;

    const isAdmin = member.role === "admin";

    const isSelf = member.id === AttendNGContext.memberId;

    const meta = tmRoleMeta(member);

    // ---- header

    const avatar = document.getElementById("sheetAvatar");

    avatar.className = `tm-avatar tm-avatar-lg tm-tone-${tmTone(member.full_name)}`;

    avatar.textContent = tmInitials(member.full_name);

    document.getElementById("sheetName").innerHTML =
        tmEsc(member.full_name) + (isSelf ? ' <span class="tm-you">You</span>' : "");

    const role = document.getElementById("sheetRole");

    role.className = `tm-role tm-role-${meta.tone}`;

    role.innerHTML = `<i class="fa-solid ${meta.icon}"></i> ${meta.label}`;

    document.getElementById("sheetUsername").textContent = member.username;

    // ---- class heading

    const className = tmClassByTeacher[member.id];

    document.getElementById("sheetHeading").innerHTML =
        className ?
            `<div class="tm-pill tm-pill-class"><i class="fa-solid fa-school"></i> ${tmEsc(className)}<span>Form teacher</span></div>` :
            `<p class="tm-sheet-empty">Not heading any class this session.</p>`;

    // ---- subjects, grouped by class

    const byClass = tmTeaching[member.id] || {};

    const classNames = Object.keys(byClass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    document.getElementById("sheetTeaching").innerHTML =
        classNames.length ?
            classNames.map(cn => `
                <div class="tm-teach-row">
                    <div class="tm-teach-class"><i class="fa-solid fa-door-open"></i> ${tmEsc(cn)}</div>
                    <div class="tm-teach-subjects">
                        ${byClass[cn].slice().sort((a, b) => a.localeCompare(b)).map(sub => `<span class="tm-pill">${tmEsc(sub)}</span>`).join("")}
                    </div>
                </div>
            `).join("") :
            `<p class="tm-sheet-empty">No subjects assigned yet.</p>`;

    // The genesis admin runs the school and never heads a class or
    // teaches subjects, so replace those two sections with a role line.

    const headingSection = document.getElementById("sheetHeading").closest(".tm-sheet-section");

    const teachingSection = document.getElementById("sheetTeaching").closest(".tm-sheet-section");

    teachingSection.style.display = member.is_genesis ? "none" : "";

    if (member.is_genesis) {

        headingSection.querySelector("h3").innerHTML = '<i class="fa-solid fa-crown"></i> Role';

        document.getElementById("sheetHeading").innerHTML =
            `<div class="tm-pill tm-pill-class"><i class="fa-solid fa-crown"></i> Manages the whole school</div>`;

    }
    else {

        headingSection.querySelector("h3").innerHTML = '<i class="fa-solid fa-school"></i> Class heading';

    }

    // ---- actions (same operations as before)

    const safeId = tmEsc(member.id);
    const safeName = tmEsc(member.full_name);

    const roleBtn =
        member.is_genesis ? "" :
            (isAdmin ?
                `<button type="button" class="btn-light" data-act="demote" data-id="${safeId}" data-name="${safeName}"><i class="fa-solid fa-arrow-down"></i> Demote to teacher</button>` :
                `<button type="button" class="btn-light" data-act="promote" data-id="${safeId}" data-name="${safeName}"><i class="fa-solid fa-user-shield"></i> Make admin</button>`);

    const resetBtn =
        `<button type="button" class="btn-light" data-act="reset" data-id="${safeId}" data-name="${safeName}"><i class="fa-solid fa-key"></i> Reset password</button>`;

    const deleteBtn =
        (member.is_genesis || isSelf) ? "" :
            `<button type="button" class="btn-danger" data-act="delete" data-id="${safeId}" data-name="${safeName}"><i class="fa-solid fa-trash-can"></i> Delete teacher</button>`;

    const actions = document.getElementById("sheetActions");

    actions.innerHTML = roleBtn + resetBtn + deleteBtn;

    actions.querySelectorAll("button").forEach(btn => {

        btn.addEventListener("click", () => {

            const { act, id, name } = btn.dataset;

            // Close first so the confirm / result modals that these
            // actions open aren't stacked on top of the sheet.
            closeTeacherSheet(false);

            if (act === "promote") { changeRole(id, name, "admin"); }
            else if (act === "demote") { changeRole(id, name, "teacher"); }
            else if (act === "reset") { resetPassword(id, name); }
            else if (act === "delete") { deleteMember(id, name); }

        });

    });

    const note = document.getElementById("sheetNote");

    if (member.is_genesis) {

        note.textContent = "The genesis admin can't be demoted or deleted.";

        note.style.display = "block";

    }
    else if (isSelf) {

        note.textContent = "You can't delete your own account.";

        note.style.display = "block";

    }
    else {

        note.style.display = "none";

    }

    const sheet = document.getElementById("teacherSheet");

    sheet.hidden = false;

    document.body.classList.add("tm-sheet-open");

    document.getElementById("sheetClose").focus();

}


function closeTeacherSheet(restoreFocus = true) {

    document.getElementById("teacherSheet").hidden = true;

    document.body.classList.remove("tm-sheet-open");

    if (restoreFocus && tmSheetReturnFocus && document.contains(tmSheetReturnFocus)) {

        tmSheetReturnFocus.focus();

    }

    tmSheetReturnFocus = null;

}


async function deleteMember(memberId, memberName) {

    const confirmed =
        await showConfirmModal(
            "Delete this member?",
            `Remove ${memberName} from this school? This deletes their account, unassigns any class they teach, and can't be undone.`
        );

    if (!confirmed) {

        return;

    }

    try {

        const {
            data,
            error: invokeError

        } =
            await supabaseClient.functions.invoke(
                "delete-member",
                { body: { memberId } }
            );

        if (invokeError) {

            throw new Error(await extractFunctionError(invokeError));

        }

        if (data && data.error) {

            throw new Error(data.error);

        }

        showToast(`${memberName} was removed.`);

        await loadMembers();

        logActivity("teacher.deleted", memberName);

    }

    catch (error) {

        showToast(
            error.message ||
            "Unable to remove this member."
        );

    }

}


async function resetPassword(memberId, memberName) {

    const confirmed =
        await showConfirmModal(
            "Reset password?",
            `Reset ${memberName}'s password? They'll need the new one to log in.`
        );

    if (!confirmed) {

        return;

    }

    try {

        const {
            data,
            error: invokeError

        } =
            await supabaseClient.functions.invoke(
                "reset-member-password",
                { body: { memberId } }
            );

        if (invokeError) {

            throw new Error(await extractFunctionError(invokeError));

        }

        if (data && data.error) {

            throw new Error(data.error);

        }

        document.getElementById("resetPasswordText").textContent =
            `Share this new password with ${memberName}. It won't be shown again.`;

        document.getElementById("resetUsername").textContent =
            data.credentials.username;

        document.getElementById("resetPassword").textContent =
            data.credentials.password;

        document.getElementById("resetPasswordModal").style.display =
            "flex";

        logActivity("teacher.password_reset", memberName);

    }

    catch (error) {

        showToast(
            error.message ||
            "Unable to reset this password."
        );

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


/* ==========================================
   REUSABLE CONFIRM MODAL
   Same visual pattern as the logout modal in
   auth.js — built once, reused for any yes/no
   confirmation on this page.
========================================== */

function showConfirmModal(title, message) {

    return new Promise(
        (resolve) => {

            let modal =
                document.getElementById("genericConfirmModal");

            if (!modal) {

                modal =
                    document.createElement("div");

                modal.id =
                    "genericConfirmModal";

                modal.className =
                    "confirm-modal";

                modal.innerHTML = `
                    <div class="confirm-card">
                        <div class="confirm-header">
                            <h2 id="genericConfirmTitle"></h2>
                        </div>
                        <div class="confirm-body">
                            <p id="genericConfirmMessage"></p>
                        </div>
                        <div class="confirm-footer">
                            <button id="genericConfirmCancel" type="button" class="btn-secondary">Cancel</button>
                            <button id="genericConfirmOk" type="button" class="btn-primary">Continue</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modal);

            }

            document.getElementById("genericConfirmTitle").textContent =
                title;

            document.getElementById("genericConfirmMessage").textContent =
                message;

            modal.style.display =
                "flex";


            const cleanup =
                (result) => {

                    modal.style.display =
                        "none";

                    resolve(result);

                };

            document.getElementById("genericConfirmCancel").onclick =
                () => cleanup(false);

            document.getElementById("genericConfirmOk").onclick =
                () => cleanup(true);

            modal.onclick =
                (event) => {

                    if (event.target === modal) {

                        cleanup(false);

                    }

                };

        }
    );

}


async function changeRole(memberId, memberName, newRole) {

    const confirmed =
        newRole === "admin" ?
            await showConfirmModal(
                "Make admin?",
                `Make ${memberName} an admin? They'll be able to manage classes, teachers, and sessions.`
            ) :
            await showConfirmModal(
                "Demote to teacher?",
                `Demote ${memberName} to teacher? They'll lose admin access.`
            );


    if (!confirmed) {

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("school_members")
            .update({ role: newRole })
            .eq("id", memberId);


    if (error) {

        // Most likely the "last admin" guardrail trigger firing.

        showToast(
            error.message ||
            "Unable to change this member's role."
        );

        return;

    }


    showToast(
        newRole === "admin" ?
            `${memberName} is now an admin.` :
            `${memberName} was demoted to teacher.`
    );

    await loadMembers();

    logActivity(
        newRole === "admin" ? "teacher.promoted" : "teacher.demoted",
        memberName
    );

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