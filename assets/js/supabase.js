/*************************************************
 * SUPABASE.JS
 * Client setup + login identifier resolution
 *************************************************/

const SUPABASE_URL = "https://usrrmnixcaohxihzkwas.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_AS_-ep5JU7SWh-9kT6PREw_tI3QN9ux";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

/*
 * The internal domain suffix appended to usernames (school
 * genesis accounts, admins, teachers) before they're sent to
 * Supabase Auth, since Auth requires an email-shaped
 * identifier even though these accounts have no real inbox.
 *
 * Must match USERNAME_AUTH_DOMAIN set as a secret on the
 * onboard-school and create-teacher Edge Functions.
 */
const USERNAME_AUTH_DOMAIN = "login.attendng.internal";

/*
 * Accepts either:
 *  - a real email (platform admins) -> sent as-is
 *  - a username (schools/admins/teachers) -> no "@", so we
 *    append the invisible internal domain first.
 */
function resolveLoginIdentifier(rawInput) {

    const trimmed =
        rawInput.trim();

    if (trimmed.includes("@")) {

        return trimmed.toLowerCase();

    }

    return `${trimmed.toLowerCase()}@${USERNAME_AUTH_DOMAIN}`;

}
