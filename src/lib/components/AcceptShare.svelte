<script lang="ts">
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import List from '@smui/list';
	import { onMount } from 'svelte';
	import ListMenuItem from './ListMenuItem.svelte';
	import { accept_request } from './requests';

	let incomingRequests: { id: string; requestId: string; sharerId: string }[];

	function pendingRequests(requestId: string) {
		return (
			$store.requests.completedRequests.indexOf(requestId) === -1 &&
			$store.requests.requestIdToRequest[requestId].type === 'accept_pending_share'
		);
	}
	function revokeRequests(requestId: string) {
		return (
			$store.requests.completedRequests.indexOf(requestId) === -1 &&
			$store.requests.requestIdToRequest[requestId].type === 'revoke_share'
		);
	}

	function mapRequestIdToListShareRequestInfo(requestId: string) {
		const shareAction = $store.requests.requestIdToRequest[requestId];
		const id = shareAction.payload;
		return { id, requestId, sharerId: $store.requests.requestIdToUid[requestId] };
	}

	$: incomingRequests = $store.requests.incomingRequests
		.filter(pendingRequests)
		.map(mapRequestIdToListShareRequestInfo);
	$: revoked = $store.requests.incomingRequests
		.filter(revokeRequests)
		.map(mapRequestIdToListShareRequestInfo);
	onMount(() => {
		document.body.onpointermove = () => {
			if (revoked.length > 0) {
				const revokeMe = revoked[0];
				// first, actually do the requested revoke
				firebase.dispatch($store.requests.requestIdToRequest[revokeMe.requestId]);
				// then ack it and note that we completed it for ourselves
				const accept = accept_request({ id: revokeMe.requestId });
				firebase.request(revokeMe.sharerId, accept);
				firebase.dispatch(accept);
			}
		};
	});
</script>

<List>
	{#each incomingRequests as { id, requestId, sharerId } (id)}
		<ListMenuItem listId={id} {requestId} {sharerId} />
	{/each}
</List>
