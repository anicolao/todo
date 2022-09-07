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
	import { store } from '../store';
	import firebase from '../firebase';
	import Login from '../components/Login.svelte';

	let unsubscribe: Unsubscribe | undefined = undefined;
	$: if ($store.auth.signedIn && !unsubscribe) {
		const user = $store.auth;
		if (user.uid) {
			const actions = collection(firebase.firestore, 'visible', user.uid, 'actions');
			const q = query(actions, orderBy('timestamp'));
			unsubscribe = onSnapshot(q, (querySnapshot) => {
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
		} else if (unsubscribe) {
			unsubscribe();
			unsubscribe = undefined;
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
