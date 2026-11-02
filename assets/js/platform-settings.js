/*************************************************
 * PLATFORM-SETTINGS.JS
 *************************************************/

let passwordChangeBusy = false;


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    document.getElementById("fullNameInput").value =
        AttendNGContext.fullName || "";

    document.getElementById("emailDisplay").value =
        AttendNGContext.email || "";

    renderProfile();

    setupPasswordToggles();

    setupPasswordHelpers();

    setupPasswordModal();

    document.getElementById("nameForm").addEventListener(
        "submit",
        handleNameSave
    );

    document.getElementById("passwordForm").addEventListener(
        "submit",
        handlePasswordSubmit
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


/*************************************************
 * PROFILE HEADER
 *************************************************/

function renderProfile() {

    const name =
        (AttendNGContext.fullName || "").trim();

    const words =
        name.split(/\s+/).filter(Boolean);

    document.getElementById("settingsAvatar").textContent =
        words.length ?
            (words[0][0] + (words[1] ? words[1][0] : "")).toUpperCase() :
            "?";

    document.getElementById("profileName").textContent =
        name || "Superadmin";

    document.getElementById("profileEmail").textContent =
        AttendNGContext.email || "";

}


/*************************************************
 * PASSWORD FIELD HELPERS
 *************************************************/

function setupPasswordToggles() {

    document.querySelectorAll(".password-toggle").forEach(
        btn => {

            btn.addEventListener(
                "click",
                () => {

                    const input =
                        document.getElementById(btn.dataset.target);

                    const isHidden =
                        input.type === "password";

                    input.type =
                        isHidden ? "text" : "password";

                    btn.innerHTML =
                        isHidden ?
                            `<i class="fa-solid fa-eye-slash"></i>` :
                            `<i class="fa-solid fa-eye"></i>`;

                }
            );

        }
    );

}


// Live strength meter and checklist under the new password.

function setupPasswordHelpers() {

    const newInput =
        document.getElementById("newPassword");

    const confirmInput =
        document.getElementById("confirmPassword");

    const colors =
        ["#dc2626", "#d97706", "#65a30d", "#0f766e"];

    const labels =
        ["Weak", "Fair", "Good", "Strong"];


    function setRule(id, ok) {

        const row =
            document.getElementById(id);

        row.classList.toggle("ok", ok);

        row.querySelector("i").className =
            ok ? "fa-solid fa-circle-check" : "fa-regular fa-circle";

    }


    function update() {

        const value =
            newInput.value;

        let score =
            0;

        if (value.length >= 6) { score++; }

        if (value.length >= 10) { score++; }

        if (/[A-Z]/.test(value) && /[a-z]/.test(value)) { score++; }

        if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) { score++; }

        if (!value) { score = 0; }

        document.querySelectorAll(".set-meter span").forEach(
            (bar, index) => {

                bar.style.background =
                    index < score ? colors[score - 1] : "";

            }
        );

        document.getElementById("strengthLabel").textContent =
            value ?
                `Strength: ${labels[Math.max(score, 1) - 1]}` :
                "Strength: enter a password";

        setRule("ruleLength", value.length >= 6);

        setRule(
            "ruleMatch",
            value.length > 0 && value === confirmInput.value
        );

    }

    newInput.addEventListener("input", update);

    confirmInput.addEventListener("input", update);

    window.resetPasswordHelpers = update;

}


/*************************************************
 * NAME
 *************************************************/

async function handleNameSave(event) {

    event.preventDefault();

    const errorEl =
        document.getElementById("nameError");

    errorEl.style.display =
        "none";

    const newName =
        document.getElementById("fullNameInput").value.trim();

    if (!newName) {

        errorEl.textContent =
            "Name can't be empty.";

        errorEl.style.display =
            "block";

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("platform_admins")
            .update({ full_name: newName.toUpperCase() })
            .eq("id", AttendNGContext.platformAdminId);


    if (error) {

        errorEl.textContent =
            error.message ||
            "Unable to update your name.";

        errorEl.style.display =
            "block";

        return;

    }

    AttendNGContext.fullName =
        newName.toUpperCase();

    document.getElementById("fullNameInput").value =
        newName.toUpperCase();

    renderProfile();

    showToast("Details saved");

}


/*************************************************
 * PASSWORD: VALIDATE, CONFIRM, THEN UPDATE
 *************************************************/

function handlePasswordSubmit(event) {

    event.preventDefault();

    const errorEl =
        document.getElementById("passwordError");

    errorEl.style.display =
        "none";

    const currentPassword =
        document.getElementById("currentPassword").value;

    const newPassword =
        document.getElementById("newPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;

    if (newPassword !== confirmPassword) {

        showPasswordError("New passwords don't match.");

        return;

    }

    if (newPassword === currentPassword) {

        showPasswordError("Choose a password different from your current one.");

        return;

    }

    openPasswordModal();

}


function showPasswordError(message) {

    const errorEl =
        document.getElementById("passwordError");

    errorEl.textContent =
        message;

    errorEl.style.display =
        "block";

}


function openPasswordModal() {

    document.getElementById("confirmPasswordModal").style.display =
        "flex";

    document.getElementById("confirmPasswordChange").focus();

}


function closePasswordModal() {

    if (passwordChangeBusy) {

        return;

    }

    document.getElementById("confirmPasswordModal").style.display =
        "none";

}


function setupPasswordModal() {

    const modal =
        document.getElementById("confirmPasswordModal");

    document.getElementById("cancelPasswordChange").addEventListener(
        "click",
        closePasswordModal
    );

    document.getElementById("confirmPasswordChange").addEventListener(
        "click",
        performPasswordChange
    );

    modal.addEventListener(
        "click",
        (event) => {

            if (event.target === modal) {

                closePasswordModal();

            }

        }
    );

    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape") {

                closePasswordModal();

            }

        }
    );

}


async function performPasswordChange() {

    const confirmBtn =
        document.getElementById("confirmPasswordChange");

    const currentPassword =
        document.getElementById("currentPassword").value;

    const newPassword =
        document.getElementById("newPassword").value;

    passwordChangeBusy =
        true;

    confirmBtn.disabled =
        true;

    confirmBtn.textContent =
        "Updating…";


    try {

        // Re-authenticate with the current password before
        // allowing the change — same reasoning as the school
        // member Settings page: an already-unlocked device
        // shouldn't be enough on its own.

        const {
            error: reauthError

        } =
            await supabaseClient.auth.signInWithPassword({
                email: AttendNGContext.email,
                password: currentPassword
            });

        if (reauthError) {

            throw new Error("Current password is incorrect.");

        }


        const {
            error: updateError

        } =
            await supabaseClient.auth.updateUser({
                password: newPassword
            });

        if (updateError) {

            throw updateError;

        }


        passwordChangeBusy =
            false;

        closePasswordModal();

        document.getElementById("passwordForm").reset();

        window.resetPasswordHelpers();

        showToast("Password updated");

    }

    catch (error) {

        passwordChangeBusy =
            false;

        closePasswordModal();

        showPasswordError(
            error.message ||
            "Unable to update password."
        );

    }

    finally {

        passwordChangeBusy =
            false;

        confirmBtn.disabled =
            false;

        confirmBtn.textContent =
            "Update password";

    }

}


/*************************************************
 * TOAST
 *************************************************/

let toastTimer = null;

function showToast(message) {

    let toast =
        document.getElementById("toast");

    if (!toast) {

        toast =
            document.createElement("div");

        toast.id =
            "toast";

        toast.className =
            "toast";

        document.body.appendChild(toast);

    }

    toast.textContent =
        message;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer =
        setTimeout(
            () => toast.classList.remove("show"),
            3000
        );

}