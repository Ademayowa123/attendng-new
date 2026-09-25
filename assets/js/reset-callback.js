/*************************************************
 * RESET-CALLBACK.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", () => {

    // supabase-js automatically parses the recovery tokens out
    // of the URL on load (detectSessionInUrl defaults to true)
    // and fires PASSWORD_RECOVERY once that session is ready.
    // We give it a moment, then check directly rather than
    // relying solely on the event firing in time.

    supabaseClient.auth.onAuthStateChange(
        (event, session) => {

            if (event === "PASSWORD_RECOVERY" && session) {

                showPasswordForm();

            }

        }
    );

    setTimeout(
        checkForRecoverySession,
        800
    );


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

    document.getElementById("newPasswordForm").addEventListener(
        "submit",
        handleSetNewPassword
    );

});


async function checkForRecoverySession() {

    const {
        data: {
            session
        }

    } =
        await supabaseClient.auth.getSession();

    if (session) {

        showPasswordForm();

    }
    else {

        showInvalidLink();

    }

}


function showPasswordForm() {

    document.getElementById("loadingNotice").style.display =
        "none";

    document.getElementById("invalidLinkNotice").style.display =
        "none";

    document.getElementById("newPasswordForm").style.display =
        "flex";

    document.getElementById("newPasswordForm").style.flexDirection =
        "column";

    document.getElementById("newPasswordForm").style.gap =
        "0.75rem";

}


function showInvalidLink() {

    document.getElementById("loadingNotice").style.display =
        "none";

    document.getElementById("invalidLinkNotice").style.display =
        "block";

}


async function handleSetNewPassword(event) {

    event.preventDefault();

    const errorEl =
        document.getElementById("resetError");

    const submitBtn =
        document.getElementById("resetSubmit");

    errorEl.style.display =
        "none";


    const newPassword =
        document.getElementById("newPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;

    if (newPassword !== confirmPassword) {

        errorEl.textContent =
            "Passwords don't match.";

        errorEl.style.display =
            "block";

        return;

    }


    submitBtn.disabled =
        true;

    submitBtn.textContent =
        "Setting…";


    try {

        const {
            error

        } =
            await supabaseClient.auth.updateUser({
                password: newPassword
            });

        if (error) {

            throw error;

        }

        await supabaseClient.auth.signOut();

        window.location.href =
            "/login.html";

    }

    catch (error) {

        errorEl.textContent =
            error.message ||
            "Unable to set the new password.";

        errorEl.style.display =
            "block";

        submitBtn.disabled =
            false;

        submitBtn.textContent =
            "Set new password";

    }

}