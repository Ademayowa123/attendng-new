// =========================================================
// Edge Function: onboard-school
// =========================================================
// Called by a logged-in platform admin from the app.
// Creates:
//   1. A Supabase Auth user for the school's genesis account
//      (no real email — a generated username @ internal domain)
//   2. A `schools` row
//   3. A `school_members` row (role: admin, is_genesis: true)
//
// Runs with the service-role key, which is the only way to
// create auth users server-side — never expose that key to
// the browser.
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const AUTH_DOMAIN = Deno.env.get("USERNAME_AUTH_DOMAIN") ?? "login.attendng.internal";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return jsonResponse({ error: "Missing Authorization header." }, 401);
        }

        // Client scoped to the CALLER's own JWT — used only to verify
        // that whoever is asking is actually a platform admin.
        const callerClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: authHeader } } }
        );

        const {
            data: { user },
            error: callerError,
        } = await callerClient.auth.getUser();

        if (callerError || !user) {
            return jsonResponse({ error: "Not authenticated." }, 401);
        }

        // Admin client — service role, bypasses RLS, can create auth users.
        const adminClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { data: platformAdmin, error: platformAdminError } = await adminClient
            .from("platform_admins")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (platformAdminError) throw platformAdminError;

        if (!platformAdmin) {
            return jsonResponse(
                { error: "Only platform admins can onboard a school." },
                403
            );
        }

        // =====================================================
        // Parse input
        // =====================================================
        const { schoolName } = await req.json();

        if (!schoolName || typeof schoolName !== "string" || !schoolName.trim()) {
            return jsonResponse({ error: "A school name is required." }, 400);
        }

        // =====================================================
        // Generate a globally-unique genesis username from the
        // school name, e.g. "Honeyland College, Ipaja" ->
        // "honeyland.college.ipaja", with a numeric suffix if
        // that's already taken by any school/member in the system.
        // =====================================================
        const baseUsername = slugify(schoolName);
        const genesisUsername = await findAvailableUsername(adminClient, baseUsername);
        const temporaryPassword = generateTemporaryPassword();

        // =====================================================
        // Create the auth user
        // =====================================================
        const { data: createdUser, error: createUserError } =
            await adminClient.auth.admin.createUser({
                email: `${genesisUsername}@${AUTH_DOMAIN}`,
                password: temporaryPassword,
                email_confirm: true, // no real inbox to confirm from
            });

        if (createUserError) throw createUserError;

        // =====================================================
        // Create the school row
        // =====================================================
        const { data: school, error: schoolError } = await adminClient
            .from("schools")
            .insert({
                name: schoolName.trim(),
                genesis_username: genesisUsername,
                onboarded_by: platformAdmin.id,
            })
            .select("id, name")
            .single();

        if (schoolError) {
            // Roll back the auth user so we don't leave an orphan account
            // behind if the school row fails to insert.
            await adminClient.auth.admin.deleteUser(createdUser.user.id);
            throw schoolError;
        }

        // =====================================================
        // Create the genesis school_members row
        // =====================================================
        const { error: memberError } = await adminClient.from("school_members").insert({
            user_id: createdUser.user.id,
            school_id: school.id,
            username: genesisUsername,
            full_name: `${schoolName.trim()} (Genesis Account)`,
            role: "admin",
            is_genesis: true,
        });

        if (memberError) {
            await adminClient.auth.admin.deleteUser(createdUser.user.id);
            await adminClient.from("schools").delete().eq("id", school.id);
            throw memberError;
        }

        return jsonResponse({
            school: { id: school.id, name: school.name },
            credentials: {
                username: genesisUsername,
                password: temporaryPassword,
            },
        });
    } catch (error) {
        console.error("onboard-school error:", error);
        return jsonResponse({ error: error.message ?? "Unexpected error." }, 500);
    }
});

// =========================================================
// Helpers
// =========================================================

function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .replace(/\.{2,}/g, ".");
}

async function findAvailableUsername(adminClient, base: string): Promise<string> {
    let candidate = base;
    let suffix = 1;

    // Usernames must be unique across BOTH schools.genesis_username and
    // school_members.username, since they share the same Auth email
    // namespace underneath.
    while (await usernameTaken(adminClient, candidate)) {
        suffix += 1;
        candidate = `${base}${suffix}`;
    }

    return candidate;
}

async function usernameTaken(adminClient, candidate: string): Promise<boolean> {
    const [{ data: schoolMatch }, { data: memberMatch }] = await Promise.all([
        adminClient
            .from("schools")
            .select("id")
            .eq("genesis_username", candidate)
            .maybeSingle(),
        adminClient
            .from("school_members")
            .select("id")
            .eq("username", candidate)
            .maybeSingle(),
    ]);

    return Boolean(schoolMatch || memberMatch);
}

function generateTemporaryPassword(): string {
    // Avoids visually ambiguous characters (0/O, 1/l/I) since this is
    // meant to be read off a screen and typed/handed over once.
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let result = "";
    const randomValues = new Uint32Array(10);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < 10; i++) {
        result += chars[randomValues[i] % chars.length];
    }
    return result;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}