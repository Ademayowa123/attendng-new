/*************************************************
 * ADMIN-SETTINGS.JS
 *************************************************/

// Last saved values. The bar at the bottom shows only
// while the form differs from these.

let savedSettings = { name: "", address: "", phone: "" };

let logoUrl = "";

let settingsBusy = false;


document.addEventListener("DOMContentLoaded", async () => {

    await waitForContext();

    savedSettings.name =
        AttendNGContext.schoolName || "";

    document.getElementById("schoolNameInput").value =
        savedSettings.name;

    logoUrl =
        AttendNGContext.schoolLogoUrl || "";

    renderPreview();

    await loadContactDetails();

    document.getElementById("settingsForm").addEventListener(
        "submit",
        handleSettingsSave
    );

    ["schoolNameInput", "schoolAddressInput", "schoolPhoneInput"].forEach(
        id => document.getElementById(id).addEventListener(
            "input",
            renderPreview
        )
    );

    document.getElementById("discardBtn").addEventListener(
        "click",
        discardChanges
    );

    document.getElementById("chooseLogoBtn").addEventListener(
        "click",
        () => document.getElementById("logoFile").click()
    );

    document.getElementById("logoFile").addEventListener(
        "change",
        handleLogoUpload
    );

    // Warn before leaving with edits that haven't been saved.

    window.addEventListener(
        "beforeunload",
        (event) => {

            if (isDirty()) {

                event.preventDefault();

                event.returnValue = "";

            }

        }
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
 * FORM STATE
 *************************************************/

function currentValues() {

    return {
        name: document.getElementById("schoolNameInput").value.trim(),
        address: document.getElementById("schoolAddressInput").value.trim(),
        phone: document.getElementById("schoolPhoneInput").value.trim()
    };

}


function isDirty() {

    const now =
        currentValues();

    return now.name !== savedSettings.name ||
        now.address !== savedSettings.address ||
        now.phone !== savedSettings.phone;

}


function initialsOf(name) {

    const words =
        name.trim().split(/\s+/).filter(Boolean);

    return (
        (words[0] ? words[0][0] : "?") +
        (words[1] ? words[1][0] : "")
    ).toUpperCase();

}


// Keeps the logo tile, the report card preview and the
// unsaved-changes bar in step with what is typed.

function renderPreview() {

    const values =
        currentValues();

    const initials =
        initialsOf(values.name || "School");

    document.getElementById("logoInitials").textContent =
        initials;

    // Logo tile: the uploaded logo if there is one, else initials.

    const img =
        document.getElementById("logoPreview");

    if (logoUrl) {

        img.src = logoUrl;

        img.hidden = false;

        document.getElementById("logoInitials").hidden = true;

    }
    else {

        img.hidden = true;

        document.getElementById("logoInitials").hidden = false;

    }

    const previewLogo =
        document.getElementById("previewLogo");

    previewLogo.innerHTML =
        "";

    if (logoUrl) {

        const small =
            document.createElement("img");

        small.src = logoUrl;

        small.alt = "";

        previewLogo.appendChild(small);

        previewLogo.classList.add("has-logo");

    }
    else {

        previewLogo.textContent = initials;

        previewLogo.classList.remove("has-logo");

    }

    document.getElementById("previewName").textContent =
        values.name || "School name";

    document.getElementById("previewAddress").textContent =
        values.address || "Address";

    document.getElementById("previewPhone").textContent =
        "Tel: " + (values.phone || "phone number");

    document.getElementById("saveBar").hidden =
        !isDirty();

}


function discardChanges() {

    document.getElementById("schoolNameInput").value =
        savedSettings.name;

    document.getElementById("schoolAddressInput").value =
        savedSettings.address;

    document.getElementById("schoolPhoneInput").value =
        savedSettings.phone;

    document.getElementById("saveError").style.display =
        "none";

    renderPreview();

}


/*************************************************
 * LOAD + SAVE
 *************************************************/

async function loadContactDetails() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("schools")
            .select("address, phone")
            .eq("id", AttendNGContext.schoolId)
            .maybeSingle();

    if (error) {

        console.error(
            "Unable to load school address and phone:",
            error
        );

        return;

    }

    if (data) {

        savedSettings.address =
            (data.address || "").trim();

        savedSettings.phone =
            (data.phone || "").trim();

        document.getElementById("schoolAddressInput").value =
            savedSettings.address;

        document.getElementById("schoolPhoneInput").value =
            savedSettings.phone;

    }

    renderPreview();

}


// One save for the name, address and phone together.

async function handleSettingsSave(event) {

    event.preventDefault();

    if (settingsBusy) {

        return;

    }

    const errorEl =
        document.getElementById("saveError");

    errorEl.style.display =
        "none";

    const values =
        currentValues();

    if (!values.name) {

        errorEl.textContent =
            "School name can't be empty.";

        errorEl.style.display =
            "block";

        return;

    }

    const saveBtn =
        document.getElementById("saveBtn");

    settingsBusy =
        true;

    saveBtn.disabled =
        true;

    saveBtn.textContent =
        "Saving…";


    const {
        error
    } =
        await supabaseClient
            .from("schools")
            .update({
                name: values.name,
                address: values.address || null,
                phone: values.phone || null
            })
            .eq("id", AttendNGContext.schoolId);


    settingsBusy =
        false;

    saveBtn.disabled =
        false;

    saveBtn.textContent =
        "Save changes";


    if (error) {

        errorEl.textContent =
            error.message ||
            "Unable to save your changes.";

        errorEl.style.display =
            "block";

        return;

    }

    savedSettings =
        { ...values };

    AttendNGContext.schoolName =
        values.name;

    renderPreview();

    showToast("Settings saved.");

}


/*************************************************
 * LOGO
 *************************************************/

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


        logoUrl =
            cacheBustedUrl;

        AttendNGContext.schoolLogoUrl =
            cacheBustedUrl;

        renderPreview();

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