/*************************************************
 * PLATFORM-SETTINGS.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    document.getElementById("fullNameInput").value =
        AttendNGContext.fullName || "";

    document.getElementById("emailDisplay").value =
        AttendNGContext.email || "";


    setupPasswordToggles();

    document.getElementById("nameForm").addEventListener(
        "submit",
        handleNameSave
    );

    document.getElementById("passwordForm").addEventListener(
        "submit",
        handlePasswordChange
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

}


async function handlePasswordChange(event) {

    event.preventDefault();

    const errorEl =
        document.getElementById("passwordError");

    const successEl =
        document.getElementById("passwordSuccess");

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

}