<script lang="ts">
	console.log('AcceptShare.svelte');
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import List from '@smui/list';
	import { onMount } from 'svelte';
	import ListMenuItem from './ListMenuItem.svelte';
	import { accept_request } from './requests';
	import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';

	let incomingRequests: { id: string; requestId: string; sharerId: string }[];

	function pendingRequests(requestId: string) {
		return (
			$store.requests.completedRequests.indexOf(requestId) === -1 &&
			$store.requests.requestIdToRequest[requestId].type === 'accept_pending_share'
		);
	}
	function makePendingRequestFilter() {
		const previouslySeen: { [k: string]: boolean } = {};
		return (requestId: string) => {
			if (previouslySeen[requestId] === true) {
				return false;
			}
			previouslySeen[requestId] = true;
			return pendingRequests(requestId);
		};
	}

	function mapRequestIdToListShareRequestInfo(requestId: string) {
		const shareAction = $store.requests.requestIdToRequest[requestId];
		const id =
			typeof shareAction.payload === 'string' ? shareAction.payload : shareAction.payload.id;
		return { id, requestId, sharerId: $store.requests.requestIdToUid[requestId] };
	}

	$: incomingRequests = $store.requests.incomingRequests
		.filter(makePendingRequestFilter())
		.map(mapRequestIdToListShareRequestInfo);
	onMount(() => {
		const processing = new Set<string>();
		const failed = new Set<string>();
		const process = () => {
			const state = store.getState();
			const uid = state.auth.uid;
			if (!uid) return;
			for (const id of state.requests.incomingRequests) {
				const action = state.requests.requestIdToRequest[id];
				if (
					action?.type !== 'revoke_share' ||
					state.requests.completedRequests.includes(id) ||
					processing.has(id) ||
					failed.has(id)
				)
					continue;
				processing.add(id);
				const batch = writeBatch(firebase.firestore);
				const add = (target: string, suffix: string, value: object) =>
					batch.set(
						doc(firebase.firestore, 'from', uid, 'to', target, 'requests', `${id}-${suffix}`),
						{ ...value, creator: uid, target, timestamp: serverTimestamp() }
					);
				add(uid, 'remove', action);
				const ack = accept_request({ id });
				add(uid, 'accepted', ack);
				add(state.requests.requestIdToUid[id], 'accepted', ack);
				batch.commit().catch((error) => {
					processing.delete(id);
					failed.add(id);
					console.error('Could not apply list removal', error);
				});
			}
		};
		const unsubscribe = store.subscribe(process);
		const retry = () => {
			failed.clear();
			process();
		};
		window.addEventListener('online', retry);
		return () => {
			unsubscribe();
			window.removeEventListener('online', retry);
		};
	});
</script>

<List>
	{#each incomingRequests as { id, requestId, sharerId } (id)}
		<ListMenuItem listId={id} {requestId} {sharerId} />
	{/each}
</List>
