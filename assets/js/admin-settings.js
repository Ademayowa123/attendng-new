/*************************************************
 * ADMIN-SETTINGS.JS
 *************************************************/

document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    document.getElementById("schoolNameInput").value =
        AttendNGContext.schoolName || "";

    if (AttendNGContext.schoolLogoUrl) {

        document.getElementById("logoPreview").src =
            AttendNGContext.schoolLogoUrl;

    }


    document.getElementById("nameForm").addEventListener(
        "submit",
        handleNameSave
    );

    document.getElementById("chooseLogoBtn").addEventListener(
        "click",
        () => document.getElementById("logoFile").click()
    );

    document.getElementById("logoFile").addEventListener(
        "change",
        handleLogoUpload
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


async function handleNameSave(event) {

    event.preventDefault();

    const errorEl =
        document.getElementById("nameError");

    errorEl.style.display =
        "none";

    const newName =
        document.getElementById("schoolNameInput").value.trim();

    if (!newName) {

        errorEl.textContent =
            "School name can't be empty.";

        errorEl.style.display =
            "block";

        return;

    }


    const {
        error

    } =
        await supabaseClient
            .from("schools")
            .update({ name: newName })
            .eq("id", AttendNGContext.schoolId);


    if (error) {

        errorEl.textContent =
            error.message ||
            "Unable to update the school name.";

        errorEl.style.display =
            "block";

        return;

    }

    showToast("School name updated.");

}


async function handleLogoUpload(event) {

    const file =
        event.target.files[0];

    event.target.value =
        "";

    if (!file) {

        return;

    }

    const errorEl =
        document.getElementById("logoError");

    errorEl.style.display =
        "none";


    const extension =
        file.name.split(".").pop();

    const path =
        `${AttendNGContext.schoolId}/logo.${extension}`;


    try {

        const {
            error: uploadError

        } =
            await supabaseClient.storage
                .from("school-logos")
                .upload(path, file, { upsert: true });

        if (uploadError) {

            throw uploadError;

        }


        const {
            data: publicUrlData

        } =
            supabaseClient.storage
                .from("school-logos")
                .getPublicUrl(path);

        // Cache-bust so the browser doesn't keep showing a
        // previously cached logo at the same URL.

        const cacheBustedUrl =
            `${publicUrlData.publicUrl}?t=${Date.now()}`;


        const {
            error: updateError

        } =
            await supabaseClient
                .from("schools")
                .update({ logo_url: cacheBustedUrl })
                .eq("id", AttendNGContext.schoolId);

        if (updateError) {

            throw updateError;

        }


        document.getElementById("logoPreview").src =
            cacheBustedUrl;

        showToast("Logo updated.");

    }

    catch (error) {

        errorEl.textContent =
            error.message ||
            "Unable to upload the logo.";

        errorEl.style.display =
            "block";

    }

}


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

    setTimeout(
        () => toast.classList.remove("show"),
        2000
    );

}