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


    renderRows("adminsTableBody", admins);
    renderRows("teachersTableBody", teachers);

}


function renderRows(tbodyId, members) {

    const tbody =
        document.getElementById(tbodyId);

    tbody.innerHTML =
        "";

    if (members.length === 0) {

        tbody.innerHTML =
            `<tr><td style="padding:10px 4px; color:var(--text-muted);">None yet.</td></tr>`;

        return;

    }

    members.forEach(
        member => {

            const row =
                document.createElement("tr");

            row.style.borderBottom =
                "1px solid var(--border)";

            const roleLabel =
                member.is_genesis ? "Genesis admin" :
                    (member.role === "admin" ? "Admin" : "Teacher");

            row.innerHTML = `
                <td style="padding:10px 4px;">${member.full_name}</td>
                <td style="padding:10px 4px;"><code>${member.username}</code></td>
                <td style="padding:10px 4px; color:var(--text-secondary);">${roleLabel}</td>
                <td style="padding:10px 4px; text-align:right;">
                    <button class="btn-light reset-password-btn" data-id="${member.id}" data-name="${member.full_name}">Reset password</button>
                </td>
            `;

            tbody.appendChild(row);

        }
    );

    tbody.querySelectorAll(".reset-password-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => resetPassword(btn.dataset.id, btn.dataset.name)
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
                    <div class="confirm-card">
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