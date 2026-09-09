<script lang="ts">
	console.log('Login.svelte');
	import { error } from '$lib/components/auth';
	import { signInWithNativeGoogle } from '$lib/auth/google';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import Button, { Label } from '@smui/button';

	import {
		getAuth,
		signOut,
		signInWithEmailAndPassword,
		createUserWithEmailAndPassword,
		updateProfile
	} from 'firebase/auth';

	const testLoginEmail = import.meta.env.VITE_TEST_LOGIN_EMAIL || 'test@example.com';
	const testLoginPassword = import.meta.env.VITE_TEST_LOGIN_PASSWORD || 'password';
	const testLoginName = import.meta.env.VITE_TEST_LOGIN_NAME || 'Test User';
	const testLoginPhoto =
		import.meta.env.VITE_TEST_LOGIN_PHOTO ??
		`https://i.pravatar.cc/150?u=${encodeURIComponent(testLoginEmail)}`;

	const signInWithGoogle = async () => {
		await signInWithNativeGoogle(firebase.auth);
	};

	async function testSignIn() {
		const auth = getAuth();
		try {
			await signInWithEmailAndPassword(auth, testLoginEmail, testLoginPassword);
		} catch (e: any) {
			console.log('testSignIn catch', e.code);
			if (
				e.code === 'auth/user-not-found' ||
				e.code === 'auth/invalid-login-credentials' ||
				e.code === 'auth/invalid-credential'
			) {
				const userCredential = await createUserWithEmailAndPassword(
					auth,
					testLoginEmail,
					testLoginPassword
				);
				await updateProfile(userCredential.user, {
					displayName: testLoginName,
					photoURL: testLoginPhoto
				});
				// After updateProfile, we might need to trigger another state change or just wait.
				// But onAuthStateChanged should trigger eventually.
			} else {
				throw e;
			}
		}
	}

	function signin() {
		const useAuthEmulator =
			import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' ||
			import.meta.env.VITE_USE_AUTH_EMULATOR === 'true';
		const promise = useAuthEmulator ? testSignIn() : signInWithGoogle();

		promise
			.then(() => {
				console.log('signed in!');
			})
			.catch((message: unknown) => {
				store.dispatch(error(message instanceof Error ? message.message : String(message)));
			});
	}
	function signout() {
		console.log('before sign out: ', $store.lists.visibleLists);
		const auth = getAuth();
		signOut(auth).catch((message) => {
			store.dispatch(error(message));
		});
		console.log('after sign out: ', $store.lists.visibleLists);
	}
</script>

{#if $store.auth.signedIn !== true}
	<Button on:click={signin}>
		<Label>Sign In</Label>
		<i class="material-icons" aria-hidden="true">arrow_forward</i>
	</Button>
{:else}
	<img src={$store.auth.photo} referrerpolicy="no-referrer" alt="User avatar" />
	<p>{$store.auth.email}</p>
	<p>{$store.auth.name}</p>
	<Button on:click={signout}><Label>Sign Out</Label></Button>
{/if}
