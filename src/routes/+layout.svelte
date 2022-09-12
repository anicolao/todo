<script lang="ts">
	import '../app.postcss';

	import {
		collection,
		query,
		onSnapshot,
		where,
		type Unsubscribe,
		orderBy
	} from 'firebase/firestore';
	import { store } from '$lib/store';
	import firebase from '$lib/firebase';
	import Login from '$lib/components/Login.svelte';
	import { add_user } from '$lib/components/users';
	import type { AuthState } from '$lib/components/auth';

	let unsubscribe: Unsubscribe | undefined = undefined;
	$: if ($store.auth.signedIn && !unsubscribe) {
		const user = $store.auth;
		if (user.uid) {
			const users = collection(firebase.firestore, 'users');
			unsubscribe = onSnapshot(query(users), (querySnapshot) => {
				querySnapshot.docChanges().forEach((change) => {
					if (change.type === 'added') {
						let doc = change.doc;
						console.log(doc.data());
						store.dispatch(add_user(doc.data()));
					}
				});
			});
		} else if (unsubscribe) {
			unsubscribe();
			unsubscribe = undefined;
		}
	}

	let lastObservedUsers: AuthState[] = [];
	$: if ($store.auth.signedIn && $store.users) {
		const user = $store.auth;
		if ($store.users.users !== lastObservedUsers) {
			console.log('Users now known: ', $store.users.users);
			$store.users.users.forEach((fromUser) => {
				if (!fromUser.uid || !user.uid) return;
				const actions = collection(
					firebase.firestore,
					'requests',
					fromUser.uid,
					'to',
					user.uid,
					'actions'
				);
				const q = query(actions, orderBy('timestamp'));
				const unsub = onSnapshot(q, (querySnapshot) => {
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
			});
		}
		lastObservedUsers = $store.users.users;
	}

	let loading = true;
</script>

{#if loading || $store.auth.signedIn === undefined}
	Loading...
	<div style="display: none"><Login />{[(loading = false)]}</div>
{:else}
	<slot />
{/if}
