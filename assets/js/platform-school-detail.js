/*************************************************
 * PLATFORM-SCHOOL-DETAIL.JS
 *************************************************/

let schoolId = null;
let schoolNameGlobal = "";


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    schoolId =
        sessionStorage.getItem("attendng_selected_school_id");

    const schoolName =
        sessionStorage.getItem("attendng_selected_school_name");

    schoolNameGlobal =
        schoolName || "";

    if (!schoolId) {

        window.location.href =
            "/platform/schools.html";

        return;

    }

    document.getElementById("schoolNameTitle").textContent =
        schoolName || "School";

    document.getElementById("schoolNameCrumb").textContent =
        schoolName || "";


    await loadMembers();


    document.getElementById("closeResetPasswordModal").addEventListener(
        "click",
        () => {

            document.getElementById("resetPasswordModal").style.display =
                "none";

        }
    );


    document.getElementById("openDeleteSchoolBtn").addEventListener(
        "click",
        () => {

            document.getElementById("deleteSchoolNamePrompt").textContent =
                schoolNameGlobal;

            document.getElementById("deleteSchoolConfirmInput").value =
                "";

            document.getElementById("deleteSchoolError").style.display =
                "none";

            document.getElementById("deleteSchoolModal").style.display =
                "flex";

        }
    );

    document.getElementById("cancelDeleteSchool").addEventListener(
        "click",
        () => {

            document.getElementById("deleteSchoolModal").style.display =
                "none";

        }
    );

    document.getElementById("confirmDeleteSchool").addEventListener(
        "click",
        handleDeleteSchool
    );

});


async function handleDeleteSchool() {

    const errorEl =
        document.getElementById("deleteSchoolError");

    const submitBtn =
        document.getElementById("confirmDeleteSchool");

    const typedName =
        document.getElementById("deleteSchoolConfirmInput").value;

    errorEl.style.display =
        "none";


    if (typedName !== schoolNameGlobal) {

        errorEl.textContent =
            "That doesn't match the school's name exactly.";

        errorEl.style.display =
            "block";

        return;

    }


    submitBtn.disabled =
        true;

    submitBtn.textContent =
        "Deleting…";


    try {

        const {
            data,
            error: invokeError

        } =
            await supabaseClient.functions.invoke(
                "delete-school",
                {
                    body: {
                        schoolId,
                        confirmName: typedName
                    }
                }
            );

        if (invokeError) {

            throw new Error(await extractFunctionError(invokeError));

        }

        if (data && data.error) {

            throw new Error(data.error);

        }

        sessionStorage.removeItem("attendng_selected_school_id");

        sessionStorage.removeItem("attendng_selected_school_name");

        window.location.href =
            "/platform/schools.html";

    }

    catch (error) {

        errorEl.textContent =
            error.message ||
            "Unable to delete this school.";

        errorEl.style.display =
            "block";

        submitBtn.disabled =
            false;

        submitBtn.textContent =
            "Delete permanently";

    }

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


async function loadMembers() {

    const {
        data,
        error

    } =
        await supabaseClient
            .from("school_members")
            .select("id, full_name, username, role, is_genesis")
            .eq("school_id", schoolId);


    if (error) {

        console.error("Unable to load members:", error);

        return;

    }


    const admins =
        data
            .filter(m => m.role === "admin")
            .sort((a, b) => (a.is_genesis === b.is_genesis) ? a.full_name.localeCompare(b.full_name) : (a.is_genesis ? -1 : 1));

    const teachers =
        data
            .filter(m => m.role === "teacher")
            .sort((a, b) => a.full_name.localeCompare(b.full_name));


    renderRows("adminsTableBody", "adminsCardsMount", admins);
    renderRows("teachersTableBody", "teachersCardsMount", teachers);

}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}


function renderRows(tbodyId, cardsMountId, members) {

    const tbody =
        document.getElementById(tbodyId);

    const cardsMount =
        document.getElementById(cardsMountId);

    tbody.innerHTML =
        "";

    cardsMount.innerHTML =
        "";

    if (members.length === 0) {

        tbody.innerHTML =
            `<tr><td style="padding:10px 4px; color:var(--text-muted);">None yet.</td></tr>`;

        cardsMount.innerHTML =
            `<div style="padding:4px; font-size:14px; color:var(--text-muted);">None yet.</div>`;

        return;

    }

    members.forEach(
        member => {

            const roleLabel =
                member.is_genesis ? "Genesis admin" :
                    (member.role === "admin" ? "Admin" : "Teacher");

            const safeName =
                escapeHtml(member.full_name);

            const safeUsername =
                escapeHtml(member.username);

            const actionHtml =
                `<button class="btn-light reset-password-btn" data-id="${escapeHtml(member.id)}" data-name="${safeName}">Reset password</button>`;


            // Desktop table row — unchanged, action inline.

            const row =
                document.createElement("tr");

            row.style.borderBottom =
                "1px solid var(--border)";

            row.innerHTML = `
                <td style="padding:10px 4px;">${safeName}</td>
                <td style="padding:10px 4px;"><code>${safeUsername}</code></td>
                <td style="padding:10px 4px; color:var(--text-secondary);">${roleLabel}</td>
                <td style="padding:10px 4px; text-align:right;">${actionHtml}</td>
            `;

            tbody.appendChild(row);


            // Mobile-only card — same layout as the school admin's
            // Teachers page: name + role, a chevron that reveals
            // the actions, and the username underneath.

            const card =
                document.createElement("div");

            card.className =
                "teacher-card";

            card.innerHTML = `
                <div class="teacher-card-header">
                    <div>
                        <div class="teacher-card-name">${safeName}</div>
                        <div class="teacher-card-role">${roleLabel}</div>
                    </div>
                    <button type="button" class="row-toggle-btn" data-target="member-card-actions-${escapeHtml(member.id)}" aria-label="Show actions">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
                <div class="teacher-card-body">
                    <div><span class="teacher-card-label">Username:</span><code>${safeUsername}</code></div>
                </div>
                <div class="teacher-card-actions" id="member-card-actions-${escapeHtml(member.id)}" style="display:none;">
                    ${actionHtml}
                </div>
            `;

            cardsMount.appendChild(card);

        }
    );


    // Chevron toggles (mobile cards)

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


    // The reset button renders twice (table + card), so bind both.

    [tbody, cardsMount].forEach(
        container => {

            container.querySelectorAll(".reset-password-btn").forEach(
                btn => {

                    btn.addEventListener(
                        "click",
                        () => resetPassword(btn.dataset.id, btn.dataset.name)
                    );

                }
            );

        }
    );

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
                "platform-reset-password",
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

    }

    catch (error) {

        showToast(
            error.message ||
            "Unable to reset this password."
        );

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

        // Body wasn't JSON, or already consumed — fall through
        // to the generic message below.

    }

    return invokeError.message || "Something went wrong.";

}


/* ==========================================
   REUSABLE CONFIRM MODAL + TOAST
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
                    <div class="confirm-card" style="max-width:calc(100vw - 32px);">
                        <div class="confirm-header"><h2 id="genericConfirmTitle"></h2></div>
                        <div class="confirm-body"><p id="genericConfirmMessage"></p></div>
                        <div class="confirm-footer">
                            <button id="genericConfirmCancel" type="button" class="btn-info">Cancel</button>
                            <button id="genericConfirmOk" type="button" class="btn-primary">Continue</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modal);

            }

            document.getElementById("genericConfirmTitle").textContent = title;
            document.getElementById("genericConfirmMessage").textContent = message;
            modal.style.display = "flex";

            const cleanup =
                (result) => {

                    modal.style.display = "none";
                    resolve(result);

                };

            document.getElementById("genericConfirmCancel").onclick = () => cleanup(false);
            document.getElementById("genericConfirmOk").onclick = () => cleanup(true);
            modal.onclick = (event) => { if (event.target === modal) cleanup(false); };

        }
    );

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