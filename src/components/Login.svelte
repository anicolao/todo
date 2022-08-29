<script>
	import firebase from '../firebase';
	import { store } from '../store';

	const auth = firebase.auth;
	const gAuthProvider = firebase.google_auth_provider;
	import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
	import { error, signed_in, signed_out } from './auth';
	onAuthStateChanged(auth, (user) => {
		if (user) {
			const uid = user.uid;
			store.dispatch(
				signed_in({
					name: user.displayName,
					email: user.email,
					photo: user.photoURL,
					signedIn: true,
					authMessage: ''
				})
			);
			// ...
		} else {
            store.dispatch(signed_out());
		}
	});

	function signin() {
		signInWithPopup(auth, gAuthProvider).catch((message) => {
            store.dispatch(error(message))
		});
	}
	function signout() {
		signOut(auth).catch((message) => {
            store.dispatch(error(message))
		});
	}
</script>

{#if $store.auth.signedIn !== true}
	<button on:click={signin}>Sign In</button>
{:else}
	<p>{$store.auth.email}</p>
	<button on:click={signout}>Sign Out</button>
{/if}
