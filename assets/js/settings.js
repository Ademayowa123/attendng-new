/*************************************************
 * SETTINGS.JS (personal — password + register info)
 *************************************************/

document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    fillRegisterInfo();

    setupPasswordToggles();

    document.getElementById("passwordForm").addEventListener(
        "submit",
        handlePasswordChange
    );

});


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

                    btn.setAttribute(
                        "aria-label",
                        isHidden ? "Hide password" : "Show password"
                    );

                }
            );

        }
    );

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


function fillRegisterInfo() {

    document.getElementById("infoSchool").textContent =
        AttendNGContext.schoolName || "—";

    document.getElementById("infoName").textContent =
        AttendNGContext.fullName || "—";

    document.getElementById("infoClass").textContent =
        AttendNGContext.className || "Not assigned";

    document.getElementById("infoSession").textContent =
        AttendNGContext.sessionName || "—";

    document.getElementById("infoTerm").textContent =
        AttendNGContext.currentTerm || "—";

    document.getElementById("infoStatus").innerHTML =
        AttendNGContext.classId ?
            (
                AttendNGContext.classIsFinalized ?
                    `<span class="badge badge-warning">Finalized</span>` :
                    `<span class="badge badge-success">Unlocked</span>`
            ) :
            `<span class="badge badge-muted">No class</span>`;

}


async function handlePasswordChange(event) {

    event.preventDefault();

    const errorEl =
        document.getElementById("passwordError");

    const successEl =
        document.getElementById("passwordSuccess");

    const submitBtn =
        document.getElementById("updatePasswordBtn");

    errorEl.style.display =
        "none";

    successEl.style.display =
        "none";


    const currentPassword =
        document.getElementById("currentPassword").value;

    const newPassword =
        document.getElementById("newPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;


    if (newPassword !== confirmPassword) {

        errorEl.textContent =
            "New passwords don't match.";

        errorEl.style.display =
            "block";

        return;

    }


    submitBtn.disabled =
        true;

    submitBtn.textContent =
        "Updating…";


    try {

        // Re-authenticate with the current password first —
        // Supabase's updateUser doesn't require this on its
        // own, but skipping it would mean anyone at an
        // already-unlocked device could change the password
        // without knowing the current one.

        const identifier =
            resolveLoginIdentifier(AttendNGContext.username);

        const {
            error: reauthError

        } =
            await supabaseClient.auth.signInWithPassword({
                email: identifier,
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


        successEl.style.display =
            "block";

        document.getElementById("passwordForm").reset();

    }

    catch (error) {

        errorEl.textContent =
            error.message ||
            "Unable to update password.";

        errorEl.style.display =
            "block";

    }

    finally {

        submitBtn.disabled =
            false;

        submitBtn.textContent =
            "Update password";

    }

}