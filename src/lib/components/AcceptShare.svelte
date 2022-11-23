<script lang="ts">
	console.log('AcceptShare.svelte');
	import { store } from '$lib/store';
	import List from '@smui/list';
	import ListMenuItem from './ListMenuItem.svelte';
</script>

<List>
	{#each $store.lists.pendingShares as { id, name, sharerId } (id)}
		<ListMenuItem listId={id} sharing={true} />
	{/each}
</List>
