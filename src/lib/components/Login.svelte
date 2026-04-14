<script lang="ts">
	console.log('Login.svelte');
	import { error } from '$lib/components/auth';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import Button, { Label } from '@smui/button';

	import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
	import {
		getAuth,
		GoogleAuthProvider,
		signInWithCredential,
		signOut,
		signInWithEmailAndPassword,
		createUserWithEmailAndPassword,
		updateProfile
	} from 'firebase/auth';

	const signInWithGoogle = async () => {
		// 1. Create credentials on the native layer
		const result = await FirebaseAuthentication.signInWithGoogle({
			skipNativeAuth: true
		});
		// 2. Sign in on the web layer using the id token
		const credential = GoogleAuthProvider.credential(result.credential?.idToken);
		const auth = getAuth();
		console.log({ auth, credential });
		await signInWithCredential(auth, credential);
	};

	async function testSignIn() {
		const auth = getAuth();
		try {
			await signInWithEmailAndPassword(auth, 'test@example.com', 'password');
		} catch (e: any) {
			console.log('testSignIn catch', e.code);
			if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-login-credentials') {
				const userCredential = await createUserWithEmailAndPassword(auth, 'test@example.com', 'password');
				await updateProfile(userCredential.user, {
					displayName: 'Test User',
					photoURL: 'https://via.placeholder.com/150'
				});
				// After updateProfile, we might need to trigger another state change or just wait.
				// But onAuthStateChanged should trigger eventually.
			} else {
				throw e;
			}
		}
	}

	function signin() {
		signInWithGoogle()
			.then(() => {
				console.log('signed in!');
			})
			.catch((message) => {
				store.dispatch(error(message));
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
	{#if import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'}
		<Button on:click={testSignIn} id="test-signin">
			<Label>Test Sign In</Label>
		</Button>
	{/if}
{:else}
	<img src={$store.auth.photo} referrerpolicy="no-referrer" alt="User avatar" />
	<p>{$store.auth.email}</p>
	<p>{$store.auth.name}</p>
	<Button on:click={signout}><Label>Sign Out</Label></Button>
{/if}
