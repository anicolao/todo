<script lang="ts">
	console.log('src/routes/+layout.svelte');
	import { goto } from '$app/navigation';
	import { signed_in, signed_out } from '$lib/components/auth';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import { onAuthStateChanged } from 'firebase/auth';
	import { doc, setDoc } from 'firebase/firestore';

	let count = 0;
	function load() {
		console.log('/+layout.ts load function', count++);
		const auth = firebase.auth;
		console.log('/+layout.ts set up auth state callback');
		/*const unsubAuth =*/ onAuthStateChanged(auth, (user) => {
			if (user) {
				console.log('/+layout.ts auth callback for user ', { user });
				const uid = user.uid;
				console.log('/+layout.ts onAuthStateChanged   sign in ');
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
				console.log('/+layout.ts onAuthStateChanged   sign out ');
				store.dispatch(signed_out());
			}
		});
		// onDestroy(unsubAuth);
	}
	load();

	$: if ($store.auth.signedIn === false) {
		console.log('...redirect to /login', { 'signedIn?': $store.auth.signedIn });
		goto('/login');
	}
</script>

<svelte:head><title>Todo</title></svelte:head>
<slot />
