/*************************************************
 * PLATFORM-SUPERADMINS.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    await loadSuperadmins();


    const modal =
        document.getElementById("addSuperadminModal");

    const formView =
        document.getElementById("addSuperadminForm");

    const resultView =
        document.getElementById("addSuperadminResult");


    document.getElementById("openAddSuperadmin").addEventListener(
        "click",
        () => {

            document.getElementById("newAdminName").value = "";
            document.getElementById("newAdminEmail").value = "";
            document.getElementById("addSuperadminError").style.display = "none";

            formView.style.display = "block";
            resultView.style.display = "none";

            modal.style.display = "flex";

        }
    );

    document.getElementById("cancelAddSuperadmin").addEventListener(
        "click",
        () => { modal.style.display = "none"; }
    );

    document.getElementById("closeAddSuperadminResult").addEventListener(
        "click",
        async () => {

            modal.style.display = "none";

            await loadSuperadmins();

        }
    );

    document.getElementById("submitAddSuperadmin").addEventListener(
        "click",
        submitAddSuperadmin
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


async function loadSuperadmins() {

    const {
        data,
        error

    } =
        await supabaseClient
            .from("platform_admins")
            .select("id, full_name, email, created_at, is_founder")
            .order("created_at", { ascending: true });


    if (error) {

        console.error("Unable to load superadmins:", error);

        return;

    }


    const tbody =
        document.getElementById("superadminsTableBody");

    const cardsMount =
        document.getElementById("superadminCardsMount");

    tbody.innerHTML =
        "";

    cardsMount.innerHTML =
        "";

    data.forEach(
        admin => {

            const row =
                document.createElement("tr");

            row.style.borderBottom =
                "1px solid var(--border)";

            const addedDate =
                new Date(admin.created_at).toLocaleDateString(
                    "en-GB", { day: "numeric", month: "short", year: "numeric" }
                );

            const founderBadge =
                admin.is_founder ?
                    ` <span class="badge badge-success">Founder</span>` :
                    "";

            const isSelf =
                admin.id === AttendNGContext.platformAdminId;

            const deleteHtml =
                (admin.is_founder || isSelf) ?
                    "" :
                    `<button class="btn-danger delete-superadmin-btn" data-id="${escapeHtml(admin.id)}" data-name="${escapeHtml(admin.full_name)}">Delete</button>`;

            row.innerHTML = `
                <td style="padding:10px 4px;">${escapeHtml(admin.full_name)}${founderBadge}</td>
                <td style="padding:10px 4px;">${escapeHtml(admin.email)}</td>
                <td style="padding:10px 4px; color:var(--text-secondary);">${addedDate}</td>
                <td style="padding:10px 4px; text-align:right;">${deleteHtml}</td>
            `;

            tbody.appendChild(row);


            // Card (phones)

            const card =
                document.createElement("div");

            card.className =
                "teacher-card";

            card.innerHTML = `
                <div class="teacher-card-header">
                    <div>
                        <div class="teacher-card-name">${escapeHtml(admin.full_name)}${founderBadge}</div>
                    </div>
                </div>
                <div class="teacher-card-body">
                    <div><span class="teacher-card-label">Email:</span><span style="overflow-wrap:anywhere;">${escapeHtml(admin.email)}</span></div>
                    <div><span class="teacher-card-label">Added:</span>${addedDate}</div>
                </div>
                ${deleteHtml ? `<div class="teacher-card-actions">${deleteHtml}</div>` : ""}
            `;

            cardsMount.appendChild(card);

        }
    );

    document.querySelectorAll(".delete-superadmin-btn").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => deleteSuperadmin(btn.dataset.id, btn.dataset.name)
            );

        }
    );

}


async function deleteSuperadmin(targetId, targetName) {

    const confirmed =
        await showConfirmModal(
            "Delete this superadmin?",
            `Remove ${targetName}'s superadmin access? This deletes their account entirely and can't be undone.`
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
                "delete-platform-admin",
                { body: { targetId } }
            );

        if (invokeError) {

            throw new Error(await extractFunctionError(invokeError));

        }

        if (data && data.error) {

            throw new Error(data.error);

        }

        showToast(`${targetName} was removed.`);

        await loadSuperadmins();

    }

    catch (error) {

        showToast(
            error.message ||
            "Unable to remove this superadmin."
        );

    }

}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

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


async function submitAddSuperadmin() {

    const errorEl =
        document.getElementById("addSuperadminError");

    const submitBtn =
        document.getElementById("submitAddSuperadmin");

    const fullName =
        document.getElementById("newAdminName").value.trim();

    const email =
        document.getElementById("newAdminEmail").value.trim();


    errorEl.style.display =
        "none";

    if (!fullName || !email) {

        errorEl.textContent =
            "Please fill in both fields.";

        errorEl.style.display =
            "block";

        return;

    }


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
                "create-platform-admin",
                { body: { email, fullName } }
            );

        if (invokeError) {

            throw new Error(await extractFunctionError(invokeError));

        }

        if (data && data.error) {

            throw new Error(data.error);

        }


        document.getElementById("addSuperadminResultText").textContent =
            `Share these details with ${fullName}. This password won't be shown again — they should change it and rely on their email for recovery going forward.`;

        document.getElementById("newAdminEmailResult").textContent =
            data.credentials.email;

        document.getElementById("newAdminPasswordResult").textContent =
            data.credentials.password;


        document.getElementById("addSuperadminForm").style.display =
            "none";

        document.getElementById("addSuperadminResult").style.display =
            "block";

    }

    catch (error) {

        errorEl.textContent =
            error.message ||
            "Unable to add this superadmin.";

        errorEl.style.display =
            "block";

    }

    finally {

        submitBtn.disabled =
            false;

        submitBtn.textContent =
            "Add superadmin";

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