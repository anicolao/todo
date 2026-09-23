<script lang="ts">
	import '../safe-area.css';
	console.log('src/routes/+layout.svelte');
	import { goto } from '$app/navigation';
	import { signed_in, signed_out } from '$lib/components/auth';
	import firebase from '$lib/firebase';
	import { getNotificationCoordinator } from '$lib/notifications';
	import { store } from '$lib/store';
	import { onMount } from 'svelte';
	import { onAuthStateChanged } from 'firebase/auth';
	import { doc, setDoc } from 'firebase/firestore';

	const notifications = getNotificationCoordinator({
		disabled: import.meta.env.VITE_DISABLE_NOTIFICATIONS === 'true',
		messaging: firebase.messaging,
		vapidKey: firebase.vapidKey
	});

	async function persistNotificationToken(token: string) {
		const user = firebase.auth.currentUser;
		if (!user?.email) return;
		await setDoc(
			doc(firebase.firestore, 'users', user.email),
			{
				notificationToken: token,
				activity_timestamp: new Date().getTime()
			},
			{ merge: true }
		);
	}

	onMount(() => {
		console.log('src/routes/+layout.svelte set up auth state callback');
		const stopTokenUpdates = notifications.onToken(persistNotificationToken);
		const stopForegroundRefresh = notifications.startForegroundRefresh(
			() => firebase.auth.currentUser !== null
		);
		const unsubscribeAuth = onAuthStateChanged(firebase.auth, async (user) => {
			if (user) {
				console.log('src/routes/+layout.svelte onAuthStateChanged   sign in ');
				store.dispatch(
					signed_in({
						uid: user.uid,
						name: user.displayName,
						email: user.email,
						photo: user.photoURL,
						signedIn: true,
						authMessage: ''
					})
				);
				if (user.email) {
					await setDoc(
						doc(firebase.firestore, 'users', user.email),
						{
							uid: user.uid,
							name: user.displayName,
							email: user.email,
							photo: user.photoURL,
							activity_timestamp: new Date().getTime()
						},
						{ merge: true }
					).catch((message) => console.error('Could not update the user profile.', message));
					void notifications.register();
				}
			} else {
				console.log('src/routes/+layout.svelte onAuthStateChanged   sign out ');
				store.dispatch(signed_out());
			}
		});
		return () => {
			unsubscribeAuth();
			stopForegroundRefresh();
			stopTokenUpdates();
		};
	});

	$: if ($store.auth.signedIn === false) {
		console.log('...redirect to /login', { 'signedIn?': $store.auth.signedIn });
		goto('/login');
	}
</script>

<svelte:head><title>Todo</title></svelte:head>
<slot />
