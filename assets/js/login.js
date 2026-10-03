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

            setLoginButtonState("loading");


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


                // Both steps worked: confirm it on the button and in a
                // short message, then go. The pause is just long enough
                // to read it; the overlay stays up until the page changes
                // so the login form never flashes back.

                setLoginButtonState("success");

                showLoginSuccess();

                await new Promise(
                    resolve => setTimeout(resolve, LOGIN_SUCCESS_VISIBLE_MS)
                );

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

                hideLoginSuccess();

                setLoginButtonState("idle");

            }

        }
    );


    // Back button after logging in: the browser can restore this page
    // exactly as it was left (button stuck on "Login Successful").
    // Put it back to a normal form.

    window.addEventListener(
        "pageshow",
        (event) => {

            if (event.persisted) {

                hideLoginSuccess();

                setLoginButtonState("idle");

            }

        }
    );

});


const LOGIN_SUCCESS_VISIBLE_MS = 1100;


/*
 * The login button has three looks:
 *   idle    -> "Log in"
 *   loading -> spinner + "Logging in…"
 *   success -> check + "Login Successful"
 */
function setLoginButtonState(state) {

    const button =
        document.getElementById("loginSubmit");

    button.classList.remove("is-loading", "is-success");

    if (state === "loading") {

        button.disabled = true;
        button.classList.add("is-loading");
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Logging in…`;

    }
    else if (state === "success") {

        button.disabled = true;
        button.classList.add("is-success");
        button.innerHTML = `<i class="fa-solid fa-circle-check"></i> Login Successful`;

    }
    else {

        button.disabled = false;
        button.textContent = "Log in";

    }

}


function showLoginSuccess() {

    document.getElementById("loginSuccess").hidden =
        false;

}


function hideLoginSuccess() {

    document.getElementById("loginSuccess").hidden =
        true;

}


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