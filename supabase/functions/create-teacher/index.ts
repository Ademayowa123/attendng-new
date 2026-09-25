// =========================================================
// Edge Function: create-teacher
// =========================================================
// Called by a logged-in school admin (genesis or promoted).
// Creates:
//   1. A Supabase Auth user for the teacher (username @
//      internal domain, no real email)
//   2. A `school_members` row, role: teacher, scoped to the
//      caller's own school, no class assigned yet
//
// Runs with the service-role key — same reasoning as
// onboard-school: creating auth users can't happen from
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
        // that whoever is asking is actually an admin of some school.
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

        const { data: callerMember, error: callerMemberError } = await adminClient
            .from("school_members")
            .select("id, school_id, role")
            .eq("user_id", user.id)
            .maybeSingle();

        if (callerMemberError) throw callerMemberError;

        if (!callerMember || callerMember.role !== "admin") {
            return jsonResponse(
                { error: "Only school admins can add teachers." },
                403
            );
        }

        // =====================================================
        // Parse input
        // =====================================================
        const { fullName } = await req.json();

        if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
            return jsonResponse({ error: "A full name is required." }, 400);
        }

        // =====================================================
        // Generate a globally-unique username: surname.firstname
        // (last word of the name, first word of the name), with
        // a numeric suffix if that's already taken by ANYONE in
        // the system — platform admins, other schools, etc.
        // =====================================================
        const baseUsername = usernameFromFullName(fullName.trim());
        const username = await findAvailableUsername(adminClient, baseUsername);
        const temporaryPassword = generateTemporaryPassword();

        // =====================================================
        // Create the auth user
        // =====================================================
        const { data: createdUser, error: createUserError } =
            await adminClient.auth.admin.createUser({
                email: `${username}@${AUTH_DOMAIN}`,
                password: temporaryPassword,
                email_confirm: true,
            });

        if (createUserError) throw createUserError;

        // =====================================================
        // Create the school_members row (teacher, unassigned)
        // =====================================================
        const { error: memberError } = await adminClient.from("school_members").insert({
            user_id: createdUser.user.id,
            school_id: callerMember.school_id,
            username,
            full_name: fullName.trim().toUpperCase(),
            role: "teacher",
            is_genesis: false,
        });

        if (memberError) {
            await adminClient.auth.admin.deleteUser(createdUser.user.id);
            throw memberError;
        }

        return jsonResponse({
            credentials: { username, password: temporaryPassword },
        });
    } catch (error) {
        console.error("create-teacher error:", error);
        return jsonResponse({ error: error.message ?? "Unexpected error." }, 500);
    }
});

// =========================================================
// Helpers
// =========================================================

function usernameFromFullName(fullName: string): string {
    const parts = fullName
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .trim()
        .split(/\s+/);

    if (parts.length === 1) {
        return parts[0];
    }

    const firstName = parts[0];
    const surname = parts[parts.length - 1];

    return `${surname}.${firstName}`;
}

async function findAvailableUsername(adminClient, base: string): Promise<string> {
    let candidate = base;
    let suffix = 1;

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