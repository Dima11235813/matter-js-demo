/**
 * Sign-in, behind a provider-agnostic interface (Epic 6 · Task 6.4.1.1): the rest of the app never
 * imports Firebase, so the provider can change (our data is keyed by our own user id on the server).
 */
export interface AuthUser {
    uid: string;
    email?: string;
    displayName?: string;
    provider: "google" | "dev";
}

export interface AuthService {
    readonly provider: AuthUser["provider"];
    currentUser(): AuthUser | undefined;
    /** Calls back now and on every sign-in / sign-out. Returns an unsubscribe function. */
    onChange(listener: (user: AuthUser | undefined) => void): () => void;
    signIn(): Promise<void>;
    signOut(): Promise<void>;
    /** A fresh ID token for API calls (refreshed by the provider when needed). */
    getToken(): Promise<string | undefined>;
}

export interface FirebaseWebConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
}

/** The Firebase web config from the build, or undefined when sign-in isn't configured. */
export function firebaseConfigFromEnv(env: Record<string, string | undefined> = import.meta.env): FirebaseWebConfig | undefined {
    const config = {
        apiKey: env.VITE_FIREBASE_API_KEY ?? "",
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
        projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
        appId: env.VITE_FIREBASE_APP_ID ?? "",
    };
    return Object.values(config).every(Boolean) ? config : undefined;
}

/** Google sign-in via Firebase Auth (popup flow). The SDK is loaded only when this is created. */
export async function createFirebaseAuth(config: FirebaseWebConfig): Promise<AuthService> {
    const [{ initializeApp }, auth] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
    const firebaseAuth = auth.getAuth(initializeApp(config));
    const toUser = (u: import("firebase/auth").User | null): AuthUser | undefined =>
        u ? { uid: u.uid, email: u.email ?? undefined, displayName: u.displayName ?? undefined, provider: "google" } : undefined;
    return {
        provider: "google",
        currentUser: () => toUser(firebaseAuth.currentUser),
        onChange: listener => auth.onAuthStateChanged(firebaseAuth, u => listener(toUser(u))),
        async signIn() {
            const provider = new auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: "select_account" });
            await auth.signInWithPopup(firebaseAuth, provider);
        },
        signOut: () => auth.signOut(firebaseAuth),
        getToken: async () => firebaseAuth.currentUser?.getIdToken() ?? undefined,
    };
}

/**
 * Dev and e2e builds only: test personas signed in with tokens from the local API (dev sign-in is on by
 * default for local servers). Offered in the dev UI and the dev handle; production builds never use it.
 */
export function createDevAuth(subject: string): AuthService {
    let user: AuthUser | undefined;
    // A fresh token per call: the local API picks a new random dev secret on every restart (tsx watch).
    const mint = async (): Promise<string> => {
        const response = await fetch("/api/v1/dev/token", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subject }),
        });
        if (!response.ok) throw new Error(`Dev sign-in failed (${response.status}): is the local API running (yarn dev:server)?`);
        return (await response.json()).token;
    };
    const listeners = new Set<(user: AuthUser | undefined) => void>();
    const emit = () => listeners.forEach(l => l(user));
    return {
        provider: "dev",
        currentUser: () => user,
        onChange(listener) {
            listeners.add(listener);
            // Like Firebase, report only a known state: before signIn() finishes there is nothing to report
            // (reporting "signed out" here would bounce a persona's reload back to the guest database).
            if (user) listener(user);
            return () => listeners.delete(listener);
        },
        async signIn() {
            await mint(); // fails loudly if the local API has no dev sign-in
            user = { uid: `dev:${subject}`, displayName: subject, provider: "dev" };
            emit();
        },
        async signOut() {
            user = undefined;
            emit();
        },
        getToken: async () => (user ? mint() : undefined),
    };
}
