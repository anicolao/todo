<script>
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import { collection, addDoc, setDoc, doc } from 'firebase/firestore';
	import Button, { Label } from '@smui/button';

	const auth = firebase.auth;
	const gAuthProvider = firebase.google_auth_provider;
	import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
	import { error, signed_in, signed_out } from '$lib/components/auth';
	onAuthStateChanged(auth, (user) => {
		if (user) {
			const uid = user.uid;
			store.dispatch(
				signed_in({
					uid: uid,
					name: user.displayName,
					email: user.email,
					photo: user.photoURL,
					signedIn: true,
					authMessage: ''
				})
			);
			if (user.email) {
				// always true
				setDoc(doc(firebase.firestore, 'users', user.email), {
					uid: user.uid,
					name: user.displayName,
					email: user.email,
					photo: user.photoURL,
					activity_timestamp: new Date().getTime()
				}).catch((message) => {
					// TODO: Surface this error state in the UI.
					console.error(message);
				});
			}
		} else {
			store.dispatch(signed_out());
		}
	});

	function signin() {
		signInWithPopup(auth, gAuthProvider).catch((message) => {
			store.dispatch(error(message));
		});
	}
	function signout() {
		signOut(auth).catch((message) => {
			store.dispatch(error(message));
		});
	}
</script>

{#if $store.auth.signedIn !== true}
	<Button on:click={signin}>
		<Label>Sign In</Label>
		<i class="material-icons" aria-hidden="true">arrow_forward</i>
	</Button>
{:else}
	<p><img src={$store.auth.photo} referrerpolicy="no-referrer" />{$store.auth.email}</p>
	<p>{$store.auth.name}</p>
	<button on:click={signout}>Sign Out</button>
{/if}
