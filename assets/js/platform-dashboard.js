/*************************************************
 * PLATFORM-DASHBOARD.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", () => {

    const form =
        document.getElementById("onboardForm");

    if (!form) {

        return;

    }


    const errorEl =
        document.getElementById("onboardError");

    const submitBtn =
        document.getElementById("onboardSubmit");

    const resultBox =
        document.getElementById("onboardResult");

    const resultText =
        document.getElementById("onboardResultText");

    const resultUsername =
        document.getElementById("resultUsername");

    const resultPassword =
        document.getElementById("resultPassword");

    const onboardAnotherBtn =
        document.getElementById("onboardAnother");


    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            errorEl.style.display =
                "none";

            submitBtn.disabled =
                true;

            submitBtn.textContent =
                "Creating…";


            try {

                const schoolName =
                    document.getElementById("schoolName").value;


                const {
                    data,
                    error: invokeError

                } =
                    await supabaseClient.functions.invoke(
                        "onboard-school",
                        {
                            body: {
                                schoolName
                            }
                        }
                    );


                if (invokeError) {

                    throw new Error(await extractFunctionError(invokeError));

                }

                if (data && data.error) {

                    throw new Error(data.error);

                }


                resultText.textContent =
                    `"${data.school.name}" was created. Share these details with the school — this password won't be shown again.`;

                resultUsername.textContent =
                    data.credentials.username;

                resultPassword.textContent =
                    data.credentials.password;


                form.style.display =
                    "none";

                resultBox.style.display =
                    "block";

            }

            catch (error) {

                console.error(
                    "Onboarding failed:",
                    error
                );

                errorEl.textContent =
                    error.message ||
                    "Something went wrong onboarding this school.";

                errorEl.style.display =
                    "block";

            }

            finally {

                submitBtn.disabled =
                    false;

                submitBtn.textContent =
                    "Onboard school";

            }

        }
    );


    onboardAnotherBtn.addEventListener(
        "click",
        () => {

            form.reset();

            form.style.display =
                "flex";

            resultBox.style.display =
                "none";

        }
    );

});


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