import { createRemoteJWKSet, decodeJwt, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

/**
 * Sign-in token verification. Production: Firebase ID tokens, checked against Google's public keys
 * (no service-account key needed). Dev and e2e only: HS256 tokens minted by this server when
 * DEV_AUTH_SECRET is set (config.ts refuses that in production).
 */
export interface Identity {
    issuer: string;
    subject: string;
}

export interface Verifier {
    verify(token: string): Promise<Identity>;
    /** Only with a dev secret configured: mints a 1-hour token for `subject`. */
    mintDevToken?(subject: string): Promise<string>;
}

export class AuthError extends Error {}

const GOOGLE_SECURETOKEN_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
export const DEV_ISSUER = "lexical-dev";

export interface VerifierOptions {
    firebaseProjectId?: string;
    devAuthSecret?: string;
    /** Tests inject a local key set; production fetches (and caches) Google's. */
    firebaseKeys?: JWTVerifyGetKey;
}

export function createVerifier({ firebaseProjectId, devAuthSecret, firebaseKeys }: VerifierOptions): Verifier {
    const googleKeys = firebaseProjectId ? firebaseKeys ?? createRemoteJWKSet(new URL(GOOGLE_SECURETOKEN_JWKS)) : undefined;
    const devKey = devAuthSecret ? new TextEncoder().encode(devAuthSecret) : undefined;

    return {
        async verify(token) {
            let issuer: string | undefined;
            try {
                issuer = decodeJwt(token).iss;
            } catch {
                throw new AuthError("Malformed token");
            }
            try {
                if (firebaseProjectId && googleKeys && issuer === `https://securetoken.google.com/${firebaseProjectId}`) {
                    const { payload } = await jwtVerify(token, googleKeys, { issuer, audience: firebaseProjectId, algorithms: ["RS256"] });
                    if (!payload.sub) throw new AuthError("Token has no subject");
                    return { issuer, subject: payload.sub };
                }
                if (devKey && issuer === DEV_ISSUER) {
                    const { payload } = await jwtVerify(token, devKey, { issuer: DEV_ISSUER, audience: DEV_ISSUER, algorithms: ["HS256"] });
                    if (!payload.sub) throw new AuthError("Token has no subject");
                    return { issuer: DEV_ISSUER, subject: payload.sub };
                }
            } catch (error) {
                if (error instanceof AuthError) throw error;
                throw new AuthError("Invalid or expired token");
            }
            throw new AuthError("Token issuer not accepted");
        },
        mintDevToken: devKey
            ? subject => new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuer(DEV_ISSUER).setAudience(DEV_ISSUER)
                .setSubject(subject).setIssuedAt().setExpirationTime("1h").sign(devKey)
            : undefined,
    };
}
