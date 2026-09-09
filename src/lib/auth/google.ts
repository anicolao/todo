import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { GoogleAuthProvider, signInWithCredential, type Auth } from 'firebase/auth';

export interface NativeGoogleAuthentication {
	signInWithGoogle(options: { skipNativeAuth: true }): Promise<{
		credential?: { idToken?: string | null } | null;
	}>;
}

export function requireGoogleIdToken(result: {
	credential?: { idToken?: string | null } | null;
}): string {
	const idToken = result.credential?.idToken?.trim();
	if (!idToken) {
		throw new Error(
			'Google sign-in completed without an ID token. Verify the iOS Firebase client configuration.'
		);
	}
	return idToken;
}

export async function signInWithNativeGoogle(
	auth: Auth,
	nativeAuthentication: NativeGoogleAuthentication = FirebaseAuthentication
): Promise<void> {
	const result = await nativeAuthentication.signInWithGoogle({ skipNativeAuth: true });
	const credential = GoogleAuthProvider.credential(requireGoogleIdToken(result));
	await signInWithCredential(auth, credential);
}
