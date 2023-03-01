<script>
	console.log('Login.svelte');
	import { error } from '$lib/components/auth';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import Button, { Label } from '@smui/button';

	import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
	import { getAuth, GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';

	const signInWithGoogle = async () => {
		// 1. Create credentials on the native layer
		const result = await FirebaseAuthentication.signInWithGoogle({
			skipNativeAuth: false
		});
		// 2. Sign in on the web layer using the id token
		const credential = GoogleAuthProvider.credential(result.credential?.idToken);
		const auth = getAuth();
		console.log({ auth, credential });
		await signInWithCredential(auth, credential);
	};

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
{:else}
	<img src={$store.auth.photo} referrerpolicy="no-referrer" alt="User avatar" />
	<p>{$store.auth.email}</p>
	<p>{$store.auth.name}</p>
	<Button on:click={signout}><Label>Sign Out</Label></Button>
{/if}
