<script lang="ts">
	console.log('AcceptShare.svelte');
	import { store } from '$lib/store';
	import List from '@smui/list';
	import ListMenuItem from './ListMenuItem.svelte';
</script>

<List>
	{#each $store.lists.pendingShares as { id, sharerId } (id)}
		<ListMenuItem listId={id} {sharerId} />
	{/each}
</List>
