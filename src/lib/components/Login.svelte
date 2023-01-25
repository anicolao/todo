<script>
	console.log('Login.svelte');
	import { error } from '$lib/components/auth';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import Button, { Label } from '@smui/button';
	import { signInWithPopup, signOut } from 'firebase/auth';

	const auth = firebase.auth;
	const gAuthProvider = firebase.google_auth_provider;

	function signin() {
		signInWithPopup(auth, gAuthProvider).catch((message) => {
			store.dispatch(error(message));
		});
	}
	function signout() {
		console.log('before sign out: ', $store.lists.visibleLists);
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
