/*************************************************
 * LOGIN.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", () => {


    // If already logged in, skip straight to the right
    // section instead of showing the login form again.

    redirectIfAlreadyLoggedIn();


    // =====================================
    // SHOW / HIDE PASSWORD
    // =====================================

    const passwordInput =
        document.getElementById("password");

    const toggleBtn =
        document.getElementById("togglePassword");

    toggleBtn.addEventListener(
        "click",
        () => {

            const isHidden =
                passwordInput.type === "password";

            passwordInput.type =
                isHidden ? "text" : "password";

            toggleBtn.innerHTML =
                isHidden ?
                    `<i class="fa-solid fa-eye-slash"></i>` :
                    `<i class="fa-solid fa-eye"></i>`;

            toggleBtn.setAttribute(
                "aria-label",
                isHidden ? "Hide password" : "Show password"
            );

        }
    );


    const form =
        document.getElementById("loginForm");

    const errorEl =
        document.getElementById("loginError");

    const submitBtn =
        document.getElementById("loginSubmit");


    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            errorEl.style.display =
                "none";

            submitBtn.disabled =
                true;

            submitBtn.textContent =
                "Logging in…";


            try {

                const identifier =
                    document.getElementById("identifier").value;

                const password =
                    document.getElementById("password").value;

                const email =
                    resolveLoginIdentifier(identifier);


                const {
                    error: signInError

                } =
                    await supabaseClient.auth.signInWithPassword({
                        email,
                        password
                    });


                if (signInError) {

                    throw signInError;

                }


                await loadAttendNGContext();

                routeToDashboard();

            }

            catch (error) {

                console.error(
                    "Login failed:",
                    error
                );

                errorEl.textContent =
                    "That username/email or password isn't right.";

                errorEl.style.display =
                    "block";

                submitBtn.disabled =
                    false;

                submitBtn.textContent =
                    "Log in";

            }

        }
    );

});


async function redirectIfAlreadyLoggedIn() {

    const {
        data: {
            session
        }

    } =
        await supabaseClient.auth.getSession();


    if (!session) {

        return;

    }


    try {

        await loadAttendNGContext();

        routeToDashboard();

    }

    catch (error) {

        // Stale/invalid session — fall through and let them
        // log in again normally.

        console.warn(
            "Existing session couldn't be resolved:",
            error
        );

    }

}


function routeToDashboard() {

    if (AttendNGContext.tier === "platform") {

        window.location.href =
            "/platform/dashboard.html";

    }
    else {

        window.location.href =
            "/school/dashboard.html";

    }

}