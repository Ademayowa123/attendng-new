/*************************************************
 * FORGOT-PASSWORD.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("requestLinkForm").addEventListener(
        "submit",
        handleRequestLink
    );

});


async function handleRequestLink(event) {

    event.preventDefault();

    const errorEl =
        document.getElementById("requestError");

    const submitBtn =
        document.getElementById("requestSubmit");

    errorEl.style.display =
        "none";

    const email =
        document.getElementById("email").value.trim().toLowerCase();


    submitBtn.disabled =
        true;

    submitBtn.textContent =
        "Sending…";


    try {

        // The redirect target must be added to Supabase's
        // Redirect URL allow-list (Authentication -> URL
        // Configuration) or the link won't work.

        const redirectTo =
            `${window.location.origin}/platform/reset-callback.html`;

        const {
            error

        } =
            await supabaseClient.auth.resetPasswordForEmail(
                email,
                { redirectTo }
            );

        if (error) {

            throw error;

        }

        document.getElementById("requestLinkForm").style.display =
            "none";

        document.getElementById("linkSentNotice").style.display =
            "block";

    }

    catch (error) {

        // Deliberately generic — don't reveal whether the
        // email exists in the system either way.

        document.getElementById("requestLinkForm").style.display =
            "none";

        document.getElementById("linkSentNotice").style.display =
            "block";

    }

    finally {

        submitBtn.disabled =
            false;

        submitBtn.textContent =
            "Send reset link";

    }

}