<script lang="ts">
	import '../app.postcss';

	import {
		collection,
		query,
		onSnapshot,
		where,
		type Unsubscribe,
		orderBy,
		collectionGroup
	} from 'firebase/firestore';
	import { store } from '$lib/store';
	import firebase from '$lib/firebase';
	import Login from '$lib/components/Login.svelte';
	import { add_user } from '$lib/components/users';
	import type { AuthState } from '$lib/components/auth';

	let unsubscribeUsers: Unsubscribe | undefined = undefined;
	let unsubscribeActions: Unsubscribe | undefined = undefined;
	$: if ($store.auth.signedIn && !unsubscribeUsers) {
		const user = $store.auth;
		if (user.uid) {
			const users = collection(firebase.firestore, 'users');
			unsubscribeUsers = onSnapshot(query(users), (querySnapshot) => {
				querySnapshot.docChanges().forEach((change) => {
					if (change.type === 'added') {
						let doc = change.doc;
						console.log(doc.data());
						store.dispatch(add_user(doc.data()));
					}
				});
			});

			const actions = collectionGroup(firebase.firestore, 'requests');
			const q = query(actions, where('target', '==', user.uid), orderBy('timestamp'));
			unsubscribeActions = onSnapshot(q, (querySnapshot) => {
				querySnapshot.docChanges().forEach((change) => {
					if (change.type === 'added') {
						let doc = change.doc;
						let data = { ...doc.data() };
						if (data.timestamp) {
							console.log('server side data: ', data);
							data.timestamp = data.timestamp.seconds;
						} else {
							console.log('client side data: ', data);
						}
						store.dispatch(data);
					}
				});
			});
		} else if (!$store.auth.signedIn) {
			if (unsubscribeUsers) {
				unsubscribeUsers();
				unsubscribeUsers = undefined;
			}
			if (unsubscribeActions) {
				unsubscribeActions();
				unsubscribeActions = undefined;
			}
		}
	}

	let loading = true;
</script>

{#if loading || $store.auth.signedIn === undefined}
	Loading...
	<div style="display: none"><Login />{[(loading = false)]}</div>
{:else}
	<slot />
{/if}
