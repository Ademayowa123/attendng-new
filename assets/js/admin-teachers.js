/*************************************************
 * ADMIN-TEACHERS.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

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


async function loadMembers() {

    const {
        data: members,
        error

    } =
        await supabaseClient
            .from("school_members")
            .select(
                "id, full_name, username, role, is_genesis"
            )
            .eq(
                "school_id",
                AttendNGContext.schoolId
            );


    if (error) {

        console.error(
            "Unable to load teachers:",
            error
        );

        return;

    }


    // Admins first (genesis first among admins), then teachers,
    // alphabetical within each group.

    const sorted =
        [...members].sort(
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


    const tbody =
        document.getElementById("membersTableBody");

    const cardsMount =
        document.getElementById("teacherCardsMount");

    tbody.innerHTML =
        "";

    cardsMount.innerHTML =
        "";


    sorted.forEach(
        member => {

            const roleLabel =
                member.is_genesis ?
                    "Genesis admin" :
                    (member.role === "admin" ? "Admin" : "Teacher");


            const isSelf =
                member.id === AttendNGContext.memberId;

            const deleteHtml =
                (member.is_genesis || isSelf) ?
                    "" :
                    ` <button class="btn-danger delete-member-btn" data-id="${member.id}" data-name="${member.full_name}">Delete</button>`;

            const actionHtml =
                (member.is_genesis ?
                    "" :
                    (member.role === "admin" ?
                        `<button class="btn-light demote-btn" data-id="${member.id}" data-name="${member.full_name}">Demote to teacher</button>` :
                        `<button class="btn-light promote-btn" data-id="${member.id}" data-name="${member.full_name}">Make admin</button>`
                    )
                ) +
                ` <button class="btn-light reset-password-btn" data-id="${member.id}" data-name="${member.full_name}">Reset password</button>` +
                deleteHtml;


            // Desktop table row — unchanged, actions inline.

            const row =
                document.createElement("tr");

            row.style.borderBottom =
                "1px solid var(--border)";

            row.innerHTML = `
                <td class="sticky-col1" style="padding:10px 4px;">${member.full_name}</td>
                <td class="sticky-col2" style="padding:10px 4px;"><code>${member.username}</code></td>
                <td style="padding:10px 4px;">${roleLabel}</td>
                <td class="desktop-actions-cell" style="padding:10px 4px; text-align:right;">
                    <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end;">${actionHtml}</div>
                </td>
            `;

            tbody.appendChild(row);


            // Mobile-only card — same buttons, revealed by the
            // ^ chevron toggle instead of squeezed into a row.
            // Desktop never shows .teacher-cards at all (CSS),
            // so there's no functional difference there.

            const card =
                document.createElement("div");

            card.className =
                "teacher-card";

            card.innerHTML = `
                <div class="teacher-card-header">
                    <div>
                        <div class="teacher-card-name">${member.full_name}</div>
                        <div class="teacher-card-role">${roleLabel}</div>
                    </div>
                    <button type="button" class="row-toggle-btn" data-target="teacher-card-actions-${member.id}" aria-label="Show actions">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
                <div class="teacher-card-body">
                    <div><span class="teacher-card-label">Username:</span><code>${member.username}</code></div>
                </div>
                <div class="teacher-card-actions" id="teacher-card-actions-${member.id}" style="display:none;">
                    ${actionHtml}
                </div>
            `;

            cardsMount.appendChild(card);

        }
    );


    // =====================================
    // BIND PROMOTE / DEMOTE
    // =====================================

    cardsMount.querySelectorAll(".row-toggle-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => {

                    const target =
                        document.getElementById(btn.dataset.target);

                    if (!target) {

                        return;

                    }

                    const isOpen =
                        target.style.display !== "none";

                    target.style.display =
                        isOpen ? "none" : "flex";

                    btn.classList.toggle(
                        "is-open",
                        !isOpen
                    );

                    btn.setAttribute(
                        "aria-label",
                        isOpen ? "Show actions" : "Hide actions"
                    );

                }
            );

        }
    );


    // Action buttons render twice — once inline in the desktop
    // table, once inside the mobile card — so bind across both
    // containers together.

    const allRows =
        [tbody, cardsMount];

    allRows.forEach(
        container => {

            container.querySelectorAll(".promote-btn").forEach(
                btn => {

                    btn.addEventListener(
                        "click",
                        () => changeRole(btn.dataset.id, btn.dataset.name, "admin")
                    );

                }
            );

            container.querySelectorAll(".demote-btn").forEach(
                btn => {

                    btn.addEventListener(
                        "click",
                        () => changeRole(btn.dataset.id, btn.dataset.name, "teacher")
                    );

                }
            );

            container.querySelectorAll(".reset-password-btn").forEach(
                btn => {

                    btn.addEventListener(
                        "click",
                        () => resetPassword(btn.dataset.id, btn.dataset.name)
                    );

                }
            );

            container.querySelectorAll(".delete-member-btn").forEach(
                btn => {

                    btn.addEventListener(
                        "click",
                        () => deleteMember(btn.dataset.id, btn.dataset.name)
                    );

                }
            );

        }
    );

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